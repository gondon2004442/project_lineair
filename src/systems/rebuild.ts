/**
 * ПЕРЕСТРОЙКА. Искажение натурной части.
 *
 * Здание перестало притворяться и меняет помещение прямо посреди боя:
 * стены встают в новых местах, мебель переезжает. Укрытие исчезает не
 * потому, что его сломали, а потому, что комната решила иначе.
 *
 * Отсчёт идёт только там, где уровень этого требует, и только пока в
 * помещении есть кому стрелять: перестраивать зачищенный участок, по
 * которому игрок идёт к двери, — это помеха, а не приём.
 *
 * За warn секунд до перестройки начинает трясти. Предупреждение
 * обязательно: без него это не приём, а подножка.
 */
import { floorAt } from '../data/floors';
import type { World } from '../ecs';
import { TUNING } from '../tuning';
import { rebuildRoom } from '../world';

/** Перестраивается ли помещение на этом уровне. */
export function rebuilding(w: World): boolean {
  return floorAt(w.depth).distortion === 'rebuild';
}

export function rebuildSystem(w: World, dt: number): void {
  if (!rebuilding(w) || w.scene !== 'run' || w.status !== 'playing') {
    w.rebuildIn = 0;
    return;
  }
  const room = w.floor.rooms[w.room];
  if (room === undefined || room.cleared || w.staffC.size === 0) {
    w.rebuildIn = 0;
    return;
  }

  const cfg = TUNING.rebuild;
  if (w.rebuildIn <= 0) {
    w.rebuildIn = cfg.every;
    return;
  }

  const before = w.rebuildIn;
  w.rebuildIn = Math.max(0, w.rebuildIn - dt);

  // Предупреждение: последние секунды помещение мелко трясёт.
  if (w.rebuildIn <= cfg.warn) {
    const left = Math.max(0, w.rebuildIn / Math.max(0.001, cfg.warn));
    w.fx.shake = Math.max(w.fx.shake, cfg.shake * (1 - left) * 0.3);
  }

  if (before > 0 && w.rebuildIn <= 0) {
    rebuildRoom(w);
    w.rebuildIn = cfg.every;
  }
}
