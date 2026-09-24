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

/**
 * Субъект — тоже тело. До этого штат для него телом не был: сквозь
 * сотрудников можно было ходить пешком, и толпа ничего не стоила.
 *
 * На окне неуязвимости расталкивания нет вовсе — перекат обязан
 * проходить сквозь наседающих, иначе он наполовину бесполезен. Это же
 * снимает застревание после полученного урона.
 */
export function playerBodySystem(w: World, dt: number): void {
  // Ноль означает «штат субъекту не тело» — то, как было до этой правки.
  // Оставлено ручкой в панели: сравнивать надо руками.
  if (TUNING.staff.playerSeparationForce <= 0) return;
  const pt = w.transform.get(w.player);
  const pb = w.body.get(w.player);
  if (pt === undefined || pb === undefined) return;
  const ph = w.health.get(w.player);
  if (ph !== undefined && ph.iframes > 0) return;

  for (const [e] of w.staffC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;
    const dx = t.x - pt.x;
    const dy = t.y - pt.y;
    const dist = Math.hypot(dx, dy);
    const minDist = pb.radius + b.radius;
    if (dist >= minDist || dist === 0) continue;

    const nx = dx / dist;
    const ny = dy / dist;

    // Субъекта выставляем из тела целиком, а не толкаем силой. Мягкий
    // толчок здесь не работает: при 300 он двигает на 2.5 px за шаг, а
    // субъект на полном ходу проходит 4.8 px — и продавливает штат
    // насквозь, то есть тела как не было, так и нет.
    const overlap = minDist - dist;
    pt.x -= nx * overlap;
    pt.y -= ny * overlap;

    // Сотрудника при этом ещё и отжимает — но силой, а не жёстко:
    // толпу можно растолкать, идя в неё, и это стоит времени.
    // Регистратор стоит на месте по своей должности: его не двигаем.
    if (w.registrarC.has(e)) continue;
    const push = (1 - dist / minDist) * TUNING.staff.playerSeparationForce * dt;
    t.x += nx * push;
    t.y += ny * push;
  }
}

/** Плавный подгон скорости к желаемой. Общий для всех должностей. */
export function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}
