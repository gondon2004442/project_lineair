/**
 * Регистратор. Сидит за столом, кидает картотечные карточки веером
 * и закрывает освободившиеся ставки: повышает стажёров, а если повышать
 * некого — добирает штат со стороны, но не больше потолка.
 *
 * Убил его первым — участок перестаёт восполняться.
 */
import { POST_INTERN } from '../data/posts';
import type { World } from '../ecs';
import { DEG, TUNING } from '../tuning';
import { randomFloorPoint } from '../room';
import { spawnBullet, spawnStaff } from '../spawn';
import { approach, topVacancy } from './staff';

export function registrarSystem(w: World, dt: number): void {
  const pt = w.transform.get(w.player);
  const alive = pt !== undefined && w.status !== 'dead';
  const cfg = TUNING.post.registrar;

  for (const [e, registrar] of w.registrarC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;

    b.vx = approach(b.vx, 0, cfg.friction * dt);
    b.vy = approach(b.vy, 0, cfg.friction * dt);
    if (!alive || pt === undefined) continue;

    // --- Веер карточек ---
    registrar.timer -= dt;
    if (registrar.phase === 'idle' && registrar.timer <= 0) {
      registrar.phase = 'windup';
      registrar.timer = cfg.fanTelegraph;
    } else if (registrar.phase === 'windup') {
      staff.plateFlash = cfg.fanTelegraph;
      if (registrar.timer <= 0) {
        throwFan(w, t.x, t.y, pt.x - t.x, pt.y - t.y, b.radius);
        registrar.phase = 'idle';
        registrar.timer = cfg.fanInterval;
      }
    }

    // --- Кадровая работа ---
    if (registrar.hireTimer > 0) {
      registrar.hireTimer -= dt;
      if (registrar.hireTimer <= 0 && hire(w, registrar.hired, pt.x, pt.y)) registrar.hired += 1;
      continue;
    }

    registrar.orderTimer -= dt;
    if (registrar.orderTimer > 0) continue;
    registrar.orderTimer = cfg.orderInterval;

    const vacancy = topVacancy(w);
    if (vacancy === undefined) continue;

    const promoted = promoteNearestIntern(w, t.x, t.y, vacancy.post);
    if (promoted) continue;
    if (registrar.hired < cfg.hireCap) registrar.hireTimer = cfg.hireDelay;
  }
}

function throwFan(w: World, x: number, y: number, dx: number, dy: number, radius: number): void {
  const cfg = TUNING.post.registrar;
  const count = Math.max(1, Math.round(cfg.fanCount));
  const base = Math.atan2(dy, dx);
  const spread = cfg.fanSpreadDeg * DEG;
  const spec = {
    speed: cfg.cardSpeed,
    radius: cfg.cardRadius,
    damage: cfg.cardDamage,
    life: cfg.cardLife,
  };
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
    const angle = base + offset;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const muzzle = radius + cfg.cardRadius;
    spawnBullet(w, 'enemy', spec, x + dirX * muzzle, y + dirY * muzzle, dirX, dirY);
  }
}

/** Повышение — это приказ. Без живого Регистратора стажёр остаётся стажёром. */
function promoteNearestIntern(w: World, x: number, y: number, post: string): boolean {
  if (post === POST_INTERN) return false;
  let best = -1;
  let bestDist = Infinity;
  for (const [e, intern] of w.internC) {
    if (intern.phase !== 'route') continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const dist = Math.hypot(t.x - x, t.y - y);
    if (dist >= bestDist) continue;
    bestDist = dist;
    best = e;
  }
  if (best < 0) return false;
  const intern = w.internC.get(best);
  if (intern === undefined) return false;
  intern.phase = 'promotion';
  intern.timer = TUNING.post.intern.promotionTime;
  intern.promoteTo = post;
  return true;
}

/** Добор со стороны: новый стажёр приходит подальше от субъекта. */
function hire(w: World, hired: number, awayX: number, awayY: number): boolean {
  if (hired >= TUNING.post.registrar.hireCap) return false;
  let spot = randomFloorPoint(w.map, (n) => w.rng.int(n), TUNING.floor.spawnAttempts);
  for (let i = 0; i < TUNING.floor.spawnAttempts; i++) {
    if (Math.hypot(spot.x - awayX, spot.y - awayY) >= TUNING.staff.spawnMinDistance) break;
    spot = randomFloorPoint(w.map, (n) => w.rng.int(n), TUNING.floor.spawnAttempts);
  }
  spawnStaff(w, POST_INTERN, TUNING.post.registrar.hirePriority, spot.x, spot.y);
  return true;
}
