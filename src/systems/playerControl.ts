/** Прицел, разгон, рывок и стрельба субъекта. */
import type { World } from '../ecs';
import { spawnBullet } from '../spawn';
import { DEG, TUNING } from '../tuning';
import { addShake } from './damage';

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

export function playerControlSystem(w: World, dt: number): void {
  const e = w.player;
  const t = w.transform.get(e);
  const b = w.body.get(e);
  const p = w.playerC.get(e);
  const h = w.health.get(e);
  if (t === undefined || b === undefined || p === undefined || h === undefined) {
    w.input.dashQueued = false;
    return;
  }

  const toAimX = w.input.aimX - t.x;
  const toAimY = w.input.aimY - t.y;
  const aimLen = Math.hypot(toAimX, toAimY);
  if (aimLen > 0) {
    p.aimX = toAimX / aimLen;
    p.aimY = toAimY / aimLen;
  }

  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);

  if (w.input.dashQueued) {
    w.input.dashQueued = false;
    if (p.phase === 'normal' && p.dashCooldown <= 0) {
      const hasMove = w.input.moveX !== 0 || w.input.moveY !== 0;
      p.dashX = hasMove ? w.input.moveX : p.aimX;
      p.dashY = hasMove ? w.input.moveY : p.aimY;
      p.phase = 'dash';
      p.dashTime = TUNING.player.dashDuration;
      p.dashCooldown = TUNING.player.dashCooldown;
      h.iframes = Math.max(h.iframes, TUNING.player.dashIFrames);
    }
  }

  if (p.phase === 'dash') {
    const dashSpeed = TUNING.player.dashDistance / TUNING.player.dashDuration;
    b.vx = p.dashX * dashSpeed;
    b.vy = p.dashY * dashSpeed;
    p.dashTime -= dt;
    if (p.dashTime <= 0) {
      p.phase = 'normal';
      b.vx *= TUNING.player.dashExitFactor;
      b.vy *= TUNING.player.dashExitFactor;
    }
    // Во время рывка субъект не стреляет: рывок — это трата хода.
    return;
  }

  const targetVx = w.input.moveX * TUNING.player.speed;
  const targetVy = w.input.moveY * TUNING.player.speed;
  const rate = (w.input.moveX === 0 && w.input.moveY === 0 ? TUNING.player.friction : TUNING.player.accel) * dt;
  b.vx = approach(b.vx, targetVx, rate);
  b.vy = approach(b.vy, targetVy, rate);

  if (w.input.fireHeld && p.fireCooldown <= 0 && w.status !== 'dead') {
    p.fireCooldown = TUNING.playerBullet.interval;
    const angle = Math.atan2(p.aimY, p.aimX) + w.rng.spread(TUNING.playerBullet.spreadDeg * DEG);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    spawnBullet(
      w,
      'player',
      TUNING.playerBullet,
      t.x + dirX * TUNING.playerBullet.muzzle,
      t.y + dirY * TUNING.playerBullet.muzzle,
      dirX,
      dirY,
    );
    b.vx -= dirX * TUNING.player.recoil;
    b.vy -= dirY * TUNING.player.recoil;
    addShake(w, TUNING.feel.shakeShoot);
  }
}
