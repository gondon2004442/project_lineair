/** Один шаг симуляции. Порядок систем — здесь и больше нигде. */
import { flushDoomed, type World } from './ecs';
import { blankSystem } from './systems/blank';
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
import { profiler } from './profiler';
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

  profiler.countStep();

  profiler.begin('СИМ: СУБЪЕКТ');
  // Бланк идёт до управления: он отменяет то, что уже летит, а не то,
  // что только появится на этом шаге.
  blankSystem(w);
  if (w.status !== 'dead') playerControlSystem(w, STEP);
  profiler.end('СИМ: СУБЪЕКТ');

  profiler.begin('СИМ: ШТАТ');
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
  profiler.end('СИМ: ШТАТ');

  profiler.begin('СИМ: ТЕЛЕКИНЕЗ');
  telekinesisSystem(w, STEP);
  propSystem(w, STEP);
  propPushSystem(w, STEP);
  profiler.end('СИМ: ТЕЛЕКИНЕЗ');

  profiler.begin('СИМ: ФИЗИКА');
  physicsSystem(w, STEP);
  profiler.end('СИМ: ФИЗИКА');

  profiler.begin('СИМ: ПУЛИ');
  bulletSystem(w, STEP);
  profiler.end('СИМ: ПУЛИ');

  profiler.begin('СИМ: ЦИКЛ ЖИЗНИ');
  lifecycleSystem(w, STEP);
  feedbackSystem(w, STEP);

  flushDoomed(w);
  if (w.scene === 'lobby') {
    lobbySystem(w);
  } else {
    roomSystem(w);
    statusSystem(w);
  }
  profiler.end('СИМ: ЦИКЛ ЖИЗНИ');
  w.tick += 1;
}
