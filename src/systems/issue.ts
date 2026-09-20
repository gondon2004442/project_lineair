/**
 * ОФОРМЛЕНИЕ. Вторая дорога к приложениям, помимо зачистки.
 *
 * Один дефицитный ресурс работает на двух рынках: допуск вскрывает
 * опечатанный шкаф (что внутри — не написано) и он же получает со стола
 * выдачи названное по описи. Шкаф вдобавок открывается бланком, и это
 * тот самый второй рынок бланка: потратить его, чтобы выжить сейчас, или
 * чтобы получить предмет потом.
 */
import { WEAPON_FORMS } from '../data/weaponForms';
import type { Entity, World } from '../ecs';
import { pickItem } from '../paperwork';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { formStat, reserveMax } from '../weapon';

/** Ближайшая добыча в пределах вытянутой руки. */
export function stashInReach(w: World): Entity {
  const t = w.transform.get(w.player);
  if (t === undefined) return -1;
  const reach = TUNING.stash.reach;
  let best = -1;
  let bestDist = reach * reach;
  for (const [e, stash] of w.stashC) {
    if (stash.opened) continue;
    const st = w.transform.get(e);
    if (st === undefined) continue;
    const dx = st.x - t.x;
    const dy = st.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestDist) continue;
    bestDist = d2;
    best = e;
  }
  return best;
}

/** Чем можно оформить добычу прямо сейчас. Пусто — нечем. */
export function issueCost(w: World, target: Entity): 'pass' | 'blank' | '' {
  const stash = w.stashC.get(target);
  if (stash === undefined || stash.opened) return '';
  if (w.passes > 0) return 'pass';
  // Бланком вскрывается только шкаф: на столе выдачи бланк не примут.
  if (stash.kind === 'safe' && w.blanks > 0) return 'blank';
  return '';
}

export function issueSystem(w: World): void {
  if (!w.input.useQueued) return;
  w.input.useQueued = false;
  if (w.scene !== 'run' || w.status !== 'playing') return;

  const target = stashInReach(w);
  if (target < 0) return;
  const stash = w.stashC.get(target);
  if (stash === undefined || stash.opened) return;

  const cost = issueCost(w, target);
  if (cost === '') return;
  if (cost === 'pass') w.passes -= 1;
  else w.blanks -= 1;

  stash.opened = true;
  w.sounds.push('door.unlock');

  if (stash.kind === 'cell') {
    if (stash.item !== '' && !w.build.includes(stash.item)) w.build.push(stash.item);
    return;
  }

  // Шкаф: содержимое решает свой бросок, привязанный к сущности, — то же
  // место на том же seed отдаёт то же самое.
  const rng = makeRng((w.seed + w.room * TUNING.stash.seedStride + target) >>> 0);
  const roll = rng.float();
  if (roll < TUNING.stash.safeAmmoShare) {
    const index = rng.int(WEAPON_FORMS.length);
    const form = WEAPON_FORMS[index];
    const p = w.playerC.get(w.player);
    if (form !== undefined && p !== undefined) {
      const add = Math.max(1, Math.round(formStat(w, form.id, 'pickup')));
      p.reserve[index] = Math.min(reserveMax(w, form.id), (p.reserve[index] ?? 0) + add);
      return;
    }
  }
  if (roll < TUNING.stash.safeAmmoShare + TUNING.stash.safeBlankShare) {
    w.blanks = Math.min(TUNING.blank.carryMax, w.blanks + 1);
    return;
  }
  const item = pickItem(w, rng);
  if (item !== undefined) w.build.push(item.id);
}
