/** Помещение — прямоугольная сетка клеток. 0 — пол, 1 — бетонный блок. */
import { TUNING } from './tuning';

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;

export interface TileMap {
  cols: number;
  rows: number;
  size: number;
  tiles: Uint8Array;
}

/** Одна прямоугольная комната: пол, по периметру — стена заданной толщины. */
export function buildRoom(): TileMap {
  const wall = TUNING.room.wall;
  const cols = TUNING.room.cols + wall * 2;
  const rows = TUNING.room.rows + wall * 2;
  const tiles = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const border = cx < wall || cy < wall || cx >= cols - wall || cy >= rows - wall;
      tiles[cy * cols + cx] = border ? TILE_WALL : TILE_FLOOR;
    }
  }
  return { cols, rows, size: TUNING.room.tile, tiles };
}

export function isSolidCell(map: TileMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return true;
  return map.tiles[cy * map.cols + cx] === TILE_WALL;
}

export function isSolidPoint(map: TileMap, x: number, y: number): boolean {
  return isSolidCell(map, Math.floor(x / map.size), Math.floor(y / map.size));
}

/** Границы пола в пикселях: [minX, minY, maxX, maxY]. */
export function floorBounds(map: TileMap): [number, number, number, number] {
  const w = TUNING.room.wall * map.size;
  return [w, w, map.cols * map.size - w, map.rows * map.size - w];
}
