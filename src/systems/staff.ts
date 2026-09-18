/**
 * Учёт штата: сколько ставок занято, сколько вакансий открыто.
 * Пересчитывается каждый шаг по живым сотрудникам — так не расходится.
 */
import type { RosterEntry, World } from '../ecs';
import { POST_REGISTRAR } from '../data/posts';
import { TUNING } from '../tuning';

export function rosterSystem(w: World, dt: number): void {
  for (const entry of w.roster) entry.occupied = 0;
  for (const [, staff] of w.staffC) {
    // Табличку зажигают системы поведения, гаснет она здесь.
    staff.plateFlash = Math.max(0, staff.plateFlash - dt);
    const entry = w.roster.find((r) => r.post === staff.post);
    if (entry !== undefined) entry.occupied += 1;
  }
}

/** Незакрытых ставок всего. */
export function vacancyCount(w: World): number {
  let total = 0;
  for (const entry of w.roster) total += Math.max(0, entry.quota - entry.occupied);
  return total;
}

/** Самая важная незакрытая ставка: сначала меньший priority. */
export function topVacancy(w: World): RosterEntry | undefined {
  let best: RosterEntry | undefined;
  for (const entry of w.roster) {
    if (entry.quota - entry.occupied <= 0) continue;
    if (best === undefined || entry.priority < best.priority) best = entry;
  }
  return best;
}

/** Есть ли на участке живой Регистратор — только он закрывает ставки. */
export function hasRegistrar(w: World): boolean {
  for (const [, staff] of w.staffC) {
    if (staff.post === POST_REGISTRAR) return true;
  }
  return false;
}

/** Метроном участка. По его долям бьют инспекторы. */
export function metronomeSystem(w: World, dt: number): void {
  w.metronome -= dt;
  if (w.metronome > 0) return;
  w.metronome += TUNING.post.inspector.metronomeInterval;
  if (w.metronome <= 0) w.metronome = TUNING.post.inspector.metronomeInterval;
  w.beat += 1;
  // Метроном слышно: по документу инспектор читается в том числе на слух.
  w.sounds.push('beat');
}

/** Расталкивание: сотрудники не слипаются. Регистратор сидит и не двигается. */
export function separationSystem(w: World, dt: number): void {
  for (const [a] of w.staffC) {
    const ta = w.transform.get(a);
    const ba = w.body.get(a);
    if (ta === undefined || ba === undefined) continue;
    const aFixed = w.registrarC.has(a);
    for (const [b] of w.staffC) {
      if (b <= a) continue;
      const tb = w.transform.get(b);
      const bb = w.body.get(b);
      if (tb === undefined || bb === undefined) continue;
      const dx = tb.x - ta.x;
      const dy = tb.y - ta.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ba.radius + bb.radius;
      if (dist >= minDist || dist === 0) continue;

      const bFixed = w.registrarC.has(b);
      if (aFixed && bFixed) continue;
      // Правим положение, а не скорость: скорость через кадр перетрёт поведение.
      const push = (1 - dist / minDist) * TUNING.staff.separationForce * dt;
      const share = aFixed || bFixed ? push : push / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      if (!aFixed) {
        ta.x -= nx * share;
        ta.y -= ny * share;
      }
      if (!bFixed) {
        tb.x += nx * share;
        tb.y += ny * share;
      }
    }
  }
}

/** Плавный подгон скорости к желаемой. Общий для всех должностей. */
/**
 * Проверка идёт быстрее. Скорость домножается ОДНИМ проходом после всех
 * поведений: так ни одну систему должности трогать не пришлось, а на
 * выходе получается ровно то же, что и более быстрый ход.
 */
export function controlSystem(w: World): void {
  const mul = TUNING.record.controlSpeed;
  if (mul === 1) return;
  for (const [e, staff] of w.staffC) {
    if (!staff.control) continue;
    const b = w.body.get(e);
    if (b === undefined) continue;
    b.vx *= mul;
    b.vy *= mul;
  }
}

export function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}
