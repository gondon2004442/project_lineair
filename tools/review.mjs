/**
 * ПРОХОД ПО БЕДАМ. Короткие проверки того, что уже ломалось.
 *
 * Каждая — про один отказ, который однажды нашёлся: распоряжения,
 * пережившие начальника; мишень в пустоте; падение по кругу; проём в
 * самого себя; снятые, которые продолжают стрелять; назначение, которое
 * не кончается; счёт, который удваивается на возврате; дело, которое
 * подбирается дважды; снаряд, гаснущий о дыру. Плюс цена шага.
 *
 * Запуск: node tools/review.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair, T = L.tuning;
  const беды = [], заметки = [];
  const мир = (посевная, глубина) => {
    const w = L.createWorld(посевная ?? 4242, L.world().input);
    L.startRun(w);
    const h = w.health.get(w.player);
    h.max = 1e5;
    h.hp = 1e5;
    for (let d = -1; d > (глубина ?? -1); d--) { w.seals.push(w.depth); L.descend(w); }
    return w;
  };
  const шаги = (w, n) => { for (let i = 0; i < n; i++) L.step(w); };
  // Этаж сдаётся так же, как у игрока: штат снят, печать поднята руками.
  const сдатьЭтаж = (w) => {
    L.enterRoom(w, w.floor.end, null);
    for (let i = 0; i < 900; i++) {
      for (const [e, s] of [...w.staffC]) {
        if (s.retired) continue;
        const hh = w.health.get(e);
        if (hh !== undefined) hh.hp = 0;
      }
      L.step(w);
      if (w.staffC.size === 0) break;
    }
    const печать = [...w.stashC].find(([, s]) => s.kind === 'seal' && !s.opened);
    if (печать !== undefined) {
      const t = w.transform.get(печать[0]);
      const pt = w.transform.get(w.player);
      pt.x = t.x; pt.y = t.y; pt.px = t.x; pt.py = t.y;
      w.input.useQueued = true;
      L.step(w);
    }
    шаги(w, 900);
  };

  // 1. Листы кадровика не переживают своего начальника.
  {
    const w = мир(4242, -3);
    L.enterRoom(w, w.floor.end, null);
    шаги(w, 60 * 20);
    const приЖизни = w.orderC.size;
    for (const [e, s] of [...w.staffC]) {
      if (s.post !== 'personnel') continue;
      const h = w.health.get(e);
      if (h !== undefined) h.hp = 0;
    }
    шаги(w, 60 * 3);
    заметки.push(`листов при жизни ${приЖизни}, после смерти ${w.orderC.size}`);
    if (w.orderC.size > 0) беды.push('распоряжения действуют после смерти начальника');
  }

  // 2. Мишени аттестации не оказываются в пустоте: иначе не сдать.
  {
    let вПустоте = 0, всего = 0, испытаний = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = мир(seed * 1013, -5);
      for (const r of w.floor.rooms) {
        if (L.trialOf(w, r.index)?.id !== 'targets') continue;
        L.enterRoom(w, r.index, null);
        шаги(w, 5);
        испытаний += 1;
        for (const [e] of w.targetC) {
          всего += 1;
          const t = w.transform.get(e);
          if (t !== undefined && L.isSolidPoint(w.map, t.x, t.y)) вПустоте += 1;
        }
      }
    }
    заметки.push(`мишеней ${всего} на ${испытаний} испытаниях, в пустоте ${вПустоте}`);
    if (вПустоте > 0) беды.push('мишень аттестации стоит в пустоте — испытание не сдать');
  }

  // 3. Падение не зацикливается: точка возврата всегда на плите.
  {
    const w = мир(4242, -5);
    L.enterRoom(w, 1, null);
    for (const [e] of [...w.staffC]) {
      w.staffC.delete(e); w.transform.delete(e); w.body.delete(e);
      w.health.delete(e); w.drawC.delete(e);
    }
    const h = w.health.get(w.player);
    h.max = 1e5;
    h.hp = 1e5;
    const p = w.playerC.get(w.player);
    let падений = 0;
    for (let k = 0; k < 10; k++) {
      w.input.moveX = 1;
      w.input.moveY = 0;
      for (let i = 0; i < 300; i++) {
        L.step(w);
        if (p.fallTimer > 0) { падений += 1; break; }
      }
      w.input.moveX = 0;
      шаги(w, 70);
    }
    const t = w.transform.get(w.player);
    заметки.push(`падений ${падений}, после них в пустоте: ${L.isSolidPoint(w.map, t.x, t.y)}`);
    if (L.isSolidPoint(w.map, t.x, t.y)) беды.push('после падения субъект остаётся в пустоте');
    if (w.status === 'dead') беды.push('падение убило субъекта');
  }

  // 4. Переадресация не замыкает дверь на саму комнату.
  {
    let самозамыканий = 0, проверено = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = мир(seed * 1013, -3);
      for (const r of w.floor.rooms) {
        for (let dir = 0; dir < 4; dir++) {
          if (r.neighbors[dir] < 0) continue;
          проверено += 1;
          if (L.linkOf(w, r.index, dir) === r.index) самозамыканий += 1;
        }
      }
    }
    заметки.push(`проёмов ${проверено}, ведущих в своё же помещение ${самозамыканий}`);
    if (самозамыканий > 0) беды.push('проём ведёт в то же самое помещение');
  }

  // 5. Снятые с должности не стреляют.
  {
    const w = мир(4242, -1);
    const сосед = w.floor.rooms.find(
      (r) => r.kind !== 'start' && r.index !== w.floor.end && !r.corridor,
    );
    сдатьЭтаж(w);
    L.enterRoom(w, сосед.index, null);
    шаги(w, 30);
    const было = new Set([...w.bulletC.keys()]);
    let чужих = 0;
    for (let i = 0; i < 300; i++) {
      L.step(w);
      for (const [e, b] of w.bulletC) {
        if (b.faction === 'enemy' && !было.has(e)) { было.add(e); чужих += 1; }
      }
    }
    const снятых = [...w.staffC.values()].filter((s) => s.retired).length;
    заметки.push(`снятых ${снятых}, снарядов от них ${чужих}`);
    if (чужих > 0) беды.push('снятые с должности продолжают стрелять');
  }

  // 6. Назначение кончается само и не запирает помещение навсегда.
  {
    const w = мир(4242, -3);
    L.enterRoom(w, 1, null);
    w.appointed = 0.5;
    шаги(w, 120);
    заметки.push(`назначение через 2 с: ${w.appointed.toFixed(2)}`);
    if (w.appointed > 0) беды.push('назначение не кончается само');
  }

  // 7. Возврат в помещение не удваивает счёт снятых.
  {
    const w = мир(4242, -1);
    сдатьЭтаж(w);
    const сосед = w.floor.rooms.find(
      (r) => r.kind !== 'start' && r.index !== w.floor.end && !r.corridor,
    );
    L.enterRoom(w, сосед.index, null);
    шаги(w, 30);
    const первый = w.record.retired;
    const другая = w.floor.rooms.find((r) => r.index !== сосед.index);
    L.enterRoom(w, другая.index, null);
    L.enterRoom(w, сосед.index, null);
    шаги(w, 30);
    заметки.push(`снято с должности: ${первый} → ${w.record.retired} после возврата`);
    if (w.record.retired > первый) беды.push('возврат в помещение удваивает счёт снятых');
  }

  // 8. Дела спасённых не дублируются при повторном подборе.
  {
    const w = мир(4242, -1);
    сдатьЭтаж(w);
    const сосед = w.floor.rooms.find(
      (r) => r.kind !== 'start' && r.index !== w.floor.end && !r.corridor,
    );
    const подобрать = () => {
      L.enterRoom(w, сосед.index, null);
      шаги(w, 10);
      for (const [e, s] of [...w.stashC]) {
        if (s.kind !== 'saved') continue;
        const t = w.transform.get(e), pt = w.transform.get(w.player);
        pt.x = t.x; pt.y = t.y; pt.px = t.x; pt.py = t.y;
        w.input.useQueued = true;
        L.step(w);
      }
    };
    подобрать();
    const первое = w.savedCases.length;
    L.enterRoom(w, w.floor.end, null);
    подобрать();
    заметки.push(`дел на руках: ${первое} → ${w.savedCases.length} после возврата`);
    if (w.savedCases.length > первое) беды.push('дело спасённого подбирается дважды');
  }

  // 9. Снаряд идёт над пустотой натурной части и гаснет о бетон обычного
  //    этажа. Однажды пустота гасила его наравне со стеной, и аттестация
  //    «стрельба по движущемуся» становилась несдаваемой.
  {
    const выстрелЧерез = (глубина) => {
      const w = мир(7777, глубина);
      L.enterRoom(w, 1, null);
      шаги(w, 10);
      for (const [e] of [...w.staffC]) {
        w.staffC.delete(e); w.transform.delete(e); w.body.delete(e);
        w.health.delete(e); w.drawC.delete(e);
      }
      for (const [e] of [...w.propC]) {
        w.propC.delete(e); w.transform.delete(e); w.body.delete(e);
        w.health.delete(e); w.drawC.delete(e);
      }
      const tile = w.map.size;
      const цел = (cx, cy) => !L.isSolidPoint(w.map, (cx + 0.5) * tile, (cy + 0.5) * tile);
      let точка = null;
      for (let cy = 1; cy < w.map.rows - 1 && точка === null; cy++) {
        for (let cx = 1; cx < w.map.cols - 2; cx++) {
          if (!цел(cx, cy) || цел(cx + 1, cy)) continue;
          let k = 1;
          while (cx + k < w.map.cols - 1 && !цел(cx + k, cy)) k += 1;
          if (cx + k < w.map.cols - 1) {
            точка = { x: (cx + 0.5) * tile, y: (cy + 0.5) * tile };
            break;
          }
        }
      }
      if (точка === null) return -1;
      const t = w.transform.get(w.player), p = w.playerC.get(w.player);
      t.x = точка.x; t.y = точка.y; t.px = t.x; t.py = t.y;
      p.safeX = t.x; p.safeY = t.y; p.fallTimer = 0;
      p.fireCooldown = 0; p.reloading = false; p.ammo[p.form] = 20;
      w.input.aimX = точка.x + 1000;
      w.input.aimY = точка.y;
      const было = new Set([...w.bulletC.keys()]);
      w.input.fireHeld = true; w.input.firePressed = true; w.input.fireAge = 0;
      L.step(w);
      w.input.fireHeld = false; w.input.firePressed = false;
      const наш = [...w.bulletC.keys()].find((e) => !было.has(e));
      if (наш === undefined) return 0;
      let дальше = 0;
      for (let i = 0; i < 90; i++) {
        L.step(w);
        const tt = w.transform.get(наш);
        if (tt === undefined || !w.bulletC.has(наш)) break;
        дальше = Math.round(tt.x - точка.x);
      }
      return дальше;
    };
    const пустота = выстрелЧерез(-5);
    const бетон = выстрелЧерез(-2);
    заметки.push(`снаряд через пустоту ${пустота} px, через бетон ${бетон} px`);
    if (пустота <= 0) беды.push('снаряд гаснет о пустоту натурной части');
    if (бетон > 0) беды.push('снаряд проходит сквозь бетон');
  }

  // 10. Цена шага не выросла.
  {
    const w = мир(4242, -5);
    L.enterRoom(w, w.floor.end, null);
    const времена = [];
    const t0 = performance.now();
    for (let i = 0; i < 1800; i++) {
      const a = performance.now();
      L.step(w);
      времена.push(performance.now() - a);
    }
    const всего = performance.now() - t0;
    // По худшему шагу судить нельзя: раз в несколько прогонов в него
    // попадает сборка мусора, и стенд начинает врать. Смотрим на сумму
    // и на 99-й процентиль, а худший оставляем в заметке как есть.
    времена.sort((a, b) => a - b);
    const p99 = времена[Math.floor(времена.length * 0.99)];
    const худший = времена[времена.length - 1];
    заметки.push(
      `1800 шагов за ${всего.toFixed(0)} мс, 99-й процентиль ${p99.toFixed(2)} мс, ` +
        `худший ${худший.toFixed(2)} мс`,
    );
    if (p99 > 2) беды.push(`99-й процентиль шага ${p99.toFixed(2)} мс`);
    if (всего > 600) беды.push(`1800 шагов за ${всего.toFixed(0)} мс`);
  }

  return { беды, заметки };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
