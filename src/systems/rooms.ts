/** Двери участка: запираются на входе, открываются по зачистке. */
import type { World } from '../ecs';
import { DIRS, opposite, standingInDoor } from '../room';
import { enterRoom } from '../world';

export function roomSystem(w: World): void {
  const room = w.floor.rooms[w.room];
  if (room === undefined) return;

  if (!room.cleared && w.staffC.size === 0) {
    room.cleared = true;
    w.map.doorsLocked = false;
    w.mapToken += 1;
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
