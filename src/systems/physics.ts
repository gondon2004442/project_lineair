/** Интегрирование скоростей и столкновение с бетоном. Тела — AABB. */
import type { World } from '../ecs';
import { isSolidCell } from '../room';
import type { TileMap } from '../room';
import { TUNING } from '../tuning';

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

    if (w.bulletC.has(e)) {
      // Пули не отталкиваются от стен, они в них гаснут — этим займётся система боя.
      t.x += b.vx * dt;
      t.y += b.vy * dt;
      continue;
    }

    // Дробим перемещение: за один разбор нельзя проскочить стену насквозь.
    const reach = Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt;
    const parts = Math.max(1, Math.ceil(reach / (w.map.size * TUNING.sim.maxMoveFraction)));
    const slice = dt / parts;
    for (let i = 0; i < parts; i++) {
      // Скорость читается заново: столкновение могло её обнулить.
      moveX(w.map, t, b, b.vx * slice);
      moveY(w.map, t, b, b.vy * slice);
    }
  }
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
