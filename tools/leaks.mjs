/**
 * ТЕЧИ. Что в мире не убирается за собой.
 *
 * Десять минут боя в одном помещении и сотня переходов между
 * помещениями: число записей в каждом хранилище должно вернуться к
 * тому, с чего начинали. Утечка видна не сразу — она выстреливает на
 * длинном забеге, когда кадр уже не вытягивает.
 *
 * Запуск: node tools/leaks.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair;
  const беды = [], заметки = [];
  // Все хранилища мира разом: Map с размером и ничего больше.
  const слепок = (w) => {
    const out = {};
    for (const ключ of Object.keys(w)) {
      const v = w[ключ];
      if (v instanceof Map) out[ключ] = v.size;
    }
    // Следы — не течь: рассыпанная картотека лежит до конца участка
    // по замыслу, как и обломки разбитой мебели. Считаем отдельно
    // целое оборудование: вот оно само по себе появляться не должно.
    let целых = 0, следов = 0;
    for (const [, f] of w.fixtureC) {
      if (f.toppled) следов += 1;
      else целых += 1;
    }
    out.fixtureC = целых;
    out.следовОставлено = следов;
    return out;
  };
  // Что расти имеет право и почему.
  const ЗАКОННЫЕ = new Set([
    'следовОставлено', // след от разбитого: лежит до конца участка
    'stashC', // печать падает на пол со смертью начальника
    'spillC', // пятна на полу — тот же след
  ]);
  const разница = (до, после) => {
    const растёт = [];
    for (const ключ of Object.keys(после)) {
      if (ЗАКОННЫЕ.has(ключ)) continue;
      const d = после[ключ] - (до[ключ] ?? 0);
      if (d > 0) растёт.push(`${ключ} ${до[ключ] ?? 0} → ${после[ключ]}`);
    }
    return растёт;
  };

  // 1. Десять минут боя в приёмной: тела убираются, снаряды гаснут.
  {
    const w = L.createWorld(4242, L.world().input);
    L.startRun(w);
    const h = w.health.get(w.player);
    h.max = 1e6;
    h.hp = 1e6;
    for (let d = -1; d > -2; d--) { w.seals.push(w.depth); L.descend(w); }
    L.enterRoom(w, w.floor.end, null);
    for (let i = 0; i < 120; i++) L.step(w);
    const до = слепок(w);
    // Бой: стреляем во все стороны и не даём штату кончиться.
    const p = w.playerC.get(w.player);
    const центр = { x: (w.map.cols / 2) * w.map.size, y: (w.map.rows / 2) * w.map.size };
    for (let i = 0; i < 60 * 600; i++) {
      const угол = i / 37;
      w.input.aimX = центр.x + Math.cos(угол) * 500;
      w.input.aimY = центр.y + Math.sin(угол) * 500;
      w.input.fireHeld = true;
      w.input.firePressed = i % 3 === 0;
      w.input.fireAge = 0;
      p.ammo[p.form] = 99;
      L.step(w);
    }
    w.input.fireHeld = false;
    w.input.firePressed = false;
    // Даём снарядам догореть и телам убраться.
    for (let i = 0; i < 600; i++) L.step(w);
    const после = слепок(w);
    const растёт = разница(до, после);
    заметки.push(
      `десять минут боя: ${растёт.length === 0 ? 'ничего не накопилось' : растёт.join('; ')}` +
        `, следов оставлено ${после.следовОставлено}, снарядов в воздухе ${w.bulletC.size}`,
    );
    if (w.bulletC.size > 0) беды.push(`после боя в воздухе осталось снарядов: ${w.bulletC.size}`);
    // Сущности мира за бой не должны копиться: снаряды гаснут, тела
    // убираются. Штат убывает — это не течь.
    for (const строка of растёт) беды.push(`за бой накопилось: ${строка}`);
  }

  // 2. Сто переходов между помещениями: хранилища возвращаются к себе.
  {
    const w = L.createWorld(4242, L.world().input);
    L.startRun(w);
    const h = w.health.get(w.player);
    h.max = 1e6;
    h.hp = 1e6;
    L.enterRoom(w, 1, null);
    for (let i = 0; i < 30; i++) L.step(w);
    const до = слепок(w);
    for (let k = 0; k < 100; k++) {
      const r = w.floor.rooms[k % w.floor.rooms.length];
      L.enterRoom(w, r.index, null);
      for (let i = 0; i < 10; i++) L.step(w);
    }
    L.enterRoom(w, 1, null);
    for (let i = 0; i < 30; i++) L.step(w);
    const после = слепок(w);
    const растёт = разница(до, после);
    заметки.push(`сто переходов: ${растёт.length === 0 ? 'ничего не накопилось' : растёт.join('; ')}`);
    for (const строка of растёт) беды.push(`за переходы накопилось: ${строка}`);
  }

  // 3. Десять забегов подряд: новый забег начинается с того же, с чего
  //    начинался первый.
  {
    const w = L.createWorld(4242, L.world().input);
    L.startRun(w);
    for (let i = 0; i < 30; i++) L.step(w);
    const до = слепок(w);
    for (let k = 0; k < 10; k++) {
      L.startRun(w);
      for (let d = -1; d > -3; d--) { w.seals.push(w.depth); L.descend(w); }
      L.enterRoom(w, w.floor.end, null);
      for (let i = 0; i < 300; i++) L.step(w);
    }
    L.startRun(w);
    for (let i = 0; i < 30; i++) L.step(w);
    const после = слепок(w);
    const растёт = разница(до, после);
    заметки.push(`десять забегов: ${растёт.length === 0 ? 'ничего не накопилось' : растёт.join('; ')}`);
    for (const строка of растёт) беды.push(`за забеги накопилось: ${строка}`);
  }

  return { беды, заметки };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
