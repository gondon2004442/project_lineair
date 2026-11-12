/**
 * ДЕТЕРМИНИЗМ. Один seed — один и тот же забег, всегда.
 *
 * Два мира с одной посевной прогоняются одинаковым вводом и должны
 * сойтись до последнего числа; третий с другой посевной — разойтись.
 * Это главная проверка проекта: всё случайное идёт через один PRNG, и
 * если сюда просочится Math.random или время, стенд это увидит.
 *
 * Запуск: node tools/determinism.mjs [шагов]
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const ШАГОВ = Number(process.argv[2] ?? 900);

const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(({ шагов }) => {
  const L = window.lineair;
  // Слепок мира числом: положения, прочности, снаряды, счётчики.
  const слепок = (w) => {
    let h = 2166136261;
    const взять = (v) => {
      h ^= Math.round(v * 1000) | 0;
      h = Math.imul(h, 16777619);
    };
    взять(w.tick);
    взять(w.depth);
    взять(w.room);
    взять(w.tickets);
    взять(w.record.retired);
    взять(w.record.killed);
    взять(w.cleanse);
    for (const [e, t] of [...w.transform].sort((a, b) => a[0] - b[0])) {
      взять(e);
      взять(t.x);
      взять(t.y);
    }
    for (const [e, hp] of [...w.health].sort((a, b) => a[0] - b[0])) {
      взять(e);
      взять(hp.hp);
    }
    return h >>> 0;
  };
  // Один и тот же ввод на все миры: без него расходятся сами собой.
  const прогон = (посевная) => {
    const w = L.createWorld(посевная, L.world().input);
    L.startRun(w);
    // Меряем не пустой вестибюль: спускаемся к штату, чтобы в слепок
    // попали и должности, и снаряды, и перестройки.
    for (let d = -1; d > -3; d--) { w.seals.push(w.depth); L.descend(w); }
    L.enterRoom(w, w.floor.end, null);
    const h = w.health.get(w.player);
    h.max = 1e4;
    h.hp = 1e4;
    for (let i = 0; i < шагов; i++) {
      // Ввод — функция номера шага, а не случай: иначе сравнивать нечего.
      const фаза = i / 60;
      w.input.moveX = Math.sin(фаза);
      w.input.moveY = Math.cos(фаза * 0.7);
      w.input.aimX = 400 + Math.sin(фаза * 1.3) * 300;
      w.input.aimY = 300 + Math.cos(фаза * 1.1) * 200;
      w.input.fireHeld = i % 7 < 3;
      w.input.firePressed = i % 7 === 0;
      w.input.fireAge = 0;
      if (i % 120 === 0) { w.input.dashQueued = true; w.input.dashAge = 0; }
      L.step(w);
    }
    return { hash: слепок(w), tick: w.tick, сущностей: w.staffC.size, статус: w.status };
  };
  const a = прогон(4242);
  const b = прогон(4242);
  const c = прогон(31337);
  return { a, b, c, одинаково: a.hash === b.hash, разные: a.hash !== c.hash };
}, { шагов: ШАГОВ });

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
const ок = out.одинаково && out.разные && errors.length === 0;
console.log(ок ? 'ДЕТЕРМИНИЗМ НА МЕСТЕ' : 'ДЕТЕРМИНИЗМ СЛОМАН');
process.exit(ок ? 0 : 1);
