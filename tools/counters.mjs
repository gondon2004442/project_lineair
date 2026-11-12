/**
 * СТОЙКИ. Окошко, в которое подают один раз.
 *
 * Проверяется то, что стойка обещает: приглашение не пустое, цена
 * названа, подача делает ровно то, что написано, и окошко после этого
 * закрывается. Без талонов — не принимает и ничего не трогает. Бросок
 * переаттестации привязан к стойке, а не к моменту: то же окошко на том
 * же seed отвечает одинаково.
 *
 * Запуск: node tools/counters.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(() => {
  const L = window.lineair, T = L.tuning;
  const беды = [], таблица = {};

  // Найти стойку нужного вида: обходим этажи и помещения, пока не
  // попадётся. Стойки раздаются посевной, поэтому ищем по нескольким.
  const найти = (вид) => {
    for (let seed = 1; seed <= 24; seed++) {
      const w = L.createWorld(seed * 1013, L.world().input);
      L.startRun(w);
      const h = w.health.get(w.player);
      h.max = 100;
      h.hp = 100;
      for (let depth = -1; depth >= -4; depth--) {
        for (const r of w.floor.rooms) {
          L.enterRoom(w, r.index, null);
          for (let i = 0; i < 3; i++) L.step(w);
          const пара = [...w.counterC].find(([, c]) => c.kind === вид && !c.used);
          if (пара !== undefined) return { w, стойка: пара[0] };
        }
        if (depth > -4) { w.seals.push(w.depth); L.descend(w); }
      }
    }
    return null;
  };
  const подать = (w, стойка) => {
    const t = w.transform.get(стойка);
    const pt = w.transform.get(w.player);
    pt.x = t.x; pt.y = t.y + 24; pt.px = pt.x; pt.py = pt.y;
    L.step(w);
    w.input.useQueued = true;
    L.step(w);
    for (let i = 0; i < 3; i++) L.step(w);
  };

  for (const вид of ['registry', 'hr', 'review', 'listing', 'request']) {
    const найдено = найти(вид);
    if (найдено === null) {
      беды.push(`стойка ${вид} не встречается ни на одном этаже`);
      continue;
    }
    const { w, стойка } = найдено;
    // Состояние, при котором стойке есть что предложить.
    w.record.penalty = 3;
    w.tickets = 400;
    const до = {
      талонов: w.tickets,
      взыскание: w.record.penalty,
      выслуга: w.record.service,
      прочность: w.health.get(w.player).hp,
      допусков: w.passes,
      опись: w.listed === true,
      вДеле: w.build.length,
    };
    const предложение = L.counterOffer(w, стойка);
    if (предложение.offer === '') беды.push(`стойка ${вид}: приглашение пустое`);
    if (предложение.price === '') беды.push(`стойка ${вид}: цена не названа`);
    if (!предложение.ok) беды.push(`стойка ${вид}: не принимает при 400 талонах (${предложение.price})`);

    подать(w, стойка);
    const после = {
      талонов: w.tickets,
      взыскание: w.record.penalty,
      выслуга: w.record.service,
      прочность: w.health.get(w.player).hp,
      допусков: w.passes,
      опись: w.listed === true,
      вДеле: w.build.length,
    };
    const закрылось = w.counterC.get(стойка)?.used === true;
    if (!закрылось) беды.push(`стойка ${вид}: окошко не закрылось после подачи`);
    const изменилось = Object.keys(до).filter((k) => до[k] !== после[k]);
    if (изменилось.length === 0) беды.push(`стойка ${вид}: подача ничего не изменила`);

    // Обещанное каждой стойкой.
    if (вид === 'registry' && после.взыскание >= до.взыскание) {
      беды.push('стойка регистрации не сняла взыскание');
    }
    if (вид === 'hr' && (после.прочность >= до.прочность || после.допусков <= до.допусков)) {
      беды.push('стойка кадров не обменяла здоровье на допуск');
    }
    if (вид === 'listing' && после.опись !== true) беды.push('стойка учёта не показала опись');
    if (вид === 'request' && (после.вДеле <= до.вДеле || после.взыскание <= до.взыскание)) {
      беды.push('встречное направление не выдало приложение за взыскание');
    }
    if (вид === 'review' && после.выслуга === до.выслуга && после.взыскание === до.взыскание) {
      беды.push('переаттестация не дала ни выслуги, ни взыскания');
    }

    // Второй раз то же окошко не принимает.
    const второе = L.counterOffer(w, стойка);
    if (второе.ok) беды.push(`стойка ${вид}: принимает второй раз`);

    таблица[вид] = {
      предложение: `${предложение.offer} · ${предложение.price}`,
      изменилось: изменилось.join(', '),
      послеПодачи: второе.price,
    };
  }

  // Без талонов стойка не принимает и ничего не трогает.
  {
    const найдено = найти('listing');
    if (найдено !== null) {
      const { w, стойка } = найдено;
      w.tickets = 0;
      const до = `${w.tickets}:${w.listed === true}`;
      const предложение = L.counterOffer(w, стойка);
      подать(w, стойка);
      const после = `${w.tickets}:${w.listed === true}`;
      if (предложение.ok) беды.push('стойка учёта принимает при нуле талонов');
      if (до !== после) беды.push('подача без талонов всё равно что-то изменила');
      таблица.безТалонов = { цена: предложение.price, принимает: предложение.ok, было: до, стало: после };
    }
  }

  return { беды, таблица };
});

console.log(JSON.stringify(out, null, 1));
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(out.беды.length === 0 && errors.length === 0 ? 0 : 1);
