/**
 * ПЕРЕСТАНОВКА. Искажение архива.
 *
 * Стеллажи едут по рельсам сами: медленно, ровно, без объяснений.
 * Укрытие, за которым ты присел, через несколько секунд оказывается в
 * другом месте, а на его месте — линия огня. Это меняет не картинку, а
 * решение: за чем прятаться, если оно уедет.
 *
 * Ведёт их эта система напрямую, а не физика. Физике пришлось бы
 * объяснять, что стеллаж не тормозится трением, не сбивается ударом и
 * разворачивается от стены, — проще провести его самому. Расталкивать
 * тела он при этом продолжает: этим занимается propPushSystem, и она уже
 * написана.
 */
import { floorAt } from '../data/floors';
import type { World } from '../ecs';
import { TUNING } from '../tuning';

/** Едут ли на этом уровне стеллажи. */
export function shuffling(w: World): boolean {
  return floorAt(w.depth).distortion === 'shuffle';
}

export function railSystem(w: World, dt: number): void {
  if (w.railC.size === 0) return;
  const cfg = TUNING.rail;

  for (const [e, rail] of w.railC) {
    const prop = w.propC.get(e);
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (prop === undefined || t === undefined || b === undefined) continue;
    // Схваченный или брошенный стеллаж едет не по рельсу, а по воле
    // субъекта. Приземлится — поедет снова.
    if (prop.phase !== 'idle') continue;
    // Кольцо архивариуса ведёт он сам: рельс для него только метка.
    if (rail.owner !== undefined || rail.speed <= 0) continue;

    const step = rail.speed * dt;
    const nx = t.x + rail.dirX * step;
    const ny = t.y + rail.dirY * step;
    // Упёрся — разворот. Не остановка: рельс сквозной, ход непрерывный,
    // и именно поэтому за стеллажом нельзя сидеть.
    if (!free(w, nx, ny, b.radius + cfg.clearance)) {
      rail.dirX = -rail.dirX;
      rail.dirY = -rail.dirY;
      continue;
    }
    t.x = nx;
    t.y = ny;
    b.vx = 0;
    b.vy = 0;
  }
}

/** Влезает ли тело радиуса в точку: бетон, перегородки и стены. */
function free(w: World, x: number, y: number, radius: number): boolean {
  const map = w.map;
  const size = map.size;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const cx = Math.floor((x + dx * radius) / size);
    const cy = Math.floor((y + dy * radius) / size);
    if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return false;
    const tile = map.tiles[cy * map.cols + cx];
    if (tile === undefined || tile === 1 || tile === 3) return false;
  }
  return true;
}
