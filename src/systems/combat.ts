/** Жизнь снаряда: время, бетон, наведение, попадание и пробитие. */
import { destroyEntity, type Entity, type World } from '../ecs';
import { isSolidPoint } from '../room';
import { applyDamage } from './damage';

export function bulletSystem(w: World, dt: number): void {
  for (const [e, bullet] of w.bulletC) {
    const t = w.transform.get(e);
    if (t === undefined) continue;

    bullet.life -= dt;
    if (bullet.life <= 0 || isSolidPoint(w.map, t.x, t.y)) {
      destroyEntity(w, e);
      continue;
    }

    const b = w.body.get(e);
    if (b === undefined) continue;

    if (bullet.homing > 0) steer(w, e, t.x, t.y, b, bullet.homing * dt);

    if (bullet.faction === 'player') {
      for (const [target] of w.staffC) {
        if (target === bullet.lastHit || !hit(w, e, b.radius, target)) continue;
        applyDamage(w, target, bullet.damage);
        bullet.lastHit = target;
        // Пробивающий снаряд идёт дальше, пока не выберет запас.
        if (bullet.pierce <= 0) {
          destroyEntity(w, e);
          break;
        }
        bullet.pierce -= 1;
      }
    } else if (hit(w, e, b.radius, w.player)) {
      if (applyDamage(w, w.player, bullet.damage)) destroyEntity(w, e);
    }
  }
}

/** Доворот на ближайшего сотрудника, не быстрее заданного угла за шаг. */
function steer(
  w: World,
  bulletEntity: Entity,
  x: number,
  y: number,
  b: { vx: number; vy: number },
  maxTurn: number,
): void {
  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;
  for (const [target] of w.staffC) {
    if (target === w.bulletC.get(bulletEntity)?.lastHit) continue;
    const t = w.transform.get(target);
    if (t === undefined) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist >= bestDist) continue;
    bestDist = dist;
    bestX = dx;
    bestY = dy;
  }
  if (bestDist === Infinity) return;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed === 0) return;
  const current = Math.atan2(b.vy, b.vx);
  const wanted = Math.atan2(bestY, bestX);
  let delta = wanted - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
  const next = current + turn;
  b.vx = Math.cos(next) * speed;
  b.vy = Math.sin(next) * speed;
}

function hit(w: World, bulletEntity: number, bulletRadius: number, target: number): boolean {
  const bt = w.transform.get(bulletEntity);
  const tt = w.transform.get(target);
  const tb = w.body.get(target);
  if (bt === undefined || tt === undefined || tb === undefined) return false;
  const reach = bulletRadius + tb.radius;
  return (bt.x - tt.x) ** 2 + (bt.y - tt.y) ** 2 <= reach * reach;
}
