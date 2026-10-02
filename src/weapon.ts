/**
 * Оружие: разрешение параметров с учётом выданных предметов.
 *
 * Предмет — набор правок к tuning-параметрам. Правка применяется
 * как (база + add) * mul, поэтому порядок предметов в билде
 * на результат не влияет.
 */
import { issuedDirectives } from './data/directives';
import { subjectAt, SUBJECTS_BY_ID } from './data/subjects';
import { ITEMS_BY_ID, type Item, type ItemMod } from './data/items';
import { WEAPON_FORMS, type WeaponForm } from './data/weaponForms';
import type { World } from './ecs';
import { TUNING, getTuning } from './tuning';

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

/**
 * Есть ли у забега это свойство. Своё — у субъекта, чужое — у того, кого
 * освободили: замурованный отдаёт своё тому, кто его выпустил, и с этой
 * минуты контора читает его свойство так же, как своё.
 */
export function hasTrait(w: World, trait: string): boolean {
  if (subjectAt(w.subject).trait === trait) return true;
  for (const id of w.freed) {
    if (SUBJECTS_BY_ID.get(id)?.trait === trait) return true;
  }
  return false;
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

  // Субъект считается первым и тем же порядком, что приложение: он
  // такая же правка к путям, просто выписанная на него, а не на предмет.
  apply(subjectAt(w.subject).mods);
  // Освобождённый отдаёт своё: только сильная сторона, без своей цены.
  for (const id of w.freed) {
    const freed = SUBJECTS_BY_ID.get(id);
    if (freed !== undefined) apply(freed.gift);
  }

  for (const id of w.build) {
    const item = ITEMS_BY_ID.get(id);
    if (item !== undefined) apply(item.mods);
  }
  // Распоряжение — такая же правка, как приложение, просто выпущена
  // конторой в ответ на состав дела. Считается тем же порядком, поэтому
  // результат по-прежнему не зависит от того, что нашли раньше.
  for (const directive of issuedDirectives(w.build)) {
    // Ось «пока форма в руках»: колесо впервые становится решением, а
    // не только вопросом обоймы.
    if (directive.whileForm !== undefined && directive.whileForm !== currentForm(w).id) continue;
    // Ось «кому выписано»: одно и то же дело у Электрика и у Картографа
    // собирается в разные распоряжения, потому что контора смотрит не
    // только на приложения, но и на того, кто их носит.
    if (directive.requiresTrait !== undefined && !hasTrait(w, directive.requiresTrait)) continue;
    apply(directive.mods);
  }

  return (getTuning(path) + add) * mul;
}

/**
 * Приложения «не подлежит выдаче», которые сейчас в деле.
 */
export function cursedItems(w: World): Item[] {
  const out: Item[] = [];
  for (const id of w.build) {
    const item = ITEMS_BY_ID.get(id);
    if (item?.cursed === true) out.push(item);
  }
  return out;
}

/**
 * Действующее взыскание: заработанное плюс то, что висит за каждое
 * приложение «не подлежит выдаче». Всё, что читает взыскание — шанс
 * проверки, щедрость выдачи, окошко регистрации, — обязано читать
 * именно эту величину, иначе проклятие было бы бесплатным.
 */
export function penaltyOf(w: World): number {
  const extra = cursedItems(w).length * TUNING.record.cursedPenalty;
  return Math.min(TUNING.record.penaltyMax, w.record.penalty + extra);
}

/**
 * Множитель урона по конкретной должности. Ось «против должности»
 * считается здесь, а не через statAt: путь тюнинга не знает, в кого
 * прилетело, а точка урона знает.
 */
export function damageFactorAgainst(w: World, post: string): number {
  if (w.build.length === 0) return 1;
  let factor = 1;
  for (const directive of issuedDirectives(w.build)) {
    if (directive.againstPost !== post) continue;
    factor *= directive.damageMul ?? 1;
  }
  return factor;
}

/** Потолок боезапаса формы — целое, не меньше единицы. */
export function ammoMax(w: World, formId: string): number {
  return Math.max(1, Math.round(formStat(w, formId, 'ammoMax')));
}

/** Потолок запаса сверх обоймы. */
export function reserveMax(w: World, formId: string): number {
  return Math.max(0, Math.round(formStat(w, formId, 'reserveMax')));
}

/**
 * Не кончается ли запас этой формы. Табельная точная одиночная стреляет
 * бесконечно: обойма и перезарядка у неё остаются, а вот тупика «стрелять
 * нечем и менять не на что» больше нет. Остальные формы копят запас и
 * тратят его — этим и решают, когда крутить колесо.
 */
export function infiniteReserve(w: World, formId: string): boolean {
  return formStat(w, formId, 'infiniteReserve') > 0;
}

/** Сколько патронов в запасе формы сейчас. */
export function reserveOf(w: World, index: number): number {
  const player = w.playerC.get(w.player);
  if (player === undefined) return 0;
  return Math.max(0, Math.floor(player.reserve[index] ?? 0));
}
