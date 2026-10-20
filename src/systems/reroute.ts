/**
 * ПЕРЕАДРЕСАЦИЯ. Искажение связи и кадров.
 *
 * Принципиально другое, чем перестановка на офисе. Там схема врёт, а
 * здание честное. Здесь наоборот: схема говорит правду — помещения, их
 * номера, их расположение верны, — но ПРОЁМЫ СОЕДИНЕНЫ НЕ С ТЕМИ
 * помещениями. Вышел из 114 в дверь, которая ведёт в 115, — оказался в
 * 121.
 *
 * Чинится это не отменой, а выбором: в середине этажа стоит коммутатор,
 * на нём видна текущая раскоммутация, и одну пару можно переключить
 * руками. Один раз. То есть игрок не снимает искажение, а решает, как
 * именно оно будет работать.
 */
import { floorAt } from '../data/floors';
import type { World } from '../ecs';
import { DIRS } from '../room';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { distortionNow } from './cleanse';

/** Переадресован ли этаж прямо сейчас. */
export function rerouting(w: World): boolean {
  return distortionNow(w, floorAt(w.depth)) === 'reroute';
}

/** Ключ проёма в таблице: помещение и сторона. */
function slot(room: number, dir: number): number {
  return room * 4 + dir;
}

/** Куда на самом деле ведёт проём. Честный сосед, если он не переставлен. */
export function linkOf(w: World, room: number, dir: number): number {
  const honest = w.floor.rooms[room]?.neighbors[dir] ?? -1;
  if (!rerouting(w)) return honest;
  const to = w.wiring[slot(room, dir)];
  return to === undefined || to < 0 ? honest : to;
}

/**
 * Достижима ли приёмная от входа по текущей раскоммутации. Заливка по
 * тому же графу, что и у сборщика этажа: искажение имеет право запутать
 * маршрут, но не имеет права закрыть этаж.
 */
function connected(w: World, wiring: number[]): boolean {
  const seen = new Set<number>([w.floor.start]);
  const queue = [w.floor.start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    if (at === undefined) continue;
    for (const dir of DIRS) {
      const honest = w.floor.rooms[at]?.neighbors[dir] ?? -1;
      if (honest < 0) continue;
      const patched = wiring[slot(at, dir)];
      const to = patched === undefined || patched < 0 ? honest : patched;
      if (to < 0 || seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen.has(w.floor.end);
}

/** Все проёмы этажа: от какого помещения, в какую сторону, к какому. */
function edges(w: World): { room: number; dir: number; to: number }[] {
  const out: { room: number; dir: number; to: number }[] = [];
  for (const room of w.floor.rooms) {
    for (const dir of DIRS) {
      const to = room.neighbors[dir];
      if (to >= 0) out.push({ room: room.index, dir, to });
    }
  }
  return out;
}

/**
 * Собрать раскоммутацию этажа. Пары назначений меняются местами, и
 * каждая перестановка проверяется заливкой: не прошла — откатывается,
 * а не остаётся на этаже закрытым коридором.
 */
export function buildWiring(w: World): void {
  w.wiring = [];
  w.patched = false;
  if (!rerouting(w)) return;

  const cfg = TUNING.reroute;
  const wiring: number[] = new Array(w.floor.rooms.length * 4).fill(-1);
  const rng = makeRng((w.seed + Math.abs(w.depth) * cfg.seedStride) >>> 0);
  const pool = edges(w);
  const want = Math.max(0, Math.round(cfg.swapPairs));

  for (let i = 0; i < want && pool.length >= 2; i++) {
    const a = pool[rng.int(pool.length)];
    const b = pool[rng.int(pool.length)];
    if (a === undefined || b === undefined || a === b) continue;
    if (a.to === b.to) continue;
    // Дверь не должна вести в своё же помещение: вышел — и ты там же.
    // Это читается как поломка, а не как искажение.
    if (a.room === b.to || b.room === a.to) continue;
    const beforeA = wiring[slot(a.room, a.dir)];
    const beforeB = wiring[slot(b.room, b.dir)];
    wiring[slot(a.room, a.dir)] = b.to;
    wiring[slot(b.room, b.dir)] = a.to;
    if (connected(w, wiring)) continue;
    // Пара закрыла этаж — откат. Искажение путает маршрут, а не ломает
    // забег.
    wiring[slot(a.room, a.dir)] = beforeA ?? -1;
    wiring[slot(b.room, b.dir)] = beforeB ?? -1;
  }
  w.wiring = wiring;
}

/** Что сейчас переставлено: пары «из помещения по стороне — к кому». */
export function patchedLinks(w: World): { room: number; dir: number; to: number }[] {
  const out: { room: number; dir: number; to: number }[] = [];
  if (!rerouting(w)) return out;
  w.wiring.forEach((to, at) => {
    if (to < 0) return;
    out.push({ room: Math.floor(at / 4), dir: at % 4, to });
  });
  return out;
}

/**
 * Переключить коммутатор. Одну пару отсоединяем — она становится
 * честной, — а взамен переставляем другую. Это и есть выбор: искажение
 * никуда не делось, но работает оно теперь иначе.
 */
export function patchBoard(w: World): boolean {
  if (!rerouting(w) || w.patched) return false;
  const patched = patchedLinks(w);
  const first = patched[0];
  if (first === undefined) return false;

  const wiring = [...w.wiring];
  wiring[slot(first.room, first.dir)] = -1;

  // Взамен переставляем первую честную пару, какая найдётся. Выбор
  // детерминирован порядком помещений, а не броском: коммутатор —
  // это щит с гнёздами, а не лотерея.
  const честные = edges(w).filter((e) => {
    const at = w.wiring[slot(e.room, e.dir)];
    return at === undefined || at < 0;
  });
  for (let i = 0; i + 1 < честные.length; i++) {
    const a = честные[i];
    const b = честные[i + 1];
    if (a === undefined || b === undefined || a.to === b.to) continue;
    if (a.room === b.to || b.room === a.to) continue;
    wiring[slot(a.room, a.dir)] = b.to;
    wiring[slot(b.room, b.dir)] = a.to;
    if (!connected(w, wiring)) {
      wiring[slot(a.room, a.dir)] = -1;
      wiring[slot(b.room, b.dir)] = -1;
      continue;
    }
    w.wiring = wiring;
    w.patched = true;
    w.sounds.push('door.unlock');
    return true;
  }
  // Переставить взамен нечего — тогда просто отсоединяем.
  if (!connected(w, wiring)) return false;
  w.wiring = wiring;
  w.patched = true;
  w.sounds.push('door.unlock');
  return true;
}
