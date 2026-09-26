/**
 * Этаж — дерево помещений на целочисленной сетке.
 * Один основной путь плюс одно-два ответвления. Всё из seeded PRNG.
 */
import {
  ROOM_TEMPLATES,
  TEMPLATES_BY_ID,
  TEMPLATE_CORRIDOR,
  TEMPLATE_END,
  TEMPLATE_START,
} from './data/roomTemplates';
import {
  MINI_BOSS_POSTS,
  STAFFING_HEAD,
  STAFFING_LOBBY,
  STAFFING_ORDINARY,
  STAFFING_PASSAGE,
} from './data/staffing';
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
  /** Приписан ли к участку курьер. */
  courier: boolean;
  /** Опечатанный шкаф на участке. */
  safe: boolean;
  /** Стол выдачи. На этаже он один. */
  desk: boolean;
  /** Переход между узлами: проходной участок, а не место встречи. */
  corridor: boolean;
  cleared: boolean;
  visited: boolean;
}

export interface Floor {
  /** По какой схеме разложен этаж. */
  scheme: FloorScheme;
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
  /** Узел или переход между узлами. */
  corridor: boolean;
}

/**
 * Схемы этажа. Генератор не лепит комнаты как придётся: он выбирает
 * одну из заранее заданных схем и раскладывает по ней узлы. Отсюда у
 * этажа появляется форма, а не вид случайной кляксы.
 */
export type FloorScheme = 'line' | 'ring' | 'fork';

const SCHEMES: FloorScheme[] = ['line', 'ring', 'fork'];

/**
 * Номер помещения. Считается от места на сетке этажа, а не от порядка
 * обхода: соседние по плану помещения получают соседние номера, как в
 * настоящем здании. Переходы отмечены буквой — это служебные помещения,
 * и по номеру это видно.
 *
 * Контора тридцать лет нумеровала помещения; нумерация — это и есть
 * первое, чем набор комнат отличается от набора арен.
 */
export function roomNumber(room: RoomNode): string {
  const base = 100 + room.gy * 10 + room.gx + 1;
  return room.corridor ? `${base}-Б` : String(base);
}

export function generateFloor(rng: Rng): Floor {
  const scheme = SCHEMES[rng.int(SCHEMES.length)] ?? 'line';
  if (scheme === 'ring') return buildRing(rng);
  if (scheme === 'fork') return buildFork(rng);
  return buildLine(rng);
}

/** Линейная схема с ответвлениями: длинный путь и один-два тупика. */
function buildLine(rng: Rng): Floor {
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
    drafts.push({ gx, gy, kind, neighbors: [-1, -1, -1, -1], corridor: false });
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
    // Каждый второй участок основного пути — переход: узлы не лепятся
    // друг к другу, между ними связка.
    const node = drafts[next];
    if (node !== undefined && i % 2 === 0 && i < mainLength - 1) node.corridor = true;
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

  return finish(drafts, rng, 'line');
}

/**
 * Кольцо: замкнутый обход по периметру. Возвращаться можно любой
 * стороной, и приёмная стоит на дальней от входа точке кольца.
 */
function buildRing(rng: Rng): Floor {
  const w = pick(rng, TUNING.floor.ringWidthMin, TUNING.floor.ringWidthMax);
  const h = pick(rng, TUNING.floor.ringHeightMin, TUNING.floor.ringHeightMax);

  // Обход периметра по часовой стрелке, начиная с левого верхнего угла.
  const path: { gx: number; gy: number }[] = [];
  for (let x = 0; x < w; x++) path.push({ gx: x, gy: 0 });
  for (let y = 1; y < h; y++) path.push({ gx: w - 1, gy: y });
  for (let x = w - 2; x >= 0; x--) path.push({ gx: x, gy: h - 1 });
  for (let y = h - 2; y >= 1; y--) path.push({ gx: 0, gy: y });

  const drafts: Draft[] = path.map((p, i) => ({
    gx: p.gx,
    gy: p.gy,
    kind: i === 0 ? 'start' : 'normal',
    neighbors: [-1, -1, -1, -1] as [number, number, number, number],
    // Углы кольца — узлы, стороны между ними — переходы.
    corridor: i !== 0 && p.gx !== 0 && p.gx !== w - 1 ? true : p.gy !== 0 && p.gy !== h - 1,
  }));

  // Замыкаем: каждый с каждым по сетке, включая стык последнего с первым.
  const at = new Map<string, number>();
  drafts.forEach((d, i) => at.set(key(d.gx, d.gy), i));
  drafts.forEach((d) => {
    for (const dir of DIRS) {
      const [dx, dy] = DIR_STEP[dir];
      const other = at.get(key(d.gx + dx, d.gy + dy));
      if (other === undefined) continue;
      d.neighbors[dir] = other;
    }
  });

  // Приёмная — на противоположной точке обхода.
  const far = drafts[Math.floor(drafts.length / 2)];
  if (far !== undefined) {
    far.kind = 'end';
    far.corridor = false;
  }
  return finish(drafts, rng, 'ring');
}

/**
 * Ветвление на три: короткий ствол, узел и три рукава. Приёмная — в конце
 * самого длинного, остальные два кончаются тупиками с добычей.
 */
function buildFork(rng: Rng): Floor {
  const drafts: Draft[] = [];
  const taken = new Map<string, number>();
  const add = (gx: number, gy: number, kind: RoomKind, corridor: boolean): number => {
    const index = drafts.length;
    drafts.push({ gx, gy, kind, neighbors: [-1, -1, -1, -1], corridor });
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

  // Ствол идёт вправо, узел на его конце.
  const stem = pick(rng, TUNING.floor.forkStemMin, TUNING.floor.forkStemMax);
  add(0, 0, 'start', false);
  let head = 0;
  for (let i = 1; i <= stem; i++) {
    const next = add(i, 0, 'normal', i < stem);
    link(head, next, 1);
    head = next;
  }
  const hub = head;

  // Три рукава: вверх, вправо и вниз от узла.
  const arms: { dir: Dir; step: [number, number] }[] = [
    { dir: 0, step: [0, -1] },
    { dir: 1, step: [1, 0] },
    { dir: 2, step: [0, 1] },
  ];
  let longest = hub;
  let longestLength = 0;
  for (const arm of arms) {
    const length = pick(rng, TUNING.floor.forkArmMin, TUNING.floor.forkArmMax);
    let from = hub;
    const base = drafts[hub];
    if (base === undefined) break;
    for (let i = 1; i <= length; i++) {
      const gx = base.gx + arm.step[0] * i;
      const gy = base.gy + arm.step[1] * i;
      if (taken.has(key(gx, gy))) break;
      const next = add(gx, gy, 'branch', i < length);
      link(from, next, arm.dir);
      from = next;
    }
    if (length > longestLength) {
      longestLength = length;
      longest = from;
    }
  }

  const finishRoom = drafts[longest];
  if (finishRoom !== undefined && longest !== 0) {
    finishRoom.kind = 'end';
    finishRoom.corridor = false;
  }
  return finish(drafts, rng, 'fork');
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

function finish(drafts: Draft[], rng: Rng, scheme: FloorScheme): Floor {
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

  const rooms: RoomNode[] = drafts.map((d, index) => {
    // Глубина участка на этаже: ближе к приёмной планировки сложнее.
    const depth = drafts.length <= 1 ? 1 : index / (drafts.length - 1);
    // Переход — всегда коридор: он и есть связка между узлами.
    const template = d.corridor ? TEMPLATE_CORRIDOR : chooseTemplate(rng, d.kind, depth);
    return {
    index,
    gx: d.gx - minX,
    gy: d.gy - minY,
    template,
    kind: d.kind,
    corridor: d.corridor,
    neighbors: d.neighbors,
    staffing: d.corridor ? STAFFING_PASSAGE : staffingFor(d.kind, rng, template),
    miniBoss: d.corridor ? '' : miniBossFor(d.kind, rng),
    courier: !d.corridor && d.kind !== 'start' && rng.float() < TUNING.floor.courierChance,
    safe:
      !d.corridor &&
      d.kind !== 'start' &&
      d.kind !== 'end' &&
      rng.float() < TUNING.stash.safeChance,
    desk: false,
    cleared: d.kind === 'start',
    visited: false,
    };
  });

  // Стол выдачи на этаже ровно один и не в приёмной: иначе до него можно
  // не дойти вовсе. Там, где он стоит, шкафа не будет — два источника
  // добычи на одном участке обесценивают выбор между ними.
  const plain = rooms.filter((r) => (r.kind === 'normal' || r.kind === 'branch') && !r.corridor);
  const deskRoom = plain[rng.int(Math.max(1, plain.length))];
  if (deskRoom !== undefined) {
    deskRoom.desk = true;
    deskRoom.safe = false;
  }

  const end = rooms.findIndex((r) => r.kind === 'end');
  return {
    scheme,
    rooms,
    start: 0,
    end: end < 0 ? 0 : end,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Планировка участка. Выбирается по весу среди тех, чья сложность не выше
 * глубины участка: в начале этажа открытые залы, ближе к приёмной —
 * кубиклы и стекло. Приёмная и вестибюль заданы жёстко.
 */
function chooseTemplate(rng: Rng, kind: RoomKind, depth: number): string {
  if (kind === 'start') return TEMPLATE_START;
  if (kind === 'end') return TEMPLATE_END;

  const want = depth < TUNING.floor.difficultyMid ? 1 : depth < TUNING.floor.difficultyDeep ? 2 : 3;
  const fits = ROOM_TEMPLATES.filter((t) => t.id !== TEMPLATE_END && t.difficulty <= want && t.weight > 0);
  const pool = fits.length > 0 ? fits : ROOM_TEMPLATES.filter((t) => t.id !== TEMPLATE_END);
  let total = 0;
  for (const t of pool) total += t.weight;
  if (total <= 0) return TEMPLATE_START;

  let roll = rng.float() * total;
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) return t.id;
  }
  return pool[pool.length - 1]?.id ?? TEMPLATE_START;
}

/**
 * Расписание участка. Планировка имеет право голоса: в кубиклах уместен
 * картотечный участок, в коридоре — обход. Если планировка не настаивает,
 * берётся любое обычное.
 */
function staffingFor(kind: RoomKind, rng: Rng, templateId: string): string {
  if (kind === 'start') return STAFFING_LOBBY;
  if (kind === 'end') return STAFFING_HEAD;
  const template = TEMPLATES_BY_ID.get(templateId);
  const wanted = template === undefined ? [] : template.staffing.filter((id) => id !== STAFFING_HEAD);
  const pool = wanted.length > 0 ? wanted : STAFFING_ORDINARY;
  return pool[rng.int(pool.length)] ?? STAFFING_LOBBY;
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
