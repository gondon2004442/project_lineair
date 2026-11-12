/**
 * СХОДИМОСТЬ ДАННЫХ. Всё, на что ссылаются данные, должно существовать.
 *
 * Должность, которой нет в списке POSTS, не ломает сборку: сотрудник
 * молча получает чужой силуэт, латинский заголовок и ноль табличек.
 * Так однажды и вышло с начальником отдела кадров. Стенд сверяет
 * ссылки между реестрами: этажи, штатные расписания, шаблоны,
 * испытания, исходы, формы оружия, субъекты.
 *
 * Запуск: node tools/registry.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair;
  const беды = [], заметки = [];
  const идШтата = new Set(L.posts.map((p) => p.id));
  const идШаблонов = new Set([...L.templates.keys()]);
  const идРасписаний = new Set(L.staffing.map((s) => s.id));
  const идФорм = new Set(L.forms.map((f) => f.id));
  const идИсходов = new Set(L.endings.map((e) => e.id));

  // 1. Этажи ссылаются на существующее.
  for (const f of L.floors) {
    if (!идШтата.has(f.sealHolder)) {
      беды.push(`${f.code}: печать у должности ${f.sealHolder}, которой нет в списке`);
    }
    for (const t of f.templates) {
      if (!идШаблонов.has(t)) беды.push(`${f.code}: шаблона ${t} нет`);
    }
    if (f.endTemplate !== undefined && !идШаблонов.has(f.endTemplate)) {
      беды.push(`${f.code}: шаблона приёмной ${f.endTemplate} нет`);
    }
    if (f.headStaffing !== '' && !идРасписаний.has(f.headStaffing)) {
      беды.push(`${f.code}: расписания ${f.headStaffing} нет`);
    }
  }
  заметки.push(`этажей ${L.floors.length}, должностей ${L.posts.length}, шаблонов ${идШаблонов.size}`);

  // 2. Штатные расписания ссылаются на существующие должности.
  {
    let ставок = 0;
    for (const s of L.staffing) {
      for (const p of s.posts) {
        ставок += 1;
        if (!идШтата.has(p.post)) беды.push(`расписание ${s.id}: должности ${p.post} нет`);
        if (p.count <= 0) беды.push(`расписание ${s.id}: ставка ${p.post} в нуле`);
      }
    }
    заметки.push(`расписаний ${L.staffing.length}, ставок в них ${ставок}`);
  }

  // 3. Каждая должность доходит до игры. Проверять по расписаниям
  //    нельзя: мини-боссы и курьер вводятся не ими, а генератором, —
  //    поэтому просто обходим этажи и смотрим, кто там стоит.
  {
    const встречены = new Set();
    for (let seed = 1; seed <= 5; seed++) {
      const w = L.createWorld(seed * 1013, L.world().input);
      L.startRun(w);
      for (let depth = -1; depth >= -5; depth--) {
        for (const r of w.floor.rooms) {
          L.enterRoom(w, r.index, null);
          for (const [, s] of w.staffC) встречены.add(s.post);
        }
        if (depth > -5) { w.seals.push(w.depth); L.descend(w); }
      }
    }
    const мёртвые = L.posts.map((p) => p.id).filter((id) => !встречены.has(id));
    if (мёртвые.length > 0) беды.push(`должности не встречаются в игре: ${мёртвые.join(', ')}`);
    заметки.push(`должностей встречено на пяти забегах: ${встречены.size} из ${L.posts.length}`);
  }

  // 4. Силуэты не повторяются: должность читается по очертанию.
  {
    const поСилуэту = new Map();
    for (const p of L.posts) {
      const был = поСилуэту.get(p.silhouette);
      if (был !== undefined) беды.push(`силуэт ${p.silhouette} у двоих: ${был} и ${p.id}`);
      поСилуэту.set(p.silhouette, p.id);
    }
    заметки.push(`силуэтов ${поСилуэту.size} на ${L.posts.length} должностей`);
  }

  // 5. Субъекты выписаны на существующие формы, испытания выдают
  //    существующие полномочия, исходы названы.
  {
    for (const s of L.subjects) {
      for (const f of s.forms) {
        if (!идФорм.has(f)) беды.push(`субъект ${s.id}: формы ${f} нет`);
      }
    }
    for (const t of L.trials) {
      if (!['cross', 'targets', 'hold'].includes(t.goal)) {
        беды.push(`испытание ${t.id}: задача ${t.goal} неизвестна`);
      }
      if (t.need <= 0) беды.push(`испытание ${t.id}: требуется ${t.need}`);
    }
    if (идИсходов.size !== L.endings.length) беды.push('исходы с одинаковыми ключами');
    заметки.push(
      `субъектов ${L.subjects.length}, форм ${идФорм.size}, ` +
        `испытаний ${L.trials.length}, исходов ${идИсходов.size}`,
    );
  }

  // 6. Числа должностей: у каждой есть своя группа в tuning.
  {
    let без = 0;
    for (const p of L.posts) {
      const cfg = L.tuning.post[p.id];
      if (cfg === undefined) {
        без += 1;
        беды.push(`должность ${p.id}: нет группы чисел tuning.post.${p.id}`);
        continue;
      }
      if (!(cfg.hp > 0) || !(cfg.radius > 0)) {
        беды.push(`должность ${p.id}: прочность или габарит в нуле`);
      }
    }
    заметки.push(`должностей без чисел: ${без}`);
  }

  // 7. Красное — только субъект. Ни антураж, ни мебель, ни оборудование
  //    красными быть не могут: это единственный цвет, закреплённый за
  //    одним существом в кадре.
  {
    const красные = [];
    for (const d of L.decor) {
      if (d.color === 'red' || d.detail === 'red') красные.push(`антураж ${d.id}`);
    }
    for (const p of L.props) {
      if (p.color === 'red' || p.detail === 'red') красные.push(`мебель ${p.id}`);
    }
    for (const f of L.fixtures) {
      if (f.color === 'red' || f.detail === 'red') красные.push(`оборудование ${f.id}`);
    }
    if (красные.length > 0) беды.push(`красным покрашено не то: ${красные.join(', ')}`);
    заметки.push(`красного вне субъекта: ${красные.length}`);
  }

  // 8. Ключи предметов и декора уникальны: это уже считает сама игра.
  {
    if (L.itemIdClashes.length > 0) беды.push(`ключи предметов повторяются: ${L.itemIdClashes}`);
    if (L.decorTooLight.length > 0) {
      беды.push(`декор светлее бетона: ${L.decorTooLight.join(', ')}`);
    }
    заметки.push(`предметов ${L.items.length}, декора ${L.decor.length}`);
  }

  return { беды, заметки };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
