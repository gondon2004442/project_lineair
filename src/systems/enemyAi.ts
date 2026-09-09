/** Заражённый: подходит на дистанцию, кастует, бьёт очередью, отдыхает. */
import type { World } from '../ecs';
import { spawnBullet } from '../spawn';
import { DEG, TUNING } from '../tuning';

export function enemyAiSystem(w: World, dt: number): void {
  const pt = w.transform.get(w.player);
  const playerAlive = pt !== undefined && w.status !== 'dead';

  for (const [e, enemy] of w.enemyC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;

    let desiredVx = 0;
    let desiredVy = 0;

    if (playerAlive && pt !== undefined) {
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const range = TUNING.enemy.preferredRange;

      enemy.timer -= dt;

      switch (enemy.phase) {
        case 'chase': {
          const inBand = dist <= range;
          const tooClose = dist < range * TUNING.enemy.backoffRatio;
          const forward = tooClose ? -1 : inBand ? 0 : 1;
          const strafe = inBand ? TUNING.enemy.strafeFactor * enemy.strafeSign : 0;
          desiredVx = (nx * forward - ny * strafe) * TUNING.enemy.speed;
          desiredVy = (ny * forward + nx * strafe) * TUNING.enemy.speed;
          if (!inBand) enemy.timer = TUNING.enemy.aimDelay;
          if (enemy.timer <= 0) {
            enemy.phase = 'cast';
            enemy.timer = TUNING.enemy.castTime;
          }
          break;
        }
        case 'cast': {
          if (enemy.timer <= 0) {
            enemy.phase = 'burst';
            enemy.shotsLeft = TUNING.enemy.burstCount;
            enemy.timer = 0;
          }
          break;
        }
        case 'burst': {
          if (enemy.timer <= 0) {
            const angle = Math.atan2(ny, nx) + w.rng.spread(TUNING.enemyBullet.spreadDeg * DEG);
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const muzzle = TUNING.enemy.radius + TUNING.enemyBullet.radius;
            spawnBullet(w, 'enemy', t.x + dirX * muzzle, t.y + dirY * muzzle, dirX, dirY);
            enemy.shotsLeft -= 1;
            enemy.timer = TUNING.enemy.burstInterval;
            if (enemy.shotsLeft <= 0) {
              enemy.phase = 'recover';
              enemy.timer = TUNING.enemy.recoverTime;
              enemy.strafeSign = w.rng.float() < 0.5 ? -1 : 1;
            }
          }
          break;
        }
        case 'recover': {
          desiredVx = -ny * TUNING.enemy.speed * TUNING.enemy.strafeFactor * enemy.strafeSign;
          desiredVy = nx * TUNING.enemy.speed * TUNING.enemy.strafeFactor * enemy.strafeSign;
          if (enemy.timer <= 0) {
            enemy.phase = 'chase';
            enemy.timer = TUNING.enemy.aimDelay;
          }
          break;
        }
      }
    }

    const rate = (desiredVx === 0 && desiredVy === 0 ? TUNING.enemy.friction : TUNING.enemy.accel) * dt;
    b.vx = approach(b.vx, desiredVx, rate);
    b.vy = approach(b.vy, desiredVy, rate);
  }
}

/** Расталкивание: заражённые не слипаются в одну точку. */
export function enemySeparationSystem(w: World, dt: number): void {
  for (const [a] of w.enemyC) {
    const ta = w.transform.get(a);
    const ba = w.body.get(a);
    if (ta === undefined || ba === undefined) continue;
    for (const [b] of w.enemyC) {
      if (b <= a) continue;
      const tb = w.transform.get(b);
      const bb = w.body.get(b);
      if (tb === undefined || bb === undefined) continue;
      const dx = tb.x - ta.x;
      const dy = tb.y - ta.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ba.radius + bb.radius;
      if (dist >= minDist || dist === 0) continue;
      // Правим положение, а не скорость: скорость через кадр перетрёт ИИ,
      // и толпа схлопнется в один комок.
      const push = ((1 - dist / minDist) * TUNING.enemy.separationForce * dt) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      ta.x -= nx * push;
      ta.y -= ny * push;
      tb.x += nx * push;
      tb.y += ny * push;
    }
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}
