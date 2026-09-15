/** Один шаг симуляции. Порядок систем — здесь и больше нигде. */
import { flushDoomed, type World } from './ecs';
import { bulletSystem } from './systems/combat';
import { internSystem } from './systems/postIntern';
import { inspectorSystem } from './systems/postInspector';
import { auditorSystem } from './systems/postAuditor';
import { chiefSystem } from './systems/postChief';
import { courierSystem } from './systems/postCourier';
import { registrarSystem } from './systems/postRegistrar';
import { metronomeSystem, rosterSystem, separationSystem } from './systems/staff';
import { feedbackSystem, lifecycleSystem, statusSystem } from './systems/lifecycle';
import { physicsSystem } from './systems/physics';
import { propPushSystem, propSystem } from './systems/props';
import { telekinesisSystem } from './systems/telekinesis';
import { lobbySystem } from './systems/lobby';
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

  rosterSystem(w, STEP);
  const beforeBeat = w.beat;
  metronomeSystem(w, STEP);
  const beatStruck = w.beat !== beforeBeat;

  inspectorSystem(w, STEP, beatStruck);
  internSystem(w, STEP);
  registrarSystem(w, STEP);
  auditorSystem(w, STEP);
  chiefSystem(w, STEP);
  courierSystem(w, STEP);
  separationSystem(w, STEP);
  telekinesisSystem(w, STEP);
  propSystem(w, STEP);
  propPushSystem(w, STEP);
  physicsSystem(w, STEP);
  bulletSystem(w, STEP);
  lifecycleSystem(w, STEP);
  feedbackSystem(w, STEP);

  flushDoomed(w);
  if (w.scene === 'lobby') {
    lobbySystem(w);
  } else {
    roomSystem(w);
    statusSystem(w);
  }
  w.tick += 1;
}
