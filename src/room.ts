/**
 * Помещение — прямоугольная сетка клеток, собранная из шаблона-планировки.
 * Дверь — особая клетка: сплошная, пока помещение не зачищено.
 */
import { ROOM_TEMPLATES, TEMPLATES_BY_ID, TEMPLATE_START, type RoomTemplate } from './data/roomTemplates';
import { TUNING } from './tuning';

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;
export const TILE_DOOR = 2;
/** Разрушаемая перегородка: тот же бетон, но с прочностью. */
export const TILE_WEAK = 3;

/** Стороны помещения. Порядок задаёт индексы в neighbors и doors. */
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;

export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [NORTH, EAST, SOUTH, WEST];
/** Смещение по сетке этажа для каждой стороны. */
export const DIR_STEP: Readonly<Record<Dir, readonly [number, number]>> = {
  [NORTH]: [0, -1],
  [EAST]: [1, 0],
  [SOUTH]: [0, 1],
  [WEST]: [-1, 0],
};

export function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

export interface TileMap {
  cols: number;
  rows: number;
  size: number;
  tiles: Uint8Array;
  /** Прочность разрушаемых перегородок по тем же индексам. */
  weakHp: Uint8Array;
  /** Пока true, дверные клетки непроходимы. */
  doorsLocked: boolean;
}

const WALL = TUNING.room.wall;
const MAP_COLS = TUNING.room.cols + WALL * 2;
const MAP_ROWS = TUNING.room.rows + WALL * 2;

/** Две клетки дверного проёма по центру стороны, в координатах карты. */
export function doorCells(dir: Dir): ReadonlyArray<readonly [number, number]> {
  const midX = WALL + Math.floor(TUNING.room.cols / 2) - 1;
  const midY = WALL + Math.floor(TUNING.room.rows / 2) - 1;
  switch (dir) {
    case NORTH:
      return [[midX, 0], [midX + 1, 0]];
    case SOUTH:
      return [[midX, MAP_ROWS - 1], [midX + 1, MAP_ROWS - 1]];
    case WEST:
      return [[0, midY], [0, midY + 1]];
    case EAST:
      return [[MAP_COLS - 1, midY], [MAP_COLS - 1, midY + 1]];
  }
}

/**
 * Собрать карту помещения: рамка из бетона, начинка из шаблона,
 * проёмы на тех сторонах, где есть сосед.
 */
export function buildRoomMap(templateId: string, doors: readonly boolean[]): TileMap {
  const template = TEMPLATES_BY_ID.get(templateId) ?? fallbackTemplate();
  const map: TileMap = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    size: TUNING.room.tile,
    tiles: new Uint8Array(MAP_COLS * MAP_ROWS),
    weakHp: new Uint8Array(MAP_COLS * MAP_ROWS),
    doorsLocked: true,
  };

  paint(map, template);
  for (const dir of DIRS) {
    if (doors[dir] !== true) continue;
    for (const [cx, cy] of doorCells(dir)) map.tiles[cy * map.cols + cx] = TILE_DOOR;
  }

  // Планировка могла отрезать дверь от центра — тогда откатываемся на холл.
  if (!doorsReachable(map, doors)) {
    paint(map, fallbackTemplate());
    for (const dir of DIRS) {
      if (doors[dir] !== true) continue;
      for (const [cx, cy] of doorCells(dir)) map.tiles[cy * map.cols + cx] = TILE_DOOR;
    }
  }
  return map;
}

function fallbackTemplate(): RoomTemplate {
  const start = TEMPLATES_BY_ID.get(TEMPLATE_START);
  if (start !== undefined) return start;
  const first = ROOM_TEMPLATES[0];
  if (first === undefined) throw new Error('Нет ни одной планировки');
  return first;
}

function paint(map: TileMap, template: RoomTemplate): void {
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const border = cx < WALL || cy < WALL || cx >= map.cols - WALL || cy >= map.rows - WALL;
      let tile = TILE_WALL;
      if (!border) {
        const row = template.rows[cy - WALL];
        const glyph = row === undefined ? '.' : row[cx - WALL];
        tile = glyph === '#' ? TILE_WALL : glyph === '%' ? TILE_WEAK : TILE_FLOOR;
      }
      const at = cy * map.cols + cx;
      map.tiles[at] = tile;
      map.weakHp[at] = tile === TILE_WEAK ? TUNING.room.weakWallHp : 0;
    }
  }
}

/** Заливка от центра: каждый проём обязан быть достижим. */
function doorsReachable(map: TileMap, doors: readonly boolean[]): boolean {
  const seen = new Uint8Array(map.cols * map.rows);
  const startX = Math.floor(map.cols / 2);
  const startY = Math.floor(map.rows / 2);
  const stack: number[] = [startY * map.cols + startX];
  seen[stack[0] ?? 0] = 1;
  while (stack.length > 0) {
    const at = stack.pop();
    if (at === undefined) continue;
    const cx = at % map.cols;
    const cy = (at - cx) / map.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const at2 = ny * map.cols + nx;
      const blocked = map.tiles[at2] === TILE_WALL || map.tiles[at2] === TILE_WEAK;
      if (seen[at2] === 1 || blocked) continue;
      seen[at2] = 1;
      stack.push(at2);
    }
  }
  for (const dir of DIRS) {
    if (doors[dir] !== true) continue;
    for (const [cx, cy] of doorCells(dir)) {
      if (seen[cy * map.cols + cx] !== 1) return false;
    }
  }
  return true;
}

export function isSolidCell(map: TileMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return true;
  const tile = map.tiles[cy * map.cols + cx];
  return tile === TILE_WALL || tile === TILE_WEAK || (tile === TILE_DOOR && map.doorsLocked);
}

export function isSolidPoint(map: TileMap, x: number, y: number): boolean {
  return isSolidCell(map, Math.floor(x / map.size), Math.floor(y / map.size));
}

/**
 * Ударить по перегородке. Возвращает true, если она рассыпалась —
 * тогда вызывающий оставляет на её месте обломок.
 */
export function damageWall(map: TileMap, x: number, y: number, amount: number): boolean {
  const cx = Math.floor(x / map.size);
  const cy = Math.floor(y / map.size);
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return false;
  const at = cy * map.cols + cx;
  if (map.tiles[at] !== TILE_WEAK) return false;
  const left = (map.weakHp[at] ?? 0) - Math.max(1, Math.round(amount));
  if (left > 0) {
    map.weakHp[at] = left;
    return false;
  }
  map.tiles[at] = TILE_FLOOR;
  map.weakHp[at] = 0;
  return true;
}

/** Центр клетки, в которой лежит точка. */
export function cellCenter(map: TileMap, x: number, y: number): { x: number; y: number } {
  return {
    x: (Math.floor(x / map.size) + 0.5) * map.size,
    y: (Math.floor(y / map.size) + 0.5) * map.size,
  };
}

export function tileAtPoint(map: TileMap, x: number, y: number): number {
  const cx = Math.floor(x / map.size);
  const cy = Math.floor(y / map.size);
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return TILE_WALL;
  return map.tiles[cy * map.cols + cx] ?? TILE_WALL;
}

/** Центр помещения в пикселях. */
export function roomCenter(map: TileMap): { x: number; y: number } {
  return { x: (map.cols * map.size) / 2, y: (map.rows * map.size) / 2 };
}

/**
 * Куда поставить субъекта, вошедшего через дверь стороны dir:
 * по центру проёма, на первую клетку пола внутри помещения.
 */
export function entryPosition(map: TileMap, dir: Dir): { x: number; y: number } {
  const cells = doorCells(dir);
  const first = cells[0];
  const second = cells[1];
  if (first === undefined || second === undefined) return roomCenter(map);
  const [dx, dy] = DIR_STEP[opposite(dir)];
  const cx = (first[0] + second[0] + 1) / 2 + dx;
  const cy = (first[1] + second[1] + 1) / 2 + dy;
  return { x: cx * map.size, y: cy * map.size };
}

/** Случайная свободная клетка помещения. Возвращает центр клетки. */
export function randomFloorPoint(
  map: TileMap,
  roll: (n: number) => number,
  attempts: number,
): { x: number; y: number } {
  const wall = TUNING.room.wall;
  for (let i = 0; i < attempts; i++) {
    const cx = wall + roll(TUNING.room.cols);
    const cy = wall + roll(TUNING.room.rows);
    if (map.tiles[cy * map.cols + cx] !== TILE_FLOOR) continue;
    return { x: (cx + 0.5) * map.size, y: (cy + 0.5) * map.size };
  }
  return roomCenter(map);
}

/** Субъект встал на клетку проёма — значит, уходит в соседнее помещение. */
export function standingInDoor(map: TileMap, dir: Dir, x: number, y: number): boolean {
  const cx = Math.floor(x / map.size);
  const cy = Math.floor(y / map.size);
  for (const [dx, dy] of doorCells(dir)) {
    if (dx === cx && dy === cy) return true;
  }
  return false;
}
