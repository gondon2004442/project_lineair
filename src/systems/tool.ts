/**
 * ИНВЕНТАРЬ: один активный предмет в слоте, применяется по E.
 *
 * Отличие от всего остального, что выдаёт контора: приложение и
 * инструкция правят числа и работают сами, а инвентарь лежит и ждёт
 * решения. Слот один, поэтому решение есть уже при подборе.
 *
 * Эффекты живут в реестре: ключ из данных предмета — функция здесь.
 * Функция вернула false — применения не было, и кулдаун не тратится:
 * нажать E на полной обойме не должно стоить ничего.
 */
import { PROP_RUBBLE } from '../data/props';
import { ITEMS_BY_ID, type Item } from '../data/items';
import { WEAPON_FORMS } from '../data/weaponForms';
import { destroyEntity, type World } from '../ecs';
import { DIRS, entryPosition } from '../room';
import { TUNING, getTuning } from '../tuning';
import { ammoMax } from '../weapon';
import { scatterTickets } from './tickets';

/** Реестр эффектов. Ключ тот же, что в TUNING.tool. */
const EFFECTS: Record<string, (w: World) => boolean> = {
  mail: refillClip,
  transfer: toFarDoor,
  suspend: suspendNearest,
  writeoff: writeOffProperty,
};

/** Положить предмет в слот. Занятый слот заменяется: слот один. */
export function equipTool(w: World, item: Item): void {
  if (item.active === undefined) return;
  w.tool = {
    id: item.id,
    cooldown: 0,
    charges: item.active.charges ?? -1,
  };
}

/**
 * Кулдаун применения с учётом выслуги. Формула та же, что у рывка:
 * контора доверяет проверенным, и доверие это одно на всё.
 */
export function toolCooldown(w: World, effect: string): number {
  const base = getTuning(`tool.${effect}.cooldown`);
  if (!Number.isFinite(base)) return 0;
  const rec = TUNING.record;
  const cut = Math.min(rec.serviceCooldownCap, w.record.service * rec.serviceCooldownStep);
  return Math.max(0, base * (1 - cut));
}

export function toolSystem(w: World, dt: number): void {
  const slot = w.tool;
  if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - dt);

  if (!w.input.toolQueued) return;
  w.input.toolQueued = false;
  // В вестибюле E занято перевыдачей seed, и спорить с ней незачем.
  if (w.scene !== 'run' || w.status === 'dead') return;
  if (slot.id === '' || slot.cooldown > 0 || slot.charges === 0) return;

  const item = ITEMS_BY_ID.get(slot.id);
  const effect = item?.active?.effect;
  if (effect === undefined) return;
  const run = EFFECTS[effect];
  if (run === undefined || !run(w)) return;

  slot.cooldown = toolCooldown(w, effect);
  if (slot.charges > 0) slot.charges -= 1;
  w.sounds.push('stamp');
}

/** ВНУТРЕННЯЯ ПОЧТА: обойма текущей формы полна, запас не тронут. */
function refillClip(w: World): boolean {
  const p = w.playerC.get(w.player);
  const form = p === undefined ? undefined : WEAPON_FORMS[p.form];
  if (p === undefined || form === undefined) return false;
  const max = ammoMax(w, form.id);
  if ((p.ammo[p.form] ?? 0) >= max) return false;
  p.ammo[p.form] = max;
  // Начатую перезарядку письмо отменяет: обойма уже полна.
  p.reloading = false;
  p.reloadTimer = 0;
  return true;
}

/** КОМАНДИРОВОЧНОЕ: субъект оказывается у самой дальней двери участка. */
function toFarDoor(w: World): boolean {
  const t = w.transform.get(w.player);
  const room = w.floor.rooms[w.room];
  if (t === undefined || room === undefined) return false;

  let best: { x: number; y: number } | null = null;
  let bestDist = -1;
  for (const dir of DIRS) {
    if (room.neighbors[dir] < 0) continue;
    const at = entryPosition(w.map, dir);
    const dist = Math.hypot(at.x - t.x, at.y - t.y);
    if (dist <= bestDist) continue;
    bestDist = dist;
    best = at;
  }
  if (best === null) return false;

  // Ставим не в самом проёме, а чуть внутрь: в проёме субъект стоит
  // одной ногой в стене, и первый же шаг его оттуда выталкивает.
  const inset = TUNING.tool.transferInset;
  const cx = (TUNING.room.wall + TUNING.room.cols / 2) * TUNING.room.tile;
  const cy = (TUNING.room.wall + TUNING.room.rows / 2) * TUNING.room.tile;
  const dx = cx - best.x;
  const dy = cy - best.y;
  const len = Math.hypot(dx, dy);
  const x = len > 0 ? best.x + (dx / len) * inset : best.x;
  const y = len > 0 ? best.y + (dy / len) * inset : best.y;

  t.x = x;
  t.y = y;
  // Прошлая точка тоже переставляется, иначе интерполяция протянет
  // субъекта через весь зал полосой.
  t.px = x;
  t.py = y;
  const b = w.body.get(w.player);
  if (b !== undefined) {
    b.vx = 0;
    b.vy = 0;
  }
  return true;
}

/**
 * ПРЕДПИСАНИЕ О ПРИОСТАНОВКЕ: ближайшая должность замирает.
 *
 * Не убивает и не оглушает — останавливает. Ревизор при этом перестаёт
 * считать, инспектор пропускает доли метронома, курьер стоит у самой
 * двери. Урон замерший получает как обычно: предписание снимает
 * давление, а не защищает того, кому вручено.
 */
function suspendNearest(w: World): boolean {
  const pt = w.transform.get(w.player);
  if (pt === undefined) return false;
  const reach = TUNING.tool.suspendRange;

  let target = -1;
  let best = reach * reach;
  for (const [e, staff] of w.staffC) {
    if (staff.frozen > 0) continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const d = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2;
    if (d > best) continue;
    best = d;
    target = e;
  }
  if (target < 0) return false;

  const staff = w.staffC.get(target);
  if (staff === undefined) return false;
  staff.frozen = TUNING.tool.suspendTime;
  // Телеграф для этого не годится: тот же контур означает «сейчас
  // ударит», и приостановленный читался бы как опасный. У предписания
  // свой знак — печать над головой.
  return true;
}

/**
 * АКТ О СПИСАНИИ: вся мебель участка списывается разом.
 *
 * Обломков не остаётся — остаются талоны: списанное имущество и есть
 * служебная мелочь. Взыскания за это нет, на то и акт: порча оформлена.
 * Зато и укрытий на участке больше нет, и это настоящая цена.
 */
function writeOffProperty(w: World): boolean {
  const p = w.playerC.get(w.player);
  let written = 0;

  for (const [e, prop] of [...w.propC]) {
    // Обломок списывать нечего, а то, что сейчас в руках или в полёте,
    // списывается вместе со всем: оно тоже имущество участка.
    if (prop.kind === PROP_RUBBLE) continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    if (p !== undefined && p.held === e) p.held = -1;
    destroyEntity(w, e);
    scatterTickets(w, t.x, t.y, Math.max(0, Math.round(TUNING.tool.writeoffTickets)), e);
    written += 1;
  }
  if (written === 0) return false;
  w.sounds.push('impact');
  return true;
}
