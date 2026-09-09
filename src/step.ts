/** Один шаг симуляции. Порядок систем — здесь и больше нигде. */
import { flushDoomed, type World } from './ecs';
import { bulletSystem } from './systems/combat';
import { enemyAiSystem, enemySeparationSystem } from './systems/enemyAi';
import { feedbackSystem, lifecycleSystem, statusSystem } from './systems/lifecycle';
import { physicsSystem } from './systems/physics';
import { roomSystem } from './systems/rooms';
import { playerControlSystem } from './systems/playerControl';
import { STEP } from './tuning';

export function step(w: World): void {
  for (const t of w.transform.values()) {
    t.px = t.x;
    t.py = t.y;
  }

  // Стоп-кадр: мир замер, кадры продолжают идти.
  if (w.fx.hitstop > 0) {
    w.fx.hitstop -= STEP;
    feedbackSystem(w, STEP);
    return;
  }

  if (w.status !== 'dead') playerControlSystem(w, STEP);
  enemyAiSystem(w, STEP);
  enemySeparationSystem(w, STEP);
  physicsSystem(w, STEP);
  bulletSystem(w, STEP);
  lifecycleSystem(w, STEP);
  feedbackSystem(w, STEP);

  flushDoomed(w);
  roomSystem(w);
  statusSystem(w);
  w.tick += 1;
}
