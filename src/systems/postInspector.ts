/**
 * Инспектор. Ходит как ладья: только по осям, повороты на 90 градусов.
 * Стреляет строго по доле общего метронома — прямо в субъекта.
 * Направление защёлкивается на доле и дальше не ведётся: линию огня видно
 * заранее, уходить от неё надо движением, а не стоянием вне оси.
 */
import type { World } from '../ecs';
import { spawnBullet } from '../spawn';
import { DEG, TUNING } from '../tuning';
import { approach } from './staff';

export function inspectorSystem(w: World, dt: number, beatStruck: boolean): void {
  const pt = w.transform.get(w.player);
  const alive = pt !== undefined && w.status !== 'dead';
  const cfg = TUNING.post.inspector;

  for (const [e, inspector] of w.inspectorC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;

    let desiredVx = 0;
    let desiredVy = 0;

    if (alive && pt !== undefined) {
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;

      // Ось выбирается по большему расхождению и держится, пока
      // расхождение по ней не станет меньше порога.
      const along = inspector.axis === 0 ? dx : dy;
      const across = inspector.axis === 0 ? dy : dx;
      if (Math.abs(along) < cfg.axisSwitchBias && Math.abs(across) >= cfg.axisSwitchBias) {
        inspector.axis = inspector.axis === 0 ? 1 : 0;
      }
      // Ход по чужой оси гасится сразу: иначе на повороте старая ось
      // тормозит, пока новая разгоняется, и ладья на пару кадров едет
      // по диагонали.
      if (inspector.axis === 0) b.vy = 0;
      else b.vx = 0;

      const dist = Math.hypot(dx, dy);
      const offset = inspector.axis === 0 ? dx : dy;
      let step = 0;
      if (dist > cfg.standoff) step = Math.sign(offset);
      else if (dist < cfg.standoff * cfg.backoffRatio) step = -Math.sign(offset);

      if (inspector.axis === 0) desiredVx = step * cfg.speed;
      else desiredVy = step * cfg.speed;

      // Телеграф: табличка вспыхивает за долю до выстрела.
      if (w.metronome <= cfg.telegraphLead) staff.plateFlash = cfg.telegraphLead;

      if (beatStruck) {
        inspector.shotsLeft = Math.max(1, Math.round(cfg.shotsPerBeat));
        inspector.shotTimer = 0;
        // Прицел защёлкивается на доле и дальше не ведётся.
        const len = Math.hypot(dx, dy) || 1;
        inspector.aimX = dx / len;
        inspector.aimY = dy / len;
      }

      if (inspector.shotsLeft > 0) {
        inspector.shotTimer -= dt;
        if (inspector.shotTimer <= 0) {
          const muzzle = b.radius + TUNING.enemyBullet.radius;
          const angle =
            Math.atan2(inspector.aimY, inspector.aimX) +
            w.rng.spread(TUNING.enemyBullet.spreadDeg * DEG);
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          spawnBullet(
            w,
            'enemy',
            TUNING.enemyBullet,
            t.x + dirX * muzzle,
            t.y + dirY * muzzle,
            dirX,
            dirY,
          );
          inspector.shotsLeft -= 1;
          inspector.shotTimer = cfg.shotGap;
        }
      }
    }

    const moving = desiredVx !== 0 || desiredVy !== 0;
    const rate = (moving ? cfg.accel : cfg.friction) * dt;
    b.vx = approach(b.vx, desiredVx, rate);
    b.vy = approach(b.vy, desiredVy, rate);
  }
}
