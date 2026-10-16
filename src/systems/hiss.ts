/**
 * КРАСНОЕ СОСТОЯНИЕ: когда оно включается.
 *
 * Это не «бой с боссом», а приостановка допуска. Пока она длится,
 * субъект не сотрудник, а посторонний в помещении — и красный, который
 * принадлежал ему как служебный цвет, у него забирают вместе с допуском.
 *
 * Система ничего не хранит: цель каждый шаг выводится из состояния мира.
 * Так её нельзя рассинхронить — ни смертью босса, ни сменой участка, ни
 * перестройкой. Как цель превращается в кадр, решает рендер.
 */
import { floorAt } from '../data/floors';
import type { World } from '../ecs';
import { TUNING } from '../tuning';

/**
 * Идёт ли заседание: мы в приёмной, и держатель печати этого уровня ещё
 * жив.
 *
 * Признак именно такой, а не «есть компонент одного из боссов». Во-
 * первых, держатель печати у каждого уровня свой и меняется вместе с
 * темой этажа — по компонентам это пришлось бы помнить в двух местах.
 * Во-вторых, старшая ставка встречается и на рядовом участке как
 * мини-босс, а заседание бывает только в приёмной: именно там
 * приостанавливают допуск.
 */
export function seated(w: World): boolean {
  if (w.room !== w.floor.end) return false;
  const holder = floorAt(w.depth).sealHolder;
  if (holder === '') return false;
  for (const [e, staff] of w.staffC) {
    if (staff.post !== holder || staff.retired) continue;
    if ((w.health.get(e)?.hp ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Перелом фазы. Читается по самим боссам, а не по отдельному флагу:
 * у Заведующего это пауза между фазами, у Архивариуса — подъём кольца
 * заново. У Смотрителя и Комиссии фаз в этом смысле нет: смотритель
 * ведёт один бой от начала до конца, а председательство у комиссии
 * меняется каждые несколько секунд, и рывок на каждой смене был бы не
 * переломом, а миганием.
 */
function phaseBreak(w: World): boolean {
  for (const [, chief] of w.chiefC) {
    if (chief.breakTimer > 0) return true;
  }
  for (const [, boss] of w.archivistC) {
    if (boss.raiseTimer > 0) return true;
  }
  return false;
}

export function hissSystem(w: World, dt: number): void {
  const cfg = TUNING.hiss;
  w.fx.seatTitle = Math.max(0, w.fx.seatTitle - dt);

  let want = 0;
  if (w.scene === 'run' && w.status === 'playing') {
    if (seated(w)) {
      want = phaseBreak(w) ? cfg.phaseKick : cfg.seat;
    } else if (w.record.controlHere > 0) {
      // Внеплановая проверка: красное частично. Игрок видит по кадру,
      // насколько он накосячил, и для этого не нужно ни одной цифры.
      want = cfg.control;
    }
  }

  // Титр выдаётся на входе в заседание и только на нём: проверка — не
  // заседание, у неё своя громкость.
  if (want >= cfg.seat && w.fx.hiss < cfg.seat) {
    w.fx.seatTitle = cfg.titleTime;
    w.sounds.push('stamp');
  }
  w.fx.hiss = want;
}
