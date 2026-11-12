/**
 * СОДЕРЖАНИЕ. Каждая правка должна попадать в существующее число.
 *
 * Предмет и распоряжение — это набор правок к путям внутри TUNING.
 * Опечатка в пути ничего не ломает на вид: предмет просто перестаёт
 * что-либо делать, и заметить это в игре нечем. Стенд проверяет, что
 * путь есть, что он число и что выданный предмет это число двигает.
 *
 * Запуск: node tools/content.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair, T = L.tuning;
  const беды = [], заметки = [];
  const поПути = (путь) => путь.split('.').reduce((o, k) => (o === undefined ? undefined : o[k]), T);
  const мир = () => {
    const w = L.createWorld(4242, L.world().input);
    L.startRun(w);
    return w;
  };

  // 1. Пути предметов существуют и правка доходит до statAt.
  {
    let правок = 0, мёртвых = 0, неЧисло = 0, неДвигает = 0;
    for (const item of L.items) {
      for (const mod of item.mods) {
        правок += 1;
        const значение = поПути(mod.path);
        if (значение === undefined) {
          мёртвых += 1;
          беды.push(`предмет ${item.code} ${item.id}: пути ${mod.path} нет в tuning`);
          continue;
        }
        if (typeof значение !== 'number') {
          неЧисло += 1;
          беды.push(`предмет ${item.code} ${item.id}: путь ${mod.path} не число`);
          continue;
        }
        const пустая = (mod.add ?? 0) === 0 && (mod.mul ?? 1) === 1;
        if (пустая) {
          неДвигает += 1;
          беды.push(`предмет ${item.code} ${item.id}: правка ${mod.path} ничего не меняет`);
          continue;
        }
        const w = мир();
        const до = L.statAt(w, mod.path);
        L.grantItem(w, item);
        const после = L.statAt(w, mod.path);
        if (Math.abs(после - до) < 1e-9) {
          неДвигает += 1;
          беды.push(`предмет ${item.code} ${item.id}: ${mod.path} не сдвинулся (${до})`);
        }
      }
    }
    заметки.push(
      `предметов ${L.items.length}, правок ${правок}: мёртвых путей ${мёртвых}, ` +
        `не чисел ${неЧисло}, пустых ${неДвигает}`,
    );
  }

  // 2. То же у распоряжений, плюс их условия должны быть выполнимы.
  {
    let правок = 0, мёртвых = 0;
    const коды = new Set(L.items.map((i) => i.id));
    for (const d of L.directives) {
      for (const mod of d.mods) {
        правок += 1;
        const значение = поПути(mod.path);
        if (значение === undefined || typeof значение !== 'number') {
          мёртвых += 1;
          беды.push(`распоряжение ${d.number}: пути ${mod.path} нет в tuning`);
        }
      }
      for (const группа of d.requires) {
        if (группа.length === 0) {
          беды.push(`распоряжение ${d.number}: пустая группа условий`);
          continue;
        }
        for (const id of группа) {
          if (!коды.has(id)) беды.push(`распоряжение ${d.number}: требует несуществующий ${id}`);
        }
      }
      if (d.againstPost !== undefined && d.damageMul === undefined) {
        беды.push(`распоряжение ${d.number}: должность названа, множителя нет`);
      }
    }
    заметки.push(`распоряжений ${L.directives.length}, правок ${правок}, мёртвых путей ${мёртвых}`);
  }

  // 3. Каждое распоряжение собирается: есть набор приложений, который
  //    его выписывает. Иначе это мёртвая запись в данных.
  {
    let несобираемых = 0;
    for (const d of L.directives) {
      const w = мир();
      // Свойство субъекта: берём того, кому распоряжение выписывают.
      if (d.requiresTrait !== undefined) {
        const кто = L.subjects.find((s) => {
          w.subject = s.id;
          return L.hasTrait(w, d.requiresTrait);
        });
        if (кто === undefined) {
          несобираемых += 1;
          беды.push(`распоряжение ${d.number}: свойства ${d.requiresTrait} нет ни у кого`);
          continue;
        }
        w.subject = кто.id;
        L.startRun(w);
      }
      for (const группа of d.requires) {
        const item = L.items.find((i) => i.id === группа[0]);
        if (item !== undefined) L.grantItem(w, item);
      }
      // Состав дела решает, выписано ли распоряжение; свойство субъекта
      // отсекается отдельно — так же, как это делает оверлей.
      const выписано =
        L.issuedDirectives(w.build).some((x) => x.id === d.id) &&
        (d.requiresTrait === undefined || L.hasTrait(w, d.requiresTrait));
      if (!выписано) {
        несобираемых += 1;
        беды.push(`распоряжение ${d.number} ${d.title}: не собирается своим же набором`);
      }
    }
    заметки.push(`распоряжений не собирается: ${несобираемых}`);
  }

  // 4. Инвентарь: у каждого есть эффект и его кулдаун в tuning.
  {
    let без = 0;
    for (const item of L.items) {
      if (item.kind !== 'implement') continue;
      const effect = item.active?.effect;
      if (effect === undefined) {
        без += 1;
        беды.push(`инвентарь ${item.code} ${item.id}: не сказано, что он делает`);
        continue;
      }
      if (поПути(`tool.${effect}.cooldown`) === undefined) {
        без += 1;
        беды.push(`инвентарь ${item.code} ${item.id}: нет tool.${effect}.cooldown`);
      }
    }
    const всего = L.items.filter((i) => i.kind === 'implement').length;
    заметки.push(`инвентаря ${всего}, без эффекта или отката ${без}`);
  }

  return { беды, заметки };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
