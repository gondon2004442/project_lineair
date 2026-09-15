/**
 * Двери участка: запираются на входе, открываются по зачистке.
 * За зачистку участка выдаётся предмет — правка к параметрам оружия.
 */
import { ITEMS } from '../data/items';
import type { World } from '../ecs';
import { makeRng } from '../rng';
import { DIRS, opposite, standingInDoor } from '../room';
import { TUNING } from '../tuning';
import { enterRoom } from '../world';

export function roomSystem(w: World): void {
  const room = w.floor.rooms[w.room];
  if (room === undefined) return;

  if (!room.cleared && w.staffC.size === 0) {
    room.cleared = true;
    w.map.doorsLocked = false;
    w.mapToken += 1;
    w.sounds.push('door.unlock');
    issueItem(w, room.index);
  }

  if (w.map.doorsLocked || w.status === 'dead') return;

  const t = w.transform.get(w.player);
  if (t === undefined) return;
  for (const dir of DIRS) {
    const next = room.neighbors[dir];
    if (next < 0 || !standingInDoor(w.map, dir, t.x, t.y)) continue;
    enterRoom(w, next, opposite(dir));
    return;
  }
}

/**
 * Выдача по итогам зачистки. Случайность своя на каждый участок,
 * поэтому порядок обхода этажа на выдачу не влияет.
 */
function issueItem(w: World, roomIndex: number): void {
  const rng = makeRng((w.seed + roomIndex * TUNING.floor.itemSeedStride) >>> 0);
  const fresh = ITEMS.filter((item) => !w.build.includes(item.id));
  const pool = fresh.length > 0 ? fresh : ITEMS;
  const item = pool[rng.int(pool.length)];
  if (item !== undefined) w.build.push(item.id);
}
