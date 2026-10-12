/**
 * БЛАНК. Пустая форма, приказ об отмене.
 *
 * Механически это выход из безнадёжной ситуации ценой ресурса: всё, что
 * летит в радиусе, аннулируется как неоформленное, сотрудников отбрасывает
 * от субъекта, каждому — небольшой урон. Платишь не здоровьем, а бланком,
 * и поэтому бланк всегда решение, а не рефлекс.
 *
 * Ничего случайного здесь нет: один seed и то же нажатие дают тот же
 * результат до пикселя.
 */
import { destroyEntity, type World } from '../ecs';
import { TUNING } from '../tuning';
import { applyDamage } from './damage';
import { bodyMass, kick, shove } from './impulse';

export function blankSystem(w: World): void {
  if (!w.input.blankQueued) return;
  w.input.blankQueued = false;
  if (w.scene !== 'run' || w.status !== 'playing') return;
  if (w.blanks <= 0) return;

  const t = w.transform.get(w.player);
  if (t === undefined) return;

  const cfg = TUNING.blank;
  w.blanks -= 1;
  w.sounds.push('blank');
  w.fx.blankTime = cfg.ringTime;
  w.fx.blankX = t.x;
  w.fx.blankY = t.y;
  w.fx.slowMo = cfg.slowMoTime;

  const reach = cfg.cancelRadius * cfg.cancelRadius;

  // Снаряды объекта в радиусе — аннулированы. Свои не трогаем: бланк
  // отменяет чужие предписания, а не собственный огонь.
  for (const [e, bullet] of w.bulletC) {
    if (bullet.faction === 'player') continue;
    const bt = w.transform.get(e);
    if (bt === undefined) continue;
    const dx = bt.x - t.x;
    const dy = bt.y - t.y;
    if (dx * dx + dy * dy > reach) continue;
    destroyEntity(w, e);
  }

  // Сотрудников отталкивает и слегка задевает. Урон идёт через общую
  // точку, поэтому неуязвимость Ревизора во время описи бланк не обходит.
  for (const [e] of w.staffC) {
    const st = w.transform.get(e);
    const body = w.body.get(e);
    if (st === undefined) continue;
    const dx = st.x - t.x;
    const dy = st.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach) continue;
    const len = Math.sqrt(d2) || 1;
    if (body !== undefined) {
      body.vx += (dx / len) * cfg.pushForce;
      body.vy += (dy / len) * cfg.pushForce;
    }
    // Волна сильнее у центра и слабеет к краю.
    const falloff = 1 - Math.min(1, len / cfg.cancelRadius);
    const k = (TUNING.physics.blankKick * falloff) / bodyMass(w, e);
    kick(w, e, (dx / len) * k, (dy / len) * k);
    applyDamage(w, e, cfg.damage);
  }

  // Мебель разлетается от субъекта: волна бланка толкает всё, что не
  // прибито, и быстрое становится снарядом.
  for (const [e] of w.propC) {
    const pt = w.transform.get(e);
    if (pt === undefined) continue;
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach || d2 === 0) continue;
    const len = Math.sqrt(d2);
    const falloff = 1 - Math.min(1, len / cfg.cancelRadius);
    const push = TUNING.physics.blankPropPush * falloff;
    shove(w, e, (dx / len) * push, (dy / len) * push);
  }
}
