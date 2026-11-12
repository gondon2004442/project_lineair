/**
 * ОВЕРЛЕЙ. Что написано в деле на каждом повороте забега.
 *
 * Оверлей — единственное место, где контора говорит словами, и он
 * собирается из шаблонных строк. Опечатка в поле даёт «undefined» или
 * «NaN» посреди текста, и заметить это можно только глазами. Стенд
 * проводит мир по состояниям и читает оверлей как текст.
 *
 * Запуск: node tools/overlay.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const ПЛОХОЕ = ['undefined', 'NaN', '[object', 'null', 'Infinity'];
const беды = [], заметки = [];

const снимок = async (подпись, подготовка, обязательно) => {
  await page.evaluate(подготовка);
  await page.waitForTimeout(260);
  const текст = await page.evaluate(() => document.getElementById('hud').innerText);
  for (const плохое of ПЛОХОЕ) {
    if (текст.includes(плохое)) беды.push(`${подпись}: в оверлее «${плохое}»`);
  }
  for (const нужное of обязательно ?? []) {
    if (!текст.includes(нужное)) беды.push(`${подпись}: нет строки «${нужное}»`);
  }
  const строк = текст.split('\n').filter((s) => s.trim() !== '').length;
  заметки.push(`${подпись}: строк ${строк}`);
  return текст;
};

await снимок('вестибюль', () => {
  const L = window.lineair;
  L.startRun(L.world());
}, ['СУБЪЕКТ', 'ФОРМА', 'ОБОЙМА', 'УЧАСТОК']);

await снимок('бой на -1', () => {
  const L = window.lineair, w = L.world();
  const h = w.health.get(w.player);
  h.max = 20;
  h.hp = 12;
  L.enterRoom(w, 1, null);
  for (let i = 0; i < 60; i++) L.step(w);
}, ['СУБЪЕКТ', 'ЭНЕРГИЯ', 'ВАКАНСИЙ']);

await снимок('приёмная, начальник жив', () => {
  const L = window.lineair, w = L.world();
  L.enterRoom(w, w.floor.end, null);
  for (let i = 0; i < 60; i++) L.step(w);
}, ['СУБЪЕКТ', 'УЧАСТОК']);

await снимок('печать на полу', () => {
  const L = window.lineair, w = L.world();
  const h = w.health.get(w.player);
  h.max = 1e5;
  h.hp = 1e5;
  for (let i = 0; i < 900; i++) {
    for (const [e, s] of [...w.staffC]) {
      if (s.retired) continue;
      const hh = w.health.get(e);
      if (hh !== undefined) hh.hp = 0;
    }
    L.step(w);
    if (w.staffC.size === 0) break;
  }
  for (let i = 0; i < 30; i++) L.step(w);
}, ['ЛИФТ', 'ПЕЧАТЬ НА ПОЛУ']);

await снимок('этаж сдан', () => {
  const L = window.lineair, w = L.world();
  const печать = [...w.stashC].find(([, s]) => s.kind === 'seal' && !s.opened);
  if (печать !== undefined) {
    const t = w.transform.get(печать[0]);
    const pt = w.transform.get(w.player);
    pt.x = t.x; pt.y = t.y; pt.px = t.x; pt.py = t.y;
    w.input.useQueued = true;
    L.step(w);
  }
  for (let i = 0; i < 600; i++) L.step(w);
}, ['ЛИФТ', 'ШАГНИ В ШАХТУ']);

await снимок('аттестация на -5', () => {
  const L = window.lineair, w = L.world();
  L.startRun(w);
  const h = w.health.get(w.player);
  h.max = 1e5;
  h.hp = 1e5;
  for (let d = -1; d > -5; d--) { w.seals.push(w.depth); L.descend(w); }
  const r = w.floor.rooms.find((rr) => L.trialOf(w, rr.index) !== undefined);
  L.enterRoom(w, r.index, null);
  for (let i = 0; i < 30; i++) L.step(w);
}, ['АТТЕСТАЦИЯ']);

await снимок('дело на руках', () => {
  const L = window.lineair, w = L.world();
  w.savedCases.push({ id: 'room:-1:3', title: 'ЛИЧНОЕ ДЕЛО · УЧАСТОК 104' });
  for (const item of L.items.slice(0, 4)) L.grantItem(w, item);
  w.record.penalty = 3;
  w.record.service = 2;
  w.tickets = 37;
  for (let i = 0; i < 10; i++) L.step(w);
}, ['ТАЛОН']);

await снимок('субъект мёртв', () => {
  const L = window.lineair, w = L.world();
  const h = w.health.get(w.player);
  h.max = 10;
  h.hp = 10;
  for (let i = 0; i < 600 && w.status !== 'dead'; i++) {
    L.applyDamage(w, w.player, 3);
    L.step(w);
  }
  for (let i = 0; i < 30; i++) L.step(w);
}, ['СУБЪЕКТ ЛИКВИДИРОВАН', 'ВЕРНУТЬСЯ В ВЕСТИБЮЛЬ']);

console.log(JSON.stringify({ беды, заметки }, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(беды.length === 0 && errors.length === 0 ? 0 : 1);
