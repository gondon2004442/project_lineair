/**
 * СТОЙКИ. Три окошка, в каждое подают один раз.
 *
 * Регистрация снимает взыскание за талоны: накосячил по службе — плати
 * и проси снять. Кадры меняют здоровье на допуск: контейнер здоровья
 * стоит ровно столько, сколько стоит запертый шкаф. Переаттестация —
 * кубик: половина на половину, выслуга или взыскание.
 *
 * Система идёт ДО оформления и забирает нажатие только тогда, когда
 * стойка рядом: иначе она съедала бы F у шкафов.
 */
import { COUNTERS_BY_KIND } from '../data/counters';
import type { Entity, World } from '../ecs';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';

/** Ближайшая стойка в пределах вытянутой руки. */
export function counterInReach(w: World): Entity {
  const t = w.transform.get(w.player);
  if (t === undefined) return -1;
  const reach = TUNING.counter.reach;
  let best = -1;
  let bestDist = reach * reach;
  for (const [e] of w.counterC) {
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

/** Чем платят этой стойке и хватает ли. Пустая цена — стойка отработала. */
export function counterOffer(
  w: World,
  target: Entity,
): { offer: string; price: string; ok: boolean } {
  const counter = w.counterC.get(target);
  if (counter === undefined) return { offer: '', price: '', ok: false };
  const spec = COUNTERS_BY_KIND.get(counter.kind as never);
  const offer = spec === undefined ? counter.title : spec.offer;
  if (counter.used) return { offer, price: 'ОКОШКО ЗАКРЫТО', ok: false };
  const cfg = TUNING.counter;

  if (counter.kind === 'registry') {
    const price = Math.max(0, Math.round(cfg.registryPrice));
    // Снимать нечего — окошко всё равно не примет: пустая подача это
    // потраченные талоны ни за что.
    if (w.record.penalty <= 0) return { offer, price: 'ВЗЫСКАНИЙ НЕТ', ok: false };
    return { offer, price: `${price} ТАЛОНОВ`, ok: w.tickets >= price };
  }

  if (counter.kind === 'hr') {
    const cost = Math.max(1, Math.round(cfg.hrHealth));
    const health = w.health.get(w.player);
    const alive = health !== undefined && health.hp > cost;
    if (w.passes >= TUNING.stash.passesMax) return { offer, price: 'ДОПУСКОВ ПОЛНО', ok: false };
    return { offer, price: `${cost} ЗДОРОВЬЯ`, ok: alive };
  }

  const price = Math.max(0, Math.round(cfg.reviewPrice));
  return { offer, price: `${price} ТАЛОНОВ`, ok: w.tickets >= price };
}

export function counterSystem(w: World): void {
  if (!w.input.useQueued) return;
  if (w.scene !== 'run' || w.status !== 'playing') return;

  const target = counterInReach(w);
  if (target < 0) return;
  const counter = w.counterC.get(target);
  if (counter === undefined) return;
  const { ok } = counterOffer(w, target);
  if (!ok) return;

  w.input.useQueued = false;
  const cfg = TUNING.counter;

  if (counter.kind === 'registry') {
    w.tickets -= Math.max(0, Math.round(cfg.registryPrice));
    w.record.penalty = Math.max(0, w.record.penalty - Math.max(1, Math.round(cfg.registryClear)));
  } else if (counter.kind === 'hr') {
    const health = w.health.get(w.player);
    if (health === undefined) return;
    health.hp = Math.max(1, health.hp - Math.max(1, Math.round(cfg.hrHealth)));
    w.passes = Math.min(TUNING.stash.passesMax, w.passes + Math.max(1, Math.round(cfg.hrPasses)));
  } else {
    w.tickets -= Math.max(0, Math.round(cfg.reviewPrice));
    // Бросок привязан к стойке, а не к моменту: то же окошко на том же
    // seed отвечает одинаково, сколько ни ходи вокруг.
    const rng = makeRng((w.seed + w.room * cfg.seedStride + target) >>> 0);
    if (rng.float() < cfg.reviewLuck) {
      w.record.service = Math.min(
        TUNING.record.serviceMax,
        w.record.service + Math.max(1, Math.round(cfg.reviewService)),
      );
    } else {
      w.record.penalty = Math.min(
        TUNING.record.penaltyMax,
        w.record.penalty + Math.max(1, Math.round(cfg.reviewPenalty)),
      );
    }
  }

  counter.used = true;
  w.sounds.push('door.unlock');
}
