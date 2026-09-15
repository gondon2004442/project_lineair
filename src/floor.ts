/**
 * Этаж — дерево помещений на целочисленной сетке.
 * Один основной путь плюс одно-два ответвления. Всё из seeded PRNG.
 */
import { ROOM_TEMPLATES, TEMPLATE_END, TEMPLATE_START } from './data/roomTemplates';
import { MINI_BOSS_POSTS, STAFFING_HEAD, STAFFING_LOBBY, STAFFING_ORDINARY } from './data/staffing';
import type { Rng } from './rng';
import { DIRS, DIR_STEP, opposite, type Dir } from './room';
import { TUNING } from './tuning';

export type RoomKind = 'start' | 'normal' | 'end' | 'branch';

export interface RoomNode {
  index: number;
  /** Координаты на сетке этажа, приведённые к неотрицательным. */
  gx: number;
  gy: number;
  template: string;
  kind: RoomKind;
  /** Индекс соседа по каждой стороне или -1. */
  neighbors: [number, number, number, number];
  /** Штатное расписание участка: кем занимают ставки при первом входе. */
  staffing: string;
  /** Старшая ставка, введённая на участок сверх расписания. Пусто — нет. */
  miniBoss: string;
  cleared: boolean;
  visited: boolean;
}

export interface Floor {
  rooms: RoomNode[];
  start: number;
  end: number;
  /** Размер сетки для мини-карты. */
  width: number;
  height: number;
}

interface Draft {
  gx: number;
  gy: number;
  kind: RoomKind;
  neighbors: [number, number, number, number];
}

export function generateFloor(rng: Rng): Floor {
  const total = pick(rng, TUNING.floor.roomsMin, TUNING.floor.roomsMax);
  const branchCount = pick(rng, TUNING.floor.branchesMin, TUNING.floor.branchesMax);

  const branchLengths: number[] = [];
  for (let i = 0; i < branchCount; i++) {
    branchLengths.push(pick(rng, TUNING.floor.branchLengthMin, TUNING.floor.branchLengthMax));
  }
  const branchTotal = branchLengths.reduce((a, b) => a + b, 0);
  const mainLength = Math.max(TUNING.floor.mainPathMin, total - branchTotal);

  const drafts: Draft[] = [];
  const taken = new Map<string, number>();

  const add = (gx: number, gy: number, kind: RoomKind): number => {
    const index = drafts.length;
    drafts.push({ gx, gy, kind, neighbors: [-1, -1, -1, -1] });
    taken.set(key(gx, gy), index);
    return index;
  };
  const link = (from: number, to: number, dir: Dir): void => {
    const a = drafts[from];
    const b = drafts[to];
    if (a === undefined || b === undefined) return;
    a.neighbors[dir] = to;
    b.neighbors[opposite(dir)] = from;
  };

  add(0, 0, 'start');
  let head = 0;
  const mainPath: number[] = [0];

  for (let i = 1; i < mainLength; i++) {
    const step = chooseStep(rng, drafts, taken, head);
    if (step === null) break;
    const next = add(step.gx, step.gy, 'normal');
    link(head, next, step.dir);
    mainPath.push(next);
    head = next;
  }

  const last = mainPath[mainPath.length - 1];
  if (last !== undefined && last !== 0) {
    const node = drafts[last];
    if (node !== undefined) node.kind = 'end';
  }

  // Ответвления растут из середины основного пути, не из входа и не из конца.
  for (const length of branchLengths) {
    const anchors = mainPath.slice(1, Math.max(2, mainPath.length - 1));
    if (anchors.length === 0) break;
    let from = anchors[rng.int(anchors.length)] ?? 0;
    for (let i = 0; i < length; i++) {
      const step = chooseStep(rng, drafts, taken, from);
      if (step === null) break;
      const next = add(step.gx, step.gy, 'branch');
      link(from, next, step.dir);
      from = next;
    }
  }

  return finish(drafts, rng);
}

/**
 * Выбираем свободную соседнюю клетку. Предпочитаем те, что касаются
 * только текущего помещения: иначе комнаты лепятся боками, и на мини-карте
 * дерево читается как каша.
 */
function chooseStep(
  rng: Rng,
  drafts: Draft[],
  taken: Map<string, number>,
  from: number,
): { gx: number; gy: number; dir: Dir } | null {
  const node = drafts[from];
  if (node === undefined) return null;

  const loose: { gx: number; gy: number; dir: Dir }[] = [];
  const any: { gx: number; gy: number; dir: Dir }[] = [];
  for (const dir of DIRS) {
    const [dx, dy] = DIR_STEP[dir];
    const gx = node.gx + dx;
    const gy = node.gy + dy;
    if (taken.has(key(gx, gy))) continue;
    const option = { gx, gy, dir };
    any.push(option);
    if (occupiedAround(taken, gx, gy) <= 1) loose.push(option);
  }
  const pool = loose.length > 0 ? loose : any;
  if (pool.length === 0) return null;
  return pool[rng.int(pool.length)] ?? null;
}

function occupiedAround(taken: Map<string, number>, gx: number, gy: number): number {
  let count = 0;
  for (const dir of DIRS) {
    const [dx, dy] = DIR_STEP[dir];
    if (taken.has(key(gx + dx, gy + dy))) count += 1;
  }
  return count;
}

function finish(drafts: Draft[], rng: Rng): Floor {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of drafts) {
    minX = Math.min(minX, d.gx);
    minY = Math.min(minY, d.gy);
    maxX = Math.max(maxX, d.gx);
    maxY = Math.max(maxY, d.gy);
  }

  const rooms: RoomNode[] = drafts.map((d, index) => ({
    index,
    gx: d.gx - minX,
    gy: d.gy - minY,
    template: chooseTemplate(rng, d.kind),
    kind: d.kind,
    neighbors: d.neighbors,
    staffing: staffingFor(d.kind, rng),
    miniBoss: miniBossFor(d.kind, rng),
    cleared: d.kind === 'start',
    visited: false,
  }));

  const end = rooms.findIndex((r) => r.kind === 'end');
  return {
    rooms,
    start: 0,
    end: end < 0 ? 0 : end,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function chooseTemplate(rng: Rng, kind: RoomKind): string {
  if (kind === 'start') return TEMPLATE_START;
  if (kind === 'end') return TEMPLATE_END;
  const template = ROOM_TEMPLATES[rng.int(ROOM_TEMPLATES.length)];
  return template === undefined ? TEMPLATE_START : template.id;
}

function staffingFor(kind: RoomKind, rng: Rng): string {
  if (kind === 'start') return STAFFING_LOBBY;
  if (kind === 'end') return STAFFING_HEAD;
  return STAFFING_ORDINARY[rng.int(STAFFING_ORDINARY.length)] ?? STAFFING_LOBBY;
}

/**
 * Мини-босс: старшая ставка на рядовом участке. Розыгрыш здесь, при
 * сборке этажа, поэтому он детерминирован от seed вместе со всем остальным.
 */
function miniBossFor(kind: RoomKind, rng: Rng): string {
  if (kind === 'start' || kind === 'end') return '';
  if (rng.float() >= TUNING.floor.miniBossChance) return '';
  const post = MINI_BOSS_POSTS[rng.int(MINI_BOSS_POSTS.length)];
  return post === undefined ? '' : post.post;
}

function pick(rng: Rng, min: number, max: number): number {
  return min + rng.int(Math.max(1, max - min + 1));
}

function key(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/** Есть ли дверь в каждую сторону — по наличию соседа. */
export function roomDoors(room: RoomNode): [boolean, boolean, boolean, boolean] {
  return [
    room.neighbors[0] >= 0,
    room.neighbors[1] >= 0,
    room.neighbors[2] >= 0,
    room.neighbors[3] >= 0,
  ];
}
