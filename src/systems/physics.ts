/** Интегрирование скоростей и столкновение с бетоном. Тела — AABB. */
import type { World } from '../ecs';
import { isSolidCell } from '../room';
import type { TileMap } from '../room';

const SKIN = 0.01;

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

    moveX(w.map, t, b, b.vx * dt);
    moveY(w.map, t, b, b.vy * dt);
  }
}

function moveX(map: TileMap, t: { x: number; y: number }, b: { vx: number; radius: number }, dx: number): void {
  if (dx === 0) return;
  t.x += dx;
  const r = b.radius;
  const top = Math.floor((t.y - r) / map.size);
  const bottom = Math.floor((t.y + r - SKIN) / map.size);
  if (dx > 0) {
    const cx = Math.floor((t.x + r) / map.size);
    for (let cy = top; cy <= bottom; cy++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.x = cx * map.size - r - SKIN;
      b.vx = 0;
      return;
    }
  } else {
    const cx = Math.floor((t.x - r) / map.size);
    for (let cy = top; cy <= bottom; cy++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.x = (cx + 1) * map.size + r + SKIN;
      b.vx = 0;
      return;
    }
  }
}

function moveY(map: TileMap, t: { x: number; y: number }, b: { vy: number; radius: number }, dy: number): void {
  if (dy === 0) return;
  t.y += dy;
  const r = b.radius;
  const left = Math.floor((t.x - r) / map.size);
  const right = Math.floor((t.x + r - SKIN) / map.size);
  if (dy > 0) {
    const cy = Math.floor((t.y + r) / map.size);
    for (let cx = left; cx <= right; cx++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.y = cy * map.size - r - SKIN;
      b.vy = 0;
      return;
    }
  } else {
    const cy = Math.floor((t.y - r) / map.size);
    for (let cx = left; cx <= right; cx++) {
      if (!isSolidCell(map, cx, cy)) continue;
      t.y = (cy + 1) * map.size + r + SKIN;
      b.vy = 0;
      return;
    }
  }
}
