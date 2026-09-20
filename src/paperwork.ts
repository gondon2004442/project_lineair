/**
 * ДЕЛОПРОИЗВОДСТВО. Контора выдаёт не случайное, а то, что следует из
 * уже подшитого.
 *
 * При выборе приложения вес кандидата умножается на множитель, если он
 * ЗАВЕРШАЕТ распоряжение с тем, что уже лежит в деле. Без этого
 * распоряжения остались бы курьёзом: ждать нужную пару из десяти
 * приложений пришлось бы дольше, чем длится забег.
 *
 * Множитель падает за каждое уже собранное распоряжение — иначе к концу
 * забега выдача выродилась бы в один и тот же предмет.
 */
import { DIRECTIVES, directiveIssued, issuedDirectives } from './data/directives';
import { ITEMS, type Item } from './data/items';
import type { World } from './ecs';
import type { Rng } from './rng';
import { TUNING } from './tuning';

/** Текущий множитель делопроизводства. Считается, а не хранится. */
export function synergyFactor(w: World): number {
  const cfg = TUNING.reward;
  const collected = issuedDirectives(w.build).length;
  return Math.max(cfg.synergyMin, cfg.synergyFactor - collected * cfg.synergyDecay);
}

/**
 * Какое распоряжение завершит это приложение, если подшить его сейчас.
 * Пусто — не завершает ничего.
 */
export function completes(w: World, itemId: string): string {
  if (w.build.includes(itemId)) return '';
  const after = [...w.build, itemId];
  for (const directive of DIRECTIVES) {
    if (directiveIssued(directive, w.build)) continue;
    if (directiveIssued(directive, after)) return directive.number;
  }
  return '';
}

/**
 * Выбрать приложение к выдаче. Сначала из тех, которых в деле нет;
 * кандидат, завершающий распоряжение, весит во столько раз больше.
 */
export function pickItem(w: World, rng: Rng): Item | undefined {
  const fresh = ITEMS.filter((item) => !w.build.includes(item.id));
  const pool = fresh.length > 0 ? fresh : ITEMS;
  const factor = synergyFactor(w);

  let total = 0;
  const weights = pool.map((item) => {
    const order = completes(w, item.id);
    const weight = order === '' ? 1 : factor;
    total += weight;
    return { item, weight, order };
  });

  let roll = rng.float() * total;
  for (const candidate of weights) {
    roll -= candidate.weight;
    if (roll > 0) continue;
    w.reward.lastItem = candidate.item.code;
    w.reward.lastOrder = candidate.order;
    w.reward.lastWeight = candidate.weight;
    return candidate.item;
  }
  return pool[pool.length - 1];
}
