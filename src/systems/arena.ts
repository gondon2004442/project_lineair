/**
 * АРЕНА НАЧАЛЬНИКА. Перестройка помещения между фазами.
 *
 * Система для неё уже написана под натурную часть, и здесь она работает
 * второй раз, уже как боевая механика: мебель переезжает, часть укрытий
 * исчезает, появляются новые. Заученное расположение перестаёт работать
 * ровно в тот момент, когда игрок на него положился.
 *
 * Фаза у каждого начальника своя и читается по нему самому:
 *
 *   заведующий и кадровик — их собственная ступень по прочности;
 *   комиссия              — сколько её членов осталось;
 *   архивариус, смотритель — пройденные пороги прочности.
 *
 * Отдельного флага «сменилась фаза» нет ни у кого: сигнатура считается
 * каждый шаг, и перестройку запускает её изменение. Так ни один
 * начальник не может забыть о ней сообщить.
 */
import type { World } from '../ecs';
import { TUNING } from '../tuning';
import { rebuildRoom } from '../world';

/** Сколько порогов прочности пройдено. Общая мерка для тех, у кого нет фаз. */
function steps(w: World, e: number): number {
  const h = w.health.get(e);
  if (h === undefined || h.max <= 0) return 0;
  const left = h.hp / h.max;
  const cfg = TUNING.arena;
  return (left <= cfg.phaseThreeAt ? 1 : 0) + (left <= cfg.phaseTwoAt ? 1 : 0);
}

/**
 * Сигнатура фаз всех начальников в помещении. Число само по себе ничего
 * не значит — значит только то, что оно изменилось.
 */
export function bossPhase(w: World): number {
  let sum = 0;
  for (const [, chief] of w.chiefC) sum += chief.stage;
  for (const [, boss] of w.personnelC) sum += boss.stage * 8;
  for (const [e] of w.archivistC) sum += steps(w, e) * 64;
  for (const [e] of w.keeperC) sum += steps(w, e) * 512;
  // Комиссия: фаза это то, сколько её осталось. Орган из троих меняется
  // не прочностью, а составом.
  if (w.commissionC.size > 0) sum += (3 - w.commissionC.size) * 4096;
  return sum;
}

export function arenaSystem(w: World, dt: number): void {
  w.arenaGap = Math.max(0, w.arenaGap - dt);
  const phase = bossPhase(w);
  if (phase === w.arena) return;

  const first = w.arena < 0;
  w.arena = phase;
  // Первый замер в помещении ничего не перестраивает: это не смена
  // фазы, это появление начальника.
  if (first || phase === 0) return;
  // И не чаще, чем раз в arena.minGap: две фазы, упавшие в один шаг,
  // не должны перетряхивать комнату дважды.
  if (w.arenaGap > 0) return;
  w.arenaGap = TUNING.arena.minGap;
  rebuildRoom(w);
}
