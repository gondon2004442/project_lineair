/**
 * Курьер. Не бьёт вообще: ни снарядов, ни урона от касания.
 * Бежит к ближайшей двери и вызывает подкрепление из соседнего сектора.
 *
 * Нарочно медленный. Это задача на перехват, а не внезапное удвоение
 * участка: субъект быстрее его вчетверо, успеть можно всегда — вопрос
 * в том, бросишь ли ты ради этого текущую перестрелку. Пока он стоит
 * у двери и вызывает, есть ещё одно окно, чтобы его снять.
 */
import { POST_INSPECTOR, POST_INTERN } from '../data/posts';
import { destroyEntity, type Entity, type World } from '../ecs';
import { DIRS, doorCells, entryPosition, type Dir } from '../room';
import { spawnStaff } from '../spawn';
import { TUNING } from '../tuning';
import { approach } from './staff';

export function courierSystem(w: World, dt: number): void {
  const cfg = TUNING.post.courier;
  const room = w.floor.rooms[w.room];

  for (const [e, courier] of [...w.courierC]) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined || room === undefined) continue;

    if (courier.door < 0 || room.neighbors[courier.door as Dir] < 0) {
      courier.door = nearestDoor(w, t.x, t.y);
      courier.approachTimer = cfg.reachTimeout;
      if (courier.door < 0) {
        // Дверей нет вовсе — вызывать некуда, курьер просто стоит.
        b.vx = approach(b.vx, 0, cfg.friction * dt);
        b.vy = approach(b.vy, 0, cfg.friction * dt);
        continue;
      }
    }

    const goal = doorPoint(courier.door as Dir, w.map.size);
    const dx = goal.x - t.x;
    const dy = goal.y - t.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (courier.phase === 'deliver') {
      staff.plateFlash = cfg.deliverTime;
      courier.timer -= dt;
      b.vx = approach(b.vx, 0, cfg.friction * dt);
      b.vy = approach(b.vy, 0, cfg.friction * dt);
      if (courier.timer <= 0) {
        deliver(w, courier.door as Dir);
        // Вызов передан, курьер уходит в соседний сектор.
        destroyEntity(w, e);
        w.courierC.delete(e);
      }
      continue;
    }

    if (dist <= cfg.reach) {
      courier.phase = 'deliver';
      courier.timer = cfg.deliverTime;
      continue;
    }

    // Пути он не ищет: упёрся в бетон — выбирает другую дверь.
    courier.approachTimer -= dt;
    if (courier.approachTimer <= 0) {
      courier.door = -1;
      continue;
    }

    b.vx = approach(b.vx, (dx / dist) * cfg.speed, cfg.accel * dt);
    b.vy = approach(b.vy, (dy / dist) * cfg.speed, cfg.accel * dt);
  }
}

/** Подкрепление входит через ту самую дверь, в которую стучали. */
function deliver(w: World, dir: Dir): void {
  const spot = entryPosition(w.map, dir);
  const count = Math.max(0, Math.round(TUNING.post.courier.reinforceCount));
  for (let i = 0; i < count; i++) {
    const post = i % 2 === 0 ? POST_INSPECTOR : POST_INTERN;
    const offset = (i - (count - 1) / 2) * w.map.size;
    spawnStaff(w, post, TUNING.post.registrar.hirePriority, spot.x + offset, spot.y);
  }
}

function nearestDoor(w: World, x: number, y: number): number {
  const room = w.floor.rooms[w.room];
  if (room === undefined) return -1;
  let best = -1;
  let bestDist = Infinity;
  for (const dir of DIRS) {
    if (room.neighbors[dir] < 0) continue;
    const goal = doorPoint(dir, w.map.size);
    const dist = Math.hypot(goal.x - x, goal.y - y);
    if (dist >= bestDist) continue;
    bestDist = dist;
    best = dir;
  }
  return best;
}

/** Середина дверного проёма в пикселях. */
function doorPoint(dir: Dir, size: number): { x: number; y: number } {
  const cells = doorCells(dir);
  const first = cells[0];
  const second = cells[1];
  if (first === undefined || second === undefined) return { x: 0, y: 0 };
  return {
    x: ((first[0] + second[0] + 1) / 2) * size,
    y: ((first[1] + second[1] + 1) / 2) * size,
  };
}

/** Кого из курьеров показывать в оверлее. Куда он бежит — видно по нему самому. */
export function courierTarget(w: World): { entity: Entity; dir: Dir } | null {
  for (const [e, courier] of w.courierC) {
    if (courier.door < 0) continue;
    return { entity: e, dir: courier.door as Dir };
  }
  return null;
}
