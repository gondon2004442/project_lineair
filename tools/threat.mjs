/**
 * УГРОЗА. Чем опасна каждая должность, если стоять и не уворачиваться.
 *
 * Стенд ставит одну ставку против неподвижного субъекта и считает, что
 * она успеет сделать за пятнадцать секунд: снарядов, урона, на какой
 * дистанции держится. Должность, которая не делает ничего, видна сразу
 * — как и та, что снимает субъекта за секунду.
 *
 * Запуск: node tools/threat.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair, T = L.tuning;
  const беды = [], таблица = {};

  const стенд = (глубина) => {
    const w = L.createWorld(4242, L.world().input);
    L.startRun(w);
    for (let d = -1; d > глубина; d--) { w.seals.push(w.depth); L.descend(w); }
    L.enterRoom(w, 1, null);
    for (const [e] of [...w.staffC]) {
      w.staffC.delete(e); w.transform.delete(e); w.body.delete(e);
      w.health.delete(e); w.drawC.delete(e);
      w.internC.delete(e); w.inspectorC.delete(e); w.registrarC.delete(e);
      w.auditorC.delete(e); w.chiefC.delete(e); w.courierC.delete(e);
      w.archivistC?.delete(e); w.keeperC?.delete(e);
      w.commissionC?.delete(e); w.personnelC?.delete(e);
    }
    // Мебель не убираем: шкафы — оружие управляющего делами, без них
    // стенд объявил бы его бездельником.
    const h = w.health.get(w.player);
    h.max = 1e5;
    h.hp = 1e5;
    return w;
  };

  for (const post of L.posts) {
    // Начальники живут глубже: на -1 их поведение может не завестись.
    const глубина = ['archivist', 'keeper', 'commission', 'personnel'].includes(post.id) ? -3 : -1;
    const w = стенд(глубина);
    const центр = { x: (w.map.cols / 2) * w.map.size, y: (w.map.rows / 2) * w.map.size };
    const t = w.transform.get(w.player);
    t.x = центр.x - 200;
    t.y = центр.y;
    t.px = t.x;
    t.py = t.y;
    // Комиссия заседает втроём: по одному она и не должна ничего
    // делать, это не должность, а состав.
    const сколько = post.id === 'commission' ? 3 : 1;
    const свои = [];
    for (let k = 0; k < сколько; k++) {
      свои.push(L.spawnStaff(w, post.id, 1, центр.x + k * 60, центр.y));
    }
    const e = свои[0];
    const hp0 = w.health.get(w.player).hp;
    const было = new Set([...w.bulletC.keys()]);
    let снарядов = 0, ближе = 1e9, дальше = 0, прошёл = 0, листов = 0, рельсов = 0;
    let px = w.transform.get(e)?.x ?? 0, py = w.transform.get(e)?.y ?? 0;
    for (let i = 0; i < 60 * 15; i++) {
      L.step(w);
      for (const [b, пуля] of w.bulletC) {
        if (пуля.faction === 'enemy' && !было.has(b)) { было.add(b); снарядов += 1; }
      }
      листов = Math.max(листов, w.orderC.size);
      рельсов = Math.max(рельсов, w.railC.size);
      const tt = w.transform.get(e);
      if (tt !== undefined) {
        const d = Math.hypot(tt.x - t.x, tt.y - t.y);
        ближе = Math.min(ближе, d);
        дальше = Math.max(дальше, d);
        прошёл += Math.hypot(tt.x - px, tt.y - py);
        px = tt.x;
        py = tt.y;
      }
    }
    const урон = hp0 - w.health.get(w.player).hp;
    таблица[`${post.title}`] = {
      уронЗа15с: Math.round(урон),
      снарядов,
      листов,
      шкафовНаХоду: рельсов,
      прошёлPx: Math.round(прошёл),
      дистанция: ближе > 1e8 ? 'сгинул' : `${Math.round(ближе)}–${Math.round(дальше)} px`,
      прочность: T.post[post.id].hp,
    };
    // Должность может не наносить урона по замыслу — стажёр не атакует
    // вовсе. Беда — когда она не делает ВООБЩЕ ничего: не стреляет, не
    // ходит, не выпускает бумаг и не двигает мебель.
    if (урон <= 0 && снарядов === 0 && листов === 0 && рельсов === 0 && прошёл < 10) {
      беды.push(`должность ${post.title} не делает ничего за пятнадцать секунд`);
    }
  }

  return { беды, таблица };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
