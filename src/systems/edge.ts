/**
 * КРАЙ. Падение в пустоту натурной части.
 *
 * Стен здесь нет — есть края. Плиты держат тех, кто на этом уровне
 * оформлен: штат ходит по ним и за кромку не выходит, потому что для
 * него пустота по-прежнему твёрдая. Субъект здесь не оформлен ни на
 * что, и его она не держит.
 *
 * Падение не убивает. Оно стоит прочности и секунды, и этого хватает:
 * сделай его смертью — и перестройка плит на ходу стала бы казнью, а не
 * приёмом.
 */
import { floorAt } from '../data/floors';
import type { World } from '../ecs';
import { isSolidPoint } from '../room';
import { TUNING } from '../tuning';
import { applyDamage } from './damage';

/** Есть ли на этом уровне края вместо стен. */
export function voidEdges(w: World): boolean {
  return floorAt(w.depth).voidEdges === true && w.scene === 'run';
}

/** Твёрдая ли точка для СУБЪЕКТА. За краем — нет: туда он и срывается. */
export function holdsSubject(w: World, x: number, y: number): boolean {
  if (voidEdges(w)) return false;
  return isSolidPoint(w.map, x, y);
}

export function edgeSystem(w: World, dt: number): void {
  const p = w.playerC.get(w.player);
  const t = w.transform.get(w.player);
  const b = w.body.get(w.player);
  if (p === undefined || t === undefined || b === undefined) return;

  if (p.fallTimer > 0) {
    p.fallTimer = Math.max(0, p.fallTimer - dt);
    b.vx = 0;
    b.vy = 0;
    if (p.fallTimer > 0) return;
    // Вернули на ту плиту, с которой ушёл. Прочность и секунда — вся
    // цена: здание не выбрасывает субъекта, оно его возвращает.
    t.x = p.safeX;
    t.y = p.safeY;
    t.px = t.x;
    t.py = t.y;
    applyDamage(w, w.player, TUNING.fall.damage);
    w.sounds.push('impact');
    return;
  }

  if (!voidEdges(w) || w.status !== 'playing') return;

  if (!isSolidPoint(w.map, t.x, t.y)) {
    // Стоит на плите: запоминаем место. Оно и есть точка возврата.
    p.safeX = t.x;
    p.safeY = t.y;
    return;
  }

  // Ушёл за кромку.
  p.fallTimer = TUNING.fall.time;
  p.charge = 0;
  p.queued = 0;
  p.held = -1;
  b.vx = 0;
  b.vy = 0;
  w.sounds.push('glass');
}
