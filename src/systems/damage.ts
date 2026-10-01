/** Единственная точка, через которую проходит урон. */
import type { Entity, World } from '../ecs';
import { TUNING } from '../tuning';
import { damageFactorAgainst } from '../weapon';
import { archivistOpen } from './postArchivist';

export function applyDamage(w: World, target: Entity, amount: number): boolean {
  const h = w.health.get(target);
  if (h === undefined || h.hp <= 0 || h.iframes > 0) return false;
  // Ревизор неуязвим, пока не закончил опись имущества участка.
  const auditor = w.auditorC.get(target);
  if (auditor !== undefined && auditor.phase !== 'open') return false;
  // Архивариус — пока не полез за делом. Окно открывает игрок, ломая
  // картотеки вокруг него.
  if (!archivistOpen(w, target)) return false;

  // Распоряжение против должности: множитель знает только эта точка,
  // потому что только здесь известно, в кого прилетело.
  const staff = w.staffC.get(target);
  if (staff !== undefined) amount *= damageFactorAgainst(w, staff.post);

  h.hp -= amount;
  h.flash = TUNING.feel.flashTime;

  const isPlayer = target === w.player;
  const killed = h.hp <= 0;

  if (isPlayer) {
    // Участок перестал быть пройденным начисто: выслуги за него не будет.
    w.record.roomClean = false;
    w.sounds.push('hurt.player');
    h.iframes = TUNING.player.hurtIFrames;
    addShake(w, TUNING.feel.shakePlayerHurt);
    addHitstop(w, TUNING.feel.hitstopPlayerHurt);
  } else if (killed) {
    w.sounds.push('kill.staff');
    addShake(w, TUNING.feel.shakeEnemyKill);
    addHitstop(w, TUNING.feel.hitstopEnemyKill);
  } else {
    w.sounds.push('hit.staff');
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
