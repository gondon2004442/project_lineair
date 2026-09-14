/** Единственная точка, через которую проходит урон. */
import type { Entity, World } from '../ecs';
import { TUNING } from '../tuning';

export function applyDamage(w: World, target: Entity, amount: number): boolean {
  const h = w.health.get(target);
  if (h === undefined || h.hp <= 0 || h.iframes > 0) return false;
  // Ревизор неуязвим, пока не закончил опись имущества участка.
  const auditor = w.auditorC.get(target);
  if (auditor !== undefined && auditor.phase !== 'open') return false;

  h.hp -= amount;
  h.flash = TUNING.feel.flashTime;

  const isPlayer = target === w.player;
  const killed = h.hp <= 0;

  if (isPlayer) {
    h.iframes = TUNING.player.hurtIFrames;
    addShake(w, TUNING.feel.shakePlayerHurt);
    addHitstop(w, TUNING.feel.hitstopPlayerHurt);
  } else if (killed) {
    addShake(w, TUNING.feel.shakeEnemyKill);
    addHitstop(w, TUNING.feel.hitstopEnemyKill);
  } else {
    addShake(w, TUNING.feel.shakeEnemyHit);
    addHitstop(w, TUNING.feel.hitstopEnemyHit);
  }
  return true;
}

export function addShake(w: World, amount: number): void {
  w.fx.shake = Math.min(TUNING.feel.shakeMax, w.fx.shake + amount);
}

export function addHitstop(w: World, seconds: number): void {
  w.fx.hitstop = Math.max(w.fx.hitstop, seconds);
}
