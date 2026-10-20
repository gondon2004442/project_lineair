/**
 * ОЧИЩЕНИЕ ЭТАЖА. То, что следует за актом приёмки.
 *
 * Субъект никого не лечит и ничего не чинит. Он забрал печать — значит
 * подписал приёмку: работы на уровне закрыты. Дальше всё следует по
 * процедуре и без всякой магии:
 *
 *   производство закрыто       → искажение снимается;
 *   участок сдан               → временные назначения аннулируются;
 *   назначения аннулированы    → люди перестают быть должностями.
 *
 * Волна идёт по графу от приёмной, помещение за помещением. Это не
 * украшение: именно она даёт увидеть, что здание сдаётся по частям, а
 * не гаснет разом.
 */
import { DIRS } from '../room';
import type { Entity, World } from '../ecs';
import { TUNING } from '../tuning';
import { floorAt } from '../data/floors';
import { placeVerdict } from '../world';

/** Подписан ли акт приёмки этого уровня. */
export function cleansed(w: World): boolean {
  return w.cleanse >= 0;
}

/** Дошла ли волна до этого помещения. */
export function cleansedRoom(w: World, index: number): boolean {
  const room = w.floor.rooms[index];
  if (room === undefined || !cleansed(w)) return false;
  return w.cleanse >= room.cleanseDelay;
}

/**
 * Искажение уровня с учётом приёмки. Всё, что спрашивает «какое здесь
 * искажение», обязано спрашивать через эту точку: закрытое производство
 * не искажает ничего.
 */
export function distortionNow(w: World, spec: { distortion: string }): string {
  return cleansed(w) ? '' : spec.distortion;
}

/**
 * Запустить волну. Задержки раздаются по графу от приёмной заливкой —
 * тем же порядком, которым собиралась связность этажа.
 */
export function startCleanse(w: World): void {
  if (cleansed(w)) return;
  const cfg = TUNING.cleanse;
  for (const room of w.floor.rooms) room.cleanseDelay = Infinity;
  const first = w.floor.rooms[w.floor.end];
  if (first === undefined) return;
  first.cleanseDelay = 0;
  const queue: number[] = [first.index];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const room = at === undefined ? undefined : w.floor.rooms[at];
    if (room === undefined) continue;
    for (const dir of DIRS) {
      const next = w.floor.rooms[room.neighbors[dir]];
      if (next === undefined || next.cleanseDelay !== Infinity) continue;
      next.cleanseDelay = room.cleanseDelay + cfg.roomDelay;
      queue.push(next.index);
    }
  }
  // Отрезанное волной помещение всё равно сдаётся: недостижимых на этаже
  // не бывает, но падать из-за этого забег не должен.
  for (const room of w.floor.rooms) {
    if (room.cleanseDelay === Infinity) room.cleanseDelay = 0;
  }
  w.cleanse = 0;
  w.sounds.push('door.unlock');
}

/**
 * Снять сотрудника с должности. Компоненты поведения снимаются с него
 * совсем: так ни одна система должностей его больше не видит, и не надо
 * просить девять систем помнить про ещё один флаг.
 */
export function retire(w: World, e: Entity): void {
  const staff = w.staffC.get(e);
  if (staff === undefined || staff.retired) return;
  staff.retired = true;
  staff.frozen = 0;
  staff.pinned = 0;
  staff.plateFlash = 0;
  staff.control = false;
  w.internC.delete(e);
  w.inspectorC.delete(e);
  w.registrarC.delete(e);
  w.auditorC.delete(e);
  w.chiefC.delete(e);
  w.archivistC.delete(e);
  w.keeperC.delete(e);
  w.commissionC.delete(e);
  w.courierC.delete(e);
  const b = w.body.get(e);
  if (b !== undefined) {
    b.vx = 0;
    b.vy = 0;
  }
  w.record.retired += 1;
}

/** Числится ли сотрудник на ставке: снятые в штат не входят. */
/**
 * Опустить подвешенных этого помещения. Считаются они ровно один раз на
 * помещение: оборудование ставится заново при каждом входе, а спасённый
 * остаётся тем же человеком, сколько раз ни возвращайся.
 */
export function landHung(w: World, room: { landed: boolean }): boolean {
  let landed = 0;
  for (const [, fixture] of w.fixtureC) {
    if (!fixture.hung) continue;
    fixture.hung = false;
    landed += 1;
  }
  if (landed === 0) return false;
  if (!room.landed) {
    room.landed = true;
    w.record.retired += landed;
  }
  return true;
}

export function onDuty(w: World): number {
  let count = 0;
  for (const [, staff] of w.staffC) {
    if (!staff.retired) count += 1;
  }
  return count;
}

export function cleanseSystem(w: World, dt: number): void {
  if (!cleansed(w)) return;
  w.cleanse += dt;
  const room = w.floor.rooms[w.room];
  if (room === undefined) return;
  if (w.cleanse < room.cleanseDelay + TUNING.cleanse.staffRiseDelay) return;

  // Волна дошла: таблички падают, бетон отступает, назначений больше
  // нет. Они не бьются и не исчезают — садятся.
  let any = false;
  for (const [e, staff] of w.staffC) {
    if (staff.retired) continue;
    retire(w, e);
    room.savedHere = true;
    any = true;
  }
  // Центральный архив открывается, как только приёмка дошла до него:
  // Комиссия отстранена, и дело наконец можно взять в руки.
  const spec = floorAt(w.depth);
  if (spec.verdict === true && w.room === w.floor.end) placeVerdict(w, room);

  // Подвешенные опускаются на пол. Приёмка закрывает и их дела тоже —
  // по ним решение не принимали, а теперь приняли.
  if (landHung(w, room)) {
    room.savedHere = true;
    any = true;
  }
  if (any) w.sounds.push('stamp');
}
