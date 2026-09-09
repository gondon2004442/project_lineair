/** Жизнь пули: время, бетон, попадание. */
import { destroyEntity, type World } from '../ecs';
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

    if (bullet.faction === 'player') {
      for (const [target] of w.enemyC) {
        if (hit(w, e, b.radius, target)) {
          applyDamage(w, target, bullet.damage);
          destroyEntity(w, e);
          break;
        }
      }
    } else if (hit(w, e, b.radius, w.player)) {
      if (applyDamage(w, w.player, bullet.damage)) destroyEntity(w, e);
    }
  }
}

function hit(w: World, bulletEntity: number, bulletRadius: number, target: number): boolean {
  const bt = w.transform.get(bulletEntity);
  const tt = w.transform.get(target);
  const tb = w.body.get(target);
  if (bt === undefined || tt === undefined || tb === undefined) return false;
  const reach = bulletRadius + tb.radius;
  return (bt.x - tt.x) ** 2 + (bt.y - tt.y) ** 2 <= reach * reach;
}
