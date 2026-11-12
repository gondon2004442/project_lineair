/**
 * АРСЕНАЛ. Что каждая форма делает за секунду боя.
 *
 * Стенд не судит о балансе — он его показывает: обойма, запас, урон в
 * секунду по ставке на трёх дистанциях и время, за которое форма
 * снимает инспектора. Форма, которая не делает ничего, видна сразу.
 *
 * Запуск: node tools/arsenal.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair, T = L.tuning;
  const беды = [];
  const таблица = {};

  const стенд = () => {
    const w = L.createWorld(4242, L.world().input);
    L.startRun(w);
    const h = w.health.get(w.player);
    h.max = 1e5;
    h.hp = 1e5;
    L.enterRoom(w, 1, null);
    // Пустая комната: мешать мерить некому и нечему.
    for (const [e] of [...w.staffC]) {
      w.staffC.delete(e); w.transform.delete(e); w.body.delete(e);
      w.health.delete(e); w.drawC.delete(e);
      w.internC.delete(e); w.inspectorC.delete(e); w.registrarC.delete(e);
      w.auditorC.delete(e); w.chiefC.delete(e); w.courierC.delete(e);
    }
    for (const [e] of [...w.propC]) {
      w.propC.delete(e); w.transform.delete(e); w.body.delete(e);
      w.health.delete(e); w.drawC.delete(e);
    }
    // Все формы на руках: меряем оружие, а не выдачу.
    w.forms = w.forms.map(() => true);
    return w;
  };

  // Урон по ставке за N секунд с заданного расстояния.
  const урон = (idФормы, дистанция, секунд) => {
    const w = стенд();
    const p = w.playerC.get(w.player);
    const индекс = L.forms.findIndex((f) => f.id === idФормы);
    p.form = индекс;
    p.switchCooldown = 0;
    p.fireCooldown = 0;
    p.ammo[индекс] = T.weapon[idФормы]?.ammoMax ?? 10;
    p.reserve[индекс] = 999;
    const t = w.transform.get(w.player);
    const центр = { x: (w.map.cols / 2) * w.map.size, y: (w.map.rows / 2) * w.map.size };
    t.x = центр.x - дистанция;
    t.y = центр.y;
    t.px = t.x;
    t.py = t.y;
    // Мишень — инспектор с огромной прочностью и замороженный: он здесь
    // не противник, а измерительный прибор.
    const цель = L.spawnStaff(w, 'inspector', 1, центр.x, центр.y);
    const hp = w.health.get(цель);
    hp.max = 1e6;
    hp.hp = 1e6;
    const s = w.staffC.get(цель);
    const было = hp.hp;
    // Зарядная стреляет не нажатием, а отпусканием: держим до полного
    // заряда и отпускаем. Остальные формы это не ломает.
    const заряд = idФормы === 'lance' ? Math.round((T.weapon.lance.chargeTime + 0.1) * 60) : 0;
    for (let i = 0; i < 60 * секунд; i++) {
      s.frozen = 10;
      w.input.aimX = центр.x;
      w.input.aimY = центр.y;
      const отпустить = заряд > 0 && i % (заряд + 3) >= заряд;
      w.input.fireHeld = !отпустить;
      w.input.firePressed = заряд > 0 ? false : i % 2 === 0;
      w.input.fireAge = 0;
      if ((p.ammo[p.form] ?? 0) <= 0) { w.input.reloadQueued = true; w.input.reloadAge = 0; }
      L.step(w);
    }
    w.input.fireHeld = false;
    w.input.firePressed = false;
    return (было - w.health.get(цель).hp) / секунд;
  };

  for (const форма of L.forms) {
    const cfg = T.weapon[форма.id] ?? {};
    const близко = урон(форма.id, 90, 4);
    const средне = урон(форма.id, 260, 4);
    const далеко = урон(форма.id, 440, 4);
    const ставка = T.post.inspector.hp;
    таблица[`${форма.code} ${форма.title}`] = {
      обойма: cfg.ammoMax ?? '—',
      запас: cfg.infiniteReserve > 0 ? 'бездонный' : (cfg.reserveMax ?? '—'),
      перезарядка: cfg.reloadTime ?? '—',
      уронВСекунду: {
        '90px': +близко.toFixed(1),
        '260px': +средне.toFixed(1),
        '440px': +далеко.toFixed(1),
      },
      инспекторЗа: близко > 0 ? `${(ставка / близко).toFixed(1)} с` : 'никогда',
    };
    if (близко <= 0 && средне <= 0 && далеко <= 0) {
      беды.push(`форма ${форма.code} ${форма.title} не наносит урона вовсе`);
    }
  }

  return { беды, таблица };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
