/** Таймеры тел, смерть и состояние забега. */
import { destroyEntity, type World } from '../ecs';
import { TUNING } from '../tuning';

export function lifecycleSystem(w: World, dt: number): void {
  for (const [e, h] of w.health) {
    h.iframes = Math.max(0, h.iframes - dt);
    h.flash = Math.max(0, h.flash - dt);
    if (h.hp > 0) continue;

    // Разрушение предметов ведёт своя система: она оставляет обломок.
    if (w.propC.has(e)) continue;

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

/**
 * Этаж кончается приёмной. Ответвления можно не проходить —
 * их смысл в предметах, а не в обязательной зачистке.
 */
export function statusSystem(w: World): void {
  if (w.status !== 'playing') return;
  const office = w.floor.rooms[w.floor.end];
  if (office !== undefined && office.cleared) w.status = 'cleared';
}

export function feedbackSystem(w: World, dt: number): void {
  w.fx.shake = Math.max(0, w.fx.shake - TUNING.feel.shakeDecay * dt);
  // Кольцо бланка и замедление живут шагами симуляции, а не кадрами:
  // на медленной машине они не станут длиннее.
  w.fx.blankTime = Math.max(0, w.fx.blankTime - dt);
  w.fx.slowMo = Math.max(0, w.fx.slowMo - dt);
  w.fx.warpTime = Math.max(0, w.fx.warpTime - dt);
}
