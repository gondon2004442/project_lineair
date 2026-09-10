/**
 * Стажёр. Не атакует вообще: ни пуль, ни урона от касания.
 * Ходит по маршруту из случайных точек участка.
 * Получив приказ, встаёт, мигает пустой табличкой и переназначается.
 */
import type { World } from '../ecs';
import { randomFloorPoint } from '../room';
import { reassign } from '../spawn';
import { TUNING } from '../tuning';
import { approach } from './staff';

export function internSystem(w: World, dt: number): void {
  const cfg = TUNING.post.intern;

  for (const [e, intern] of [...w.internC]) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;

    if (intern.phase === 'promotion') {
      intern.timer -= dt;
      staff.plateFlash = cfg.promotionTime;
      b.vx = approach(b.vx, 0, cfg.friction * dt);
      b.vy = approach(b.vy, 0, cfg.friction * dt);
      if (intern.timer <= 0) reassign(w, e, intern.promoteTo);
      continue;
    }

    const dx = intern.targetX - t.x;
    const dy = intern.targetY - t.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= cfg.waypointReach) {
      intern.timer -= dt;
      b.vx = approach(b.vx, 0, cfg.friction * dt);
      b.vy = approach(b.vy, 0, cfg.friction * dt);
      if (intern.timer <= 0) {
        const spot = randomFloorPoint(w.map, (n) => w.rng.int(n), TUNING.floor.spawnAttempts);
        intern.targetX = spot.x;
        intern.targetY = spot.y;
        intern.timer = cfg.waypointPause;
      }
      continue;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    b.vx = approach(b.vx, nx * cfg.speed, cfg.accel * dt);
    b.vy = approach(b.vy, ny * cfg.speed, cfg.accel * dt);
  }
}
