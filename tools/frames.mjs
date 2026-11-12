/**
 * КАДРЫ. Что видно на каждом этаже и что видно в красном.
 *
 * Стенд снимает приёмную каждого этажа и считает по точкам: средняя
 * светлота (палитра глубины), доля красного (красное — только
 * субъект), доля золота (кромка плиты на натурной части), доля глухой
 * тьмы (искажение бойлерной). Сломанный кадр — равномерная заливка —
 * виден сразу по числу оттенков.
 *
 * Снимки остаются в tools/.frames/ — их можно посмотреть глазами.
 *
 * Запуск: node tools/frames.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { открытьИгру } from './browser.mjs';
import { decodePng, luma } from './png.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const КУДА = path.join(path.dirname(fileURLToPath(import.meta.url)), '.frames');
fs.mkdirSync(КУДА, { recursive: true });

const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);
const беды = [], таблица = {};

// Окно кадра: игровое поле без оверлея слева и панели крутилок справа.
const ОКНО = { x0: 25, y0: 130, x1: 915, y1: 640 };

const считать = (файл) => {
  const img = decodePng(fs.readFileSync(файл));
  let сумма = 0, всего = 0, красных = 0, золота = 0, тьмы = 0;
  const оттенки = new Set();
  for (let y = ОКНО.y0; y < ОКНО.y1; y++) {
    for (let x = ОКНО.x0; x < ОКНО.x1; x++) {
      const i = (y * img.width + x) * 3;
      const r = img.rgb[i], g = img.rgb[i + 1], b = img.rgb[i + 2];
      const l = luma(r, g, b);
      всего += 1;
      сумма += l;
      if (всего % 7 === 0) оттенки.add((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3));
      // Красное: заметно краснее своих же зелёного и синего.
      if (r > 90 && r - g > 50 && r - b > 40) красных += 1;
      // Золото: красное и зелёное высоко и рядом, синего мало.
      if (r > 120 && g > 90 && Math.abs(r - g) < 70 && b < Math.min(r, g) * 0.6) золота += 1;
      if (l < 12) тьмы += 1;
    }
  }
  const доля = (n) => +((n / всего) * 100).toFixed(2);
  return {
    светлота: +(сумма / всего).toFixed(1),
    красного: доля(красных),
    золота: доля(золота),
    глухойТьмы: доля(тьмы),
    оттенков: оттенки.size,
  };
};

const снять = async (имя, подготовка, аргумент) => {
  await page.evaluate(подготовка, аргумент);
  await page.waitForTimeout(500);
  const файл = path.join(КУДА, `${имя}.png`);
  await page.screenshot({ path: файл });
  await page.evaluate(() => { window.lineair.tuning.sim.maxFrameMs = 16; });
  return считать(файл);
};

for (const depth of [-1, -2, -3, -4, -5]) {
  const имя = `floor${-depth}`;
  const числа = await снять(имя, (d) => {
    const L = window.lineair, T = L.tuning, w = L.world();
    L.startRun(w);
    const h = w.health.get(w.player);
    h.max = 1e5;
    h.hp = 1e5;
    for (let k = -1; k > d; k--) { w.seals.push(w.depth); L.descend(w); }
    L.enterRoom(w, w.floor.end, null);
    T.fx.dustAlpha = 0;
    // Красное снимаем ручкой силы прохода: палитру этажа это не трогает.
    T.hiss.amount = 0;
    for (let i = 0; i < 90; i++) L.step(w);
    T.sim.maxFrameMs = 0;
    for (const t of w.transform.values()) { t.px = t.x; t.py = t.y; }
  }, depth);
  таблица[`НИВО ${depth}`] = числа;
  if (числа.оттенков < 8) беды.push(`НИВО ${depth}: в кадре ${числа.оттенков} оттенков — похоже на заливку`);
  if (числа.красного === 0) беды.push(`НИВО ${depth}: красного в кадре нет — субъекта не видно`);
}

// Натурная часть: кромка плиты обязана быть видна и в красном.
for (const красное of [false, true]) {
  const имя = красное ? 'void-red' : 'void-plain';
  const числа = await снять(имя, (кр) => {
    const L = window.lineair, T = L.tuning, w = L.world();
    L.startRun(w);
    const h = w.health.get(w.player);
    h.max = 1e5;
    h.hp = 1e5;
    for (let k = -1; k > -5; k--) { w.seals.push(w.depth); L.descend(w); }
    L.enterRoom(w, w.floor.end, null);
    T.fx.dustAlpha = 0;
    T.hiss.amount = кр ? 0.92 : 0;
    for (let i = 0; i < 90; i++) L.step(w);
    T.sim.maxFrameMs = 0;
    for (const t of w.transform.values()) { t.px = t.x; t.py = t.y; }
  }, красное);
  таблица[красное ? 'натурная в красном' : 'натурная без красного'] = числа;
  if (числа.золота < 0.5) {
    беды.push(`натурная ${красное ? 'в красном' : 'без красного'}: золота ${числа.золота}% — кромки не видно`);
  }
}

// Бойлерная: тьма — её искажение, и она должна быть именно тьмой.
{
  const числа = таблица['НИВО -4'];
  if (числа.светлота > 40) беды.push(`бойлерная светлая: ${числа.светлота}`);
}

console.log(JSON.stringify({ беды, таблица, снимки: КУДА }, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(беды.length === 0 && errors.length === 0 ? 0 : 1);
