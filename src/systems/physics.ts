/** Интегрирование скоростей и столкновение с бетоном. Тела — AABB. */
import type { World } from '../ecs';
import { isSolidCell } from '../room';
import type { TileMap } from '../room';
import { TUNING } from '../tuning';
import { applyDamage } from './damage';

const SKIN = 0.01;

interface Point {
  x: number;
  y: number;
}

interface Motion {
  vx: number;
  vy: number;
  radius: number;
}

export function physicsSystem(w: World, dt: number): void {
  for (const e of w.alive) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;

    // Талоны после зачистки летят над мебелью и бетоном: их ведёт
    // система талонов, и разбирать им столкновения нечего — иначе
    // бумажка застревает за блоком в двух шагах от субъекта.
    if (w.ticketC.has(e) && w.staffC.size === 0) continue;

    if (w.bulletC.has(e)) {
      // Пули не отталкиваются от стен, они в них гаснут — этим займётся система боя.
      t.x += b.vx * dt;
      t.y += b.vy * dt;
      continue;
    }

    // Проверка ходит быстрее. Множитель применяется К ПЕРЕМЕЩЕНИЮ, а не к
    // скорости: скорость поведения выставляют сами, подтягивая её к своей
    // цели, и если домножать её саму, то на следующем шаге она домножится
    // опять — разгон получается лавинообразный.
    const pace = w.staffC.get(e)?.control === true ? TUNING.record.controlSpeed : 1;

    // Дробим перемещение: за один разбор нельзя проскочить стену насквозь.
    const reach = Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt * pace;
    const parts = Math.max(1, Math.ceil(reach / (w.map.size * TUNING.sim.maxMoveFraction)));
    const slice = (dt * pace) / parts;
    // Брошенное отскакивает от бетона, а не прилипает к нему: скорость до
    // разбора запоминается, и если стена её обнулила — возвращается
    // обратно с потерей.
    const prop = w.propC.get(e);
    const bounce = prop !== undefined && prop.phase === 'thrown';
    const vx0 = b.vx;
    const vy0 = b.vy;
    for (let i = 0; i < parts; i++) {
      // Скорость читается заново: столкновение могло её обнулить.
      moveX(w.map, t, b, b.vx * slice);
      moveY(w.map, t, b, b.vy * slice);
    }
    if (bounce) wallBounce(w, e, b, vx0, vy0);

    const k = w.kickC.get(e);
    if (k !== undefined) moveKick(w, e, t, b.radius, k, dt);
  }
}

/** Отскок брошенного: обнулённая стеной ось возвращается с потерей. */
function wallBounce(w: World, e: number, b: Motion, vx0: number, vy0: number): void {
  const cfg = TUNING.physics;
  const e2 = cfg.wallRestitution;
  let hit = 0;
  if (b.vx === 0 && vx0 !== 0 && Math.abs(vx0) >= cfg.wallBounceMin) {
    b.vx = -vx0 * e2;
    hit = Math.abs(vx0);
  }
  if (b.vy === 0 && vy0 !== 0 && Math.abs(vy0) >= cfg.wallBounceMin) {
    b.vy = -vy0 * e2;
    hit = Math.max(hit, Math.abs(vy0));
  }
  if (hit <= 0) return;
  w.sounds.push('impact');
  // Удар о бетон бьёт и сам предмет: стул, брошенный в стену, рассыпается.
  const h = w.health.get(e);
  if (h !== undefined && hit >= TUNING.prop.minImpactSpeed * 1.6) {
    h.hp -= TUNING.prop.impactSelfDamage;
    h.flash = TUNING.feel.flashTime;
  }
}

/**
 * Отброс: своя скорость поверх хода, своя дробь против проскока, своё
 * затухание. Влетел в стену на скорости — удар о бетон.
 */
function moveKick(w: World, e: number, t: Point, radius: number, k: { vx: number; vy: number }, dt: number): void {
  const cfg = TUNING.physics;
  const motion: Motion = { vx: k.vx, vy: k.vy, radius };
  const before = Math.hypot(k.vx, k.vy);
  const reach = before * dt;
  const parts = Math.max(1, Math.ceil(reach / (w.map.size * TUNING.sim.maxMoveFraction)));
  const slice = dt / parts;
  for (let i = 0; i < parts; i++) {
    moveX(w.map, t, motion, motion.vx * slice);
    moveY(w.map, t, motion, motion.vy * slice);
  }
  const stopped = before - Math.hypot(motion.vx, motion.vy);
  if (stopped >= cfg.slamSpeed && w.staffC.has(e)) {
    applyDamage(w, e, cfg.slamDamage);
    w.sounds.push('impact');
  }
  const decay = Math.exp(-cfg.kickDecay * dt);
  k.vx = motion.vx * decay;
  k.vy = motion.vy * decay;
  if (Math.hypot(k.vx, k.vy) < 4) w.kickC.delete(e);
}

/**
 * Разбор идёт и при нулевой скорости: тело могло оказаться в стене
 * не своим ходом, например после расталкивания.
 */
function moveX(map: TileMap, t: Point, b: Motion, dx: number): void {
  t.x += dx;
  const r = b.radius;
  const top = Math.floor((t.y - r) / map.size);
  const bottom = Math.floor((t.y + r - SKIN) / map.size);

  if (dx >= 0) {
    const cx = Math.floor((t.x + r) / map.size);
    for (let cy = top; cy <= bottom; cy++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.x = cx * map.size - r - SKIN;
      b.vx = Math.min(b.vx, 0);
      return;
    }
  }
  if (dx <= 0) {
    const cx = Math.floor((t.x - r) / map.size);
    for (let cy = top; cy <= bottom; cy++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.x = (cx + 1) * map.size + r + SKIN;
      b.vx = Math.max(b.vx, 0);
      return;
    }
  }
}

function moveY(map: TileMap, t: Point, b: Motion, dy: number): void {
  t.y += dy;
  const r = b.radius;
  const left = Math.floor((t.x - r) / map.size);
  const right = Math.floor((t.x + r - SKIN) / map.size);

  if (dy >= 0) {
    const cy = Math.floor((t.y + r) / map.size);
    for (let cx = left; cx <= right; cx++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.y = cy * map.size - r - SKIN;
      b.vy = Math.min(b.vy, 0);
      return;
    }
  }
  if (dy <= 0) {
    const cy = Math.floor((t.y - r) / map.size);
    for (let cx = left; cx <= right; cx++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.y = (cy + 1) * map.size + r + SKIN;
      b.vy = Math.max(b.vy, 0);
      return;
    }
  }
}
