/**
 * КОМИССИЯ. Босс натурной части.
 *
 * Трое, действующие как один орган. Урон проходит только по
 * председателю, а председательствует тот, кто сейчас НЕ атакует.
 * Остальные двое ведут огонь.
 *
 * Поэтому бой читается, а не заучивается: игрок смотрит, кто молчит, и
 * бьёт его. Председательство переходит по кругу, и каждая смена — это
 * заново прочитанная комната.
 */
import type { Entity, World } from '../ecs';
import { spawnBullet } from '../spawn';
import { TUNING } from '../tuning';
import { approach } from './staff';

/** Открыт ли член комиссии для урона: только пока председательствует. */
export function commissionOpen(w: World, e: Entity): boolean {
  const c = w.commissionC.get(e);
  return c === undefined || c.chair;
}

export function commissionSystem(w: World, dt: number): void {
  if (w.commissionC.size === 0) return;
  const cfg = TUNING.commission;
  const pt = w.transform.get(w.player);
  const alive = pt !== undefined && w.status !== 'dead';

  // --- Председательство переходит по кругу, общим отсчётом на всех.
  // Иначе трое считали бы каждый своё, и молчащих оказывалось бы то
  // двое, то ни одного.
  const seats = [...w.commissionC.entries()].sort((a, b) => a[1].seat - b[1].seat);
  const first = seats[0];
  if (first !== undefined) {
    first[1].swapTimer -= dt;
    if (first[1].swapTimer <= 0) {
      first[1].swapTimer = cfg.swapEvery;
      const was = seats.findIndex(([, c]) => c.chair);
      const next = (was + 1 + seats.length) % seats.length;
      seats.forEach(([, c], i) => {
        c.chair = i === next;
      });
      w.sounds.push('beat');
    }
  }

  for (const [e, member] of seats) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;
    if (staff.frozen > 0) continue;

    // Председатель виден: пока он молчит, его табличка горит. Это и есть
    // подсказка, по которой читается бой.
    if (member.chair) staff.plateFlash = Math.max(staff.plateFlash, 0.2);

    if (!alive || pt === undefined) continue;
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Держат дистанцию: комиссия не бросается, она заседает.
    let step = 0;
    if (dist > cfg.standoff) step = 1;
    else if (dist < cfg.standoff * 0.75) step = -1;
    const rate = TUNING.post.commission.accel * dt;
    b.vx = approach(b.vx, (dx / dist) * TUNING.post.commission.speed * step, rate);
    b.vy = approach(b.vy, (dy / dist) * TUNING.post.commission.speed * step, rate);

    // Председатель молчит — в этом и смысл: молчание и есть уязвимость.
    if (member.chair) continue;
    member.shotTimer -= dt;
    if (member.shotTimer > 0) continue;
    member.shotTimer = cfg.shotEvery;
    spawnBullet(
      w,
      'enemy',
      TUNING.enemyBullet,
      t.x + (dx / dist) * (b.radius + 2),
      t.y + (dy / dist) * (b.radius + 2),
      dx / dist,
      dy / dist,
      e,
    );
    w.sounds.push('shot.precise');
  }
}
