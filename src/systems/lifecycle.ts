/** Таймеры тел, смерть и состояние забега. */
import { destroyEntity, type World } from '../ecs';
import { TUNING } from '../tuning';

export function lifecycleSystem(w: World, dt: number): void {
  for (const [e, h] of w.health) {
    h.iframes = Math.max(0, h.iframes - dt);
    h.flash = Math.max(0, h.flash - dt);
    if (h.hp > 0) continue;

    if (e === w.player) {
      if (w.status !== 'dead') {
        w.status = 'dead';
        const b = w.body.get(e);
        if (b !== undefined) {
          b.vx = 0;
          b.vy = 0;
        }
      }
    } else {
      destroyEntity(w, e);
    }
  }
}

/** Проверяется после фактического удаления сущностей. */
export function statusSystem(w: World): void {
  if (w.status === 'playing' && w.enemyC.size === 0) w.status = 'cleared';
}

export function feedbackSystem(w: World, dt: number): void {
  w.fx.shake = Math.max(0, w.fx.shake - TUNING.feel.shakeDecay * dt);
}
