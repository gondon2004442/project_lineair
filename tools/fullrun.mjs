/**
 * СКВОЗНОЙ ПРОГОН. Забег от вестибюля до решения, сыгранный ходом.
 *
 * Стенд не присваивает полям значения и не телепортирует субъекта: он
 * ищет проход по сетке плитки, входит в проёмы ходом, расстреливает
 * мебель, когда упёрся, сдаёт аттестации прицелом и телекинезом,
 * подбирает печать руками и входит в шахту ногами. Единственная
 * поблажка — штат снимается по прочности: стенд проверяет проходимость
 * вертикали, а не умение уворачиваться.
 *
 * Это ловит то, чего не видно по отдельным системам: помещение, из
 * которого не выйти, аттестацию, которую не сдать, лифт, который не
 * едет, исход, который не оформить.
 *
 * Запуск (сначала `npm run build` и `npm run preview`):
 *   node tools/fullrun.mjs                 — пять посевных по умолчанию
 *   node tools/fullrun.mjs 4242 7777       — свои посевные
 *   LINEAIR_URL=http://127.0.0.1:5173 node tools/fullrun.mjs
 */
import { открытьИгру } from './browser.mjs';

const АДРЕС = process.env.LINEAIR_URL ?? 'http://127.0.0.1:4173';
const ПОСЕВНЫЕ =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map(Number)
    : [4242, 1013, 2026, 7777, 31337];

const { browser, page, errors } = await открытьИгру(`${АДРЕС}/?seed=4242`);

const out = await page.evaluate(({ посевные, след }) => {
  const прогон = (посевная) => {
    const L = window.lineair, T = L.tuning;
    const w = L.createWorld(посевная, L.world().input);
    L.startRun(w);
    // Прочность большая, но не бесконечная: стенд проверяет проходимость,
    // а не умение уворачиваться.
    const h = w.health.get(w.player);
    h.max = 1e4;
    h.hp = 1e4;

    const журнал = [], беды = [], попытки = [];
    const tile = w.map.size;
    const midX = (T.room.wall + Math.floor(T.room.cols / 2)) * tile;
    const midY = (T.room.wall + Math.floor(T.room.rows / 2)) * tile;
    const где = () => w.transform.get(w.player);
    const дверь = (dir) => {
      const ширина = w.map.cols * tile, высота = w.map.rows * tile;
      if (dir === 0) return { x: midX, y: tile * 0.5 };
      if (dir === 1) return { x: ширина - tile * 0.5, y: midY };
      if (dir === 2) return { x: midX, y: высота - tile * 0.5 };
      return { x: tile * 0.5, y: midY };
    };
    // Внутрь помещения от каждого проёма.
    const ВНУТРЬ = [[0, 1], [-1, 0], [0, -1], [1, 0]];

    // Чем стрелять. Обойма пуста — перезаряжаем; и запас пуст — крутим
    // колесо: у табельной формы запас бездонный, к ней это и приводит.
    const зарядить = () => {
      const p = w.playerC.get(w.player);
      if ((p.ammo[p.form] ?? 0) > 0) return;
      if ((p.reserve[p.form] ?? 0) > 0 || p.form === 0) {
        w.input.reloadQueued = true;
        w.input.reloadAge = 0;
        return;
      }
      if (p.switchCooldown <= 0) w.input.formStep = 1;
    };
    const неСтрелять = () => {
      w.input.fireHeld = false;
      w.input.firePressed = false;
    };

    // Ход к точке: сперва ищем проход по сетке плитки, потом рулим
    // вводом от вехи к вехе. Прямо «на цель» ходить нельзя — так стенд
    // упирается в первый же шкаф и объявляет это бедой игры.
    const занято = (cx, cy, сМебелью) => {
      const x = (cx + 0.5) * tile, y = (cy + 0.5) * tile;
      if (L.isSolidPoint(w.map, x, y)) return true;
      if (!сМебелью) return false;
      for (const [e] of w.propC) {
        const t = w.transform.get(e), d = w.drawC.get(e);
        if (t === undefined || d === undefined) continue;
        if (Math.abs(t.x - x) < d.size + tile * 0.1 && Math.abs(t.y - y) < d.size + tile * 0.1) {
          return true;
        }
      }
      return false;
    };
    const вехи = (tx, ty, сМебелью) => {
      const t = где();
      const cols = w.map.cols, rows = w.map.rows;
      const от = Math.floor(t.y / tile) * cols + Math.floor(t.x / tile);
      const куда = Math.floor(ty / tile) * cols + Math.floor(tx / tile);
      const пред = new Int32Array(cols * rows).fill(-2);
      пред[от] = -1;
      const очередь = [от];
      for (let qi = 0; qi < очередь.length; qi++) {
        const c = очередь[qi];
        if (c === куда) break;
        const cx = c % cols, cy = (c - cx) / cols;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (пред[n] !== -2) continue;
          if (n !== куда && занято(nx, ny, сМебелью)) continue;
          пред[n] = c;
          очередь.push(n);
        }
      }
      if (пред[куда] === -2) return null;
      const список = [];
      let c = куда;
      while (c !== -1) {
        const cx = c % cols, cy = (c - cx) / cols;
        список.unshift({ x: (cx + 0.5) * tile, y: (cy + 0.5) * tile });
        c = пред[c];
      }
      список.push({ x: tx, y: ty });
      return список;
    };
    const рулить = (tx, ty, предел) => {
      let вбок = 0, стоим = 0, упор = 0;
      let px = где().x, py = где().y;
      for (let i = 0; i < предел; i++) {
        const t = где();
        const dx = tx - t.x, dy = ty - t.y;
        const d = Math.hypot(dx, dy);
        if (d < tile * 0.55) {
          w.input.moveX = 0;
          w.input.moveY = 0;
          неСтрелять();
          return i;
        }
        let mx = dx / d, my = dy / d;
        if (вбок > 0) { const s = mx; mx = -my; my = s; вбок -= 1; }
        w.input.moveX = mx;
        w.input.moveY = my;
        L.step(w);
        if (Math.hypot(t.x - px, t.y - py) < 0.4) {
          стоим += 1;
          упор += 1;
          if (стоим > 15) { вбок = 20; стоим = 0; }
          // Уперлись надолго: впереди шкаф. Его расстреливают, а не
          // обходят — так и играют.
          // Уперлись надолго: впереди мебель. Сначала убираем её
          // телекинезом — стойку с факсами пуля не берёт вовсе, её
          // только и можно, что отнести в сторону. Не помогло —
          // расстреливаем: так и играют.
          if (упор > 40 && упор <= 70) {
            w.input.grabHeld = true;
            w.input.aimX = t.x - mx * tile * 6;
            w.input.aimY = t.y - my * tile * 6;
          } else if (упор === 71) {
            // Отпустили — бросок уходит назад, проход освобождается.
            w.input.grabHeld = false;
          } else if (упор > 80) {
            w.input.grabHeld = false;
            w.input.aimX = t.x + mx * tile * 2;
            w.input.aimY = t.y + my * tile * 2;
            w.input.fireHeld = true;
            w.input.firePressed = true;
            w.input.fireAge = 0;
            зарядить();
          }
        } else {
          стоим = 0;
          упор = Math.max(0, упор - 2);
          неСтрелять();
          w.input.grabHeld = false;
        }
        px = t.x;
        py = t.y;
      }
      w.input.moveX = 0;
      w.input.moveY = 0;
      неСтрелять();
      return -1;
    };
    const идти = (tx, ty, предел) => {
      let всего = 0;
      for (const сМебелью of [true, false]) {
        const маршрут = вехи(tx, ty, сМебелью);
        if (маршрут === null) continue;
        // Веху можно и пропустить: важно дойти до цели, а не отметиться
        // в каждой клетке. Подряд три несданные вехи — значит упёрлись
        // всерьёз, и маршрут пора менять.
        let подряд = 0;
        for (const веха of маршрут) {
          const n = рулить(веха.x, веха.y, Math.max(60, Math.round(предел / 8)));
          if (n < 0) {
            подряд += 1;
            if (подряд >= 3) break;
            continue;
          }
          подряд = 0;
          всего += n;
        }
        const t = где();
        if (Math.hypot(tx - t.x, ty - t.y) < tile * 0.8) return всего;
      }
      const n = рулить(tx, ty, предел);
      return n < 0 ? -1 : всего + n;
    };
    // Пройти в проём: подходим изнутри и давим наружу. В дверь входят
    // ходом, а не остановкой в её середине.
    const вДверь = (dir, предел) => {
      const было = w.room;
      const g = дверь(dir);
      const внутрь = ВНУТРЬ[dir];
      // Подход к проёму: точка в двух клетках внутрь может быть занята
      // шкафом — тогда к двери не подойти вовсе, хотя сама она открыта.
      // Пробуем подходы дальше от двери и вдоль стены в обе стороны:
      // проём шириной в две клетки, и вторая часто свободна.
      const вбок = [внутрь[1], внутрь[0]];
      let n = -1;
      for (const даль of [2, 3, 4]) {
        for (const сдвиг of [0, 1, -1]) {
          const x = g.x + внутрь[0] * tile * даль + вбок[0] * tile * сдвиг;
          const y = g.y + внутрь[1] * tile * даль + вбок[1] * tile * сдвиг;
          if (вехи(x, y, true) === null) continue;
          n = идти(x, y, предел ?? 1200);
          if (n >= 0) break;
        }
        if (n >= 0) break;
      }
      if (n < 0) n = идти(g.x + внутрь[0] * tile * 2, g.y + внутрь[1] * tile * 2, предел ?? 1200);
      // Встаём на ось проёма: подход мог оказаться на соседнем ряду, а
      // там, где у двери пол, рядом с ней бетон — и напор в стену
      // ничего не даёт.
      рулить(g.x + внутрь[0] * tile * 0.7, g.y + внутрь[1] * tile * 0.7, 240);
      w.input.moveX = -внутрь[0];
      w.input.moveY = -внутрь[1];
      for (let i = 0; i < 160 && w.room === было; i++) L.step(w);
      w.input.moveX = 0;
      w.input.moveY = 0;
      for (let i = 0; i < 40; i++) L.step(w);
      // Не вышли — отходим на середину помещения. Игра детерминирована:
      // вторая попытка из той же точки провалится ровно так же, а из
      // другой точки дорога к проёму может сложиться иначе.
      if (w.room === было) {
        const centre = { x: (w.map.cols / 2) * tile, y: (w.map.rows / 2) * tile };
        идти(centre.x, centre.y, 600);
      }
      if (след) {
        const t = где();
        попытки.push(
          `${было}-дверь${dir}:${n < 0 ? 'не дошёл' : n}→${w.room}` +
            `@${Math.floor(t.x / tile)}:${Math.floor(t.y / tile)}`,
        );
      }
      return { прошёл: w.room !== было, шагов: n < 0 ? 0 : n, дошёлДоДвери: n >= 0 };
    };

    const снятьШтат = (предел) => {
      for (let i = 0; i < предел; i++) {
        for (const [e, s] of [...w.staffC]) {
          if (s.retired) continue;
          const hh = w.health.get(e);
          if (hh !== undefined) hh.hp = 0;
        }
        L.step(w);
        if ([...w.staffC.values()].every((s) => s.retired)) return i;
      }
      return -1;
    };
    const подобрать = (kind) => {
      const пара = [...w.stashC].find(([, s]) => s.kind === kind && !s.opened);
      if (пара === undefined) return 'нечего';
      const t = w.transform.get(пара[0]);
      const шагов = идти(t.x, t.y, 900);
      if (шагов < 0) return 'не дошёл';
      w.input.useQueued = true;
      L.step(w);
      for (let i = 0; i < 5; i++) L.step(w);
      const остался = w.stashC.get(пара[0]);
      return остался === undefined || остался.opened ? `дошёл за ${шагов}` : 'не взялось';
    };

    // --- Аттестация натурной части. Её проходят ногами, прицелом и
    // телекинезом — тем же, чем играют, поэтому и стенд играет.
    const плита = (x, y) => !L.isSolidPoint(w.map, x, y);
    const надёжнаяПлита = () => {
      const t = где();
      let лучшая = null, лучшее = Infinity;
      for (let cy = 0; cy < w.map.rows; cy++) {
        for (let cx = 0; cx < w.map.cols; cx++) {
          const x = (cx + 0.5) * tile, y = (cy + 0.5) * tile;
          if (!плита(x, y)) continue;
          // Середина плиты, а не её кромка: с кромки сносит первой же
          // перестройкой.
          let края = 0;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            if (!плита(x + dx * tile, y + dy * tile)) края += 1;
          }
          const d = Math.hypot(t.x - x, t.y - y) + края * tile * 2;
          if (d < лучшее) { лучшее = d; лучшая = { x, y }; }
        }
      }
      return лучшая;
    };
    const держатьсяПлиты = () => {
      const t = где();
      const p = w.playerC.get(w.player);
      if (p.fallTimer > 0) { w.input.moveX = 0; w.input.moveY = 0; return; }
      const цель = надёжнаяПлита();
      if (цель === null) return;
      const dx = цель.x - t.x, dy = цель.y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < tile * 0.4) { w.input.moveX = 0; w.input.moveY = 0; return; }
      w.input.moveX = dx / d;
      w.input.moveY = dy / d;
    };
    const сдатьИспытание = (предел) => {
      const trial = L.activeTrial(w);
      if (trial === undefined) return 'нет';
      const p = w.playerC.get(w.player);
      const id = trial.id;
      let срывов = 0;
      for (let i = 0; i < предел; i++) {
        const былСрыв = p.fallTimer > 0;
        if (id === 'targets') {
          const цель = [...w.targetC.keys()][0];
          if (цель !== undefined) {
            const tt = w.transform.get(цель);
            if (tt !== undefined) { w.input.aimX = tt.x; w.input.aimY = tt.y; }
            w.input.fireHeld = true;
            w.input.firePressed = true;
            w.input.fireAge = 0;
            зарядить();
          }
        } else if (id === 'hold') {
          const вещь = [...w.propC.keys()].find((e) => !w.targetC.has(e));
          if (вещь !== undefined) {
            const tt = w.transform.get(вещь);
            if (tt !== undefined) { w.input.aimX = tt.x; w.input.aimY = tt.y; }
            w.input.grabHeld = true;
          }
        }
        // Под ногами плиты уходят: за предметом не бежим, дальность
        // захвата и так велика, а бег по натурной части кончается срывом.
        держатьсяПлиты();
        L.step(w);
        if (!былСрыв && p.fallTimer > 0) срывов += 1;
        if (w.trials.includes(id)) {
          неСтрелять();
          w.input.grabHeld = false;
          w.input.moveX = 0;
          w.input.moveY = 0;
          return `сдал за ${i}`;
        }
      }
      неСтрелять();
      w.input.grabHeld = false;
      w.input.moveX = 0;
      w.input.moveY = 0;
      return `не сдал (${id}, сделано ${w.trialDone}/${trial.need}, срывов ${срывов})`;
    };

    // Маршрут по этажу берём по настоящим связям, а не по нарисованным:
    // ходят ногами, и переадресация должна либо вести куда обещает,
    // либо честно путать.
    const путь = (от, куда) => {
      const пред = new Map([[от, null]]);
      const очередь = [от];
      while (очередь.length > 0) {
        const r = очередь.shift();
        if (r === куда) break;
        for (let dir = 0; dir < 4; dir++) {
          if (w.floor.rooms[r].neighbors[dir] < 0) continue;
          const to = L.linkOf(w, r, dir);
          if (to < 0 || пред.has(to)) continue;
          пред.set(to, [r, dir]);
          очередь.push(to);
        }
      }
      if (!пред.has(куда)) return null;
      const шаги = [];
      let cur = куда;
      while (пред.get(cur) !== null) {
        const [r, dir] = пред.get(cur);
        шаги.unshift(dir);
        cur = r;
      }
      return шаги;
    };

    // Старт: забег начинается с шага в проём вестибюля.
    {
      const dir = [0, 1, 2, 3].find((d) => w.floor.rooms[w.room].neighbors[d] >= 0);
      const g = дверь(dir);
      идти(g.x, g.y, 900);
      for (let i = 0; i < 30; i++) L.step(w);
    }

    for (let этаж = 0; этаж < 5; этаж++) {
      const строка = { этаж: `${L.floorAt(w.depth).code} ${L.floorAt(w.depth).title}` };
      const t0 = w.tick;
      const этажГлубина = w.depth;
      снятьШтат(1200);
      let шагов = 0, прошёл = 0, застрял = 0;
      const побывал = new Set([w.room]);
      for (let k = 0; k < 40 && w.room !== w.floor.end; k++) {
        const маршрут = путь(w.room, w.floor.end);
        if (маршрут === null || маршрут.length === 0) {
          беды.push(`${строка.этаж}: до приёмной нет пути`);
          break;
        }
        снятьШтат(1200);
        if (L.activeTrial(w) !== undefined) {
          const r = сдатьИспытание(60 * 90);
          строка.аттестации = `${строка.аттестации ?? ''} ${r}`.trim();
          if (r.startsWith('не сдал')) {
            беды.push(`${строка.этаж}: аттестация не сдаётся — ${r}`);
            break;
          }
        }
        const было = w.room;
        const ход = вДверь(маршрут[0], 1200);
        if (!ход.дошёлДоДвери) застрял += 1;
        else шагов += ход.шагов;
        // Не вышли в нужный проём — пробуем остальные. Игрок в такой
        // ситуации тоже не упирается в одну дверь: он идёт в любую, а
        // дорогу считает заново уже из нового участка.
        if (w.room === было) {
          // Сначала в те проёмы, за которыми ещё не были: ходить по
          // кругу между двумя участками — не поиск, а топтание.
          const стороны = [0, 1, 2, 3]
            .filter((d) => d !== маршрут[0] && w.floor.rooms[было].neighbors[d] >= 0)
            .sort((a, b) => {
              const A = побывал.has(L.linkOf(w, было, a)) ? 1 : 0;
              const B = побывал.has(L.linkOf(w, было, b)) ? 1 : 0;
              return A - B;
            });
          for (const dir of стороны) {
            if (w.room !== было) break;
            шагов += вДверь(dir, 1200).шагов;
          }
        }
        побывал.add(w.room);
        if (след) {
          строка.след = `${строка.след ?? ''} ${было}→${w.room}`.trim();
        }
        if (w.room === было) {
          застрял += 1;
          if (застрял > 3) {
            беды.push(`${строка.этаж}: не вышел из участка ${было}`);
            break;
          }
        } else прошёл += 1;
      }
      строка.помещенийПройдено = прошёл;
      строка.застрялРаз = застрял;
      строка.вПриёмной = w.room === w.floor.end;

      if (L.floorAt(w.depth).verdict === true) {
        // Центральный архив: боя нет, есть выбор. Стойки выставляются
        // по снятой печати Комиссии, её и подбираем.
        строка.комиссияСнята = снятьШтат(2400) >= 0;
        строка.печать = подобрать('seal');
        for (let i = 0; i < 30; i++) L.step(w);
        // Подшить можно только чужое дело. Нет дела — выбираем то, что
        // контора готова оформить.
        const исход = w.savedCases.length > 0 ? 'swap' : 'sign';
        строка.исход = исход;
        const стойка = [...w.stashC].find(([, s]) => s.kind === 'verdict' && s.item === исход);
        if (стойка === undefined) беды.push(`в архиве нет стойки «${исход}»`);
        else {
          const t = w.transform.get(стойка[0]);
          if (идти(t.x, t.y, 1500) < 0) беды.push('до стойки исхода не дойти');
          w.input.useQueued = true;
          L.step(w);
          for (let i = 0; i < 20; i++) L.step(w);
        }
        строка.решение = w.verdict === '' ? '—' : w.verdict;
        строка.статус = w.status;
        строка.шагов = w.tick - t0;
        журнал.push(строка);
        break;
      }

      строка.начальникСнят = снятьШтат(2400) >= 0;
      строка.печать = подобрать('seal');
      строка.волна = w.cleanse >= 0;

      // Крюк за делом спасённого: волна прошла соседний участок, там
      // лежит личное дело. Возвращаться за ним — дело игрока, и стенд
      // проверяет, что вернуться можно.
      {
        const dir = [0, 1, 2, 3].find((d) => w.floor.rooms[w.room].neighbors[d] >= 0);
        const назад = (dir + 2) % 4;
        const приёмная = w.room;
        if (dir !== undefined && вДверь(dir, 1200).прошёл) {
          for (let i = 0; i < 240; i++) L.step(w);
          строка.дело = подобрать('saved');
          вДверь(назад, 1200);
          if (w.room !== приёмная && w.depth === этажГлубина) {
            const путьНазад = путь(w.room, приёмная);
            if (путьНазад !== null) for (const d of путьНазад) вДверь(d, 1200);
          }
          строка.вернулсяВПриёмную = w.room === приёмная;
        } else строка.дело = 'не вышел за делом';
      }

      // По дороге за делом можно пройти через шахту и уехать: она в
      // середине приёмной и открыта. Это не ошибка стенда, это так
      // устроен выход.
      if (w.depth !== этажГлубина) {
        строка.спуск = `${этажГлубина} → ${w.depth} (по дороге)`;
        строка.прочность = Math.round(w.health.get(w.player).hp);
        строка.шагов = w.tick - t0;
        журнал.push(строка);
        for (let i = 0; i < 60; i++) L.step(w);
        continue;
      }

      // Лифт: входим в шахту ногами.
      const глубинаДо = w.depth;
      идти(midX, midY - tile * 2, 900);
      w.input.moveX = 0;
      w.input.moveY = 1;
      for (let i = 0; i < 240 && w.depth === глубинаДо; i++) L.step(w);
      w.input.moveY = 0;
      строка.спуск = `${глубинаДо} → ${w.depth}`;
      if (w.depth === глубинаДо) беды.push(`${строка.этаж}: лифт не поехал`);
      строка.прочность = Math.round(w.health.get(w.player).hp);
      строка.шагов = w.tick - t0;
      журнал.push(строка);
      if (w.depth === глубинаДо) break;
      for (let i = 0; i < 60; i++) L.step(w);
    }

    return {
      посевная,
      журнал,
      беды,
      попытки: след ? попытки.slice(0, 40) : undefined,
      итог: {
        статус: w.status,
        решение: w.verdict === '' ? '—' : w.verdict,
        дел: w.savedCases.length,
      },
    };
  };
  return посевные.map(прогон);
}, { посевные: ПОСЕВНЫЕ, след: process.env.LINEAIR_TRACE === '1' });

let бед = 0;
for (const r of out) {
  console.log(
    `=== посевная ${r.посевная}: ${r.итог.статус}, решение ${r.итог.решение}, дел ${r.итог.дел}`,
  );
  for (const строка of r.журнал) console.log('   ' + JSON.stringify(строка));
  if (r.попытки !== undefined) for (const п of r.попытки) console.log('      ' + п);
  console.log('   беды: ' + (r.беды.length === 0 ? 'нет' : JSON.stringify(r.беды)));
  бед += r.беды.length;
}
console.log(`ИТОГО: посевных ${out.length}, бед ${бед}`);
console.log('ОШИБКИ НА СТРАНИЦЕ: ' + (errors.length === 0 ? 'нет' : errors.join(' | ')));
await browser.close();
process.exit(бед === 0 && errors.length === 0 ? 0 : 1);
