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
import { ITEMS_BY_ID, type Item } from '../data/items';
import { WEAPON_FORMS } from '../data/weaponForms';
import type { World } from '../ecs';
import { DIRS, entryPosition } from '../room';
import { TUNING, getTuning } from '../tuning';
import { ammoMax } from '../weapon';

/** Реестр эффектов. Ключ тот же, что в TUNING.tool. */
const EFFECTS: Record<string, (w: World) => boolean> = {
  mail: refillClip,
  transfer: toFarDoor,
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
