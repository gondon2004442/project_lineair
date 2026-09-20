/**
 * Оружие: разрешение параметров с учётом выданных предметов.
 *
 * Предмет — набор правок к tuning-параметрам. Правка применяется
 * как (база + add) * mul, поэтому порядок предметов в билде
 * на результат не влияет.
 */
import { issuedDirectives } from './data/directives';
import { ITEMS_BY_ID, type ItemMod } from './data/items';
import { WEAPON_FORMS, type WeaponForm } from './data/weaponForms';
import type { World } from './ecs';
import { getTuning } from './tuning';

export function currentForm(w: World): WeaponForm {
  const player = w.playerC.get(w.player);
  const index = player === undefined ? 0 : player.form;
  const form = WEAPON_FORMS[((index % WEAPON_FORMS.length) + WEAPON_FORMS.length) % WEAPON_FORMS.length];
  if (form === undefined) throw new Error('Нет ни одной формы оружия');
  return form;
}

/** Значение параметра формы с учётом билда. */
export function formStat(w: World, formId: string, key: string): number {
  return statAt(w, `weapon.${formId}.${key}`);
}

export function statAt(w: World, path: string): number {
  let add = 0;
  let mul = 1;
  const apply = (mods: readonly ItemMod[]): void => {
    for (const mod of mods) {
      if (mod.path !== path) continue;
      if (mod.add !== undefined) add += mod.add;
      if (mod.mul !== undefined) mul *= mod.mul;
    }
  };

  for (const id of w.build) {
    const item = ITEMS_BY_ID.get(id);
    if (item !== undefined) apply(item.mods);
  }
  // Распоряжение — такая же правка, как приложение, просто выпущена
  // конторой в ответ на состав дела. Считается тем же порядком, поэтому
  // результат по-прежнему не зависит от того, что нашли раньше.
  for (const directive of issuedDirectives(w.build)) apply(directive.mods);

  return (getTuning(path) + add) * mul;
}

/** Потолок боезапаса формы — целое, не меньше единицы. */
export function ammoMax(w: World, formId: string): number {
  return Math.max(1, Math.round(formStat(w, formId, 'ammoMax')));
}

/** Потолок запаса сверх обоймы. */
export function reserveMax(w: World, formId: string): number {
  return Math.max(0, Math.round(formStat(w, formId, 'reserveMax')));
}

/** Сколько патронов в запасе формы сейчас. */
export function reserveOf(w: World, index: number): number {
  const player = w.playerC.get(w.player);
  if (player === undefined) return 0;
  return Math.max(0, Math.floor(player.reserve[index] ?? 0));
}
