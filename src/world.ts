/** Сборка этажа и вход в помещение. Всё случайное — из seeded PRNG. */
import type { World } from './ecs';
import { STAFFING_BY_ID } from './data/staffing';
import { generateFloor, roomDoors, type RoomNode } from './floor';
import type { InputSnapshot } from './input';
import { makeRng } from './rng';
import {
  TILE_FLOOR,
  buildRoomMap,
  entryPosition,
  roomCenter,
  type Dir,
  type TileMap,
} from './room';
import { PROPS } from './data/props';
import { spawnPlayer, spawnProp, spawnStaff } from './spawn';
import { TUNING } from './tuning';

export function createWorld(seed: number, input: InputSnapshot): World {
  const rng = makeRng(seed);
  const floor = generateFloor(rng);
  const w: World = {
    seed,
    rng,
    tick: 0,
    floor,
    room: floor.start,
    map: buildRoomMap('hall', [false, false, false, false]),
    mapToken: 0,
    input,
    fx: { shake: 0, hitstop: 0 },
    status: 'playing',
    player: -1,
    roster: [],
    build: [],
    metronome: TUNING.post.inspector.metronomeInterval,
    beat: 0,
    nextEntity: 1,
    alive: new Set(),
    doomed: [],
    transform: new Map(),
    body: new Map(),
    health: new Map(),
    playerC: new Map(),
    staffC: new Map(),
    internC: new Map(),
    inspectorC: new Map(),
    registrarC: new Map(),
    auditorC: new Map(),
    propC: new Map(),
    bulletC: new Map(),
    drawC: new Map(),
  };

  w.player = spawnPlayer(w, 0, 0);
  enterRoom(w, floor.start, null);
  return w;
}

/**
 * Перейти в помещение. Всё, кроме субъекта, выметается;
 * штат участка набирается заново, если участок ещё не зачищен.
 */
export function enterRoom(w: World, index: number, fromDir: Dir | null): void {
  const room = w.floor.rooms[index];
  if (room === undefined) return;

  clearExceptPlayer(w);
  w.room = index;
  room.visited = true;
  w.map = buildRoomMap(room.template, roomDoors(room));
  w.map.doorsLocked = !room.cleared;
  w.mapToken += 1;

  w.metronome = TUNING.post.inspector.metronomeInterval;
  w.beat = 0;

  const spot = fromDir === null ? roomCenter(w.map) : entryPosition(w.map, fromDir);
  placePlayer(w, spot.x, spot.y);
  buildRoster(w, room);
  scatterProps(w, room, spot.x, spot.y);
  if (!room.cleared) staffRoom(w, room, spot.x, spot.y);
  if (w.staffC.size === 0 && !room.cleared) {
    room.cleared = true;
    w.map.doorsLocked = false;
  }
}

/** Штатное расписание участка в работе: квота на каждую должность. */
function buildRoster(w: World, room: RoomNode): void {
  const staffing = STAFFING_BY_ID.get(room.staffing);
  w.roster = [];
  if (staffing === undefined) return;
  for (const post of staffing.posts) {
    w.roster.push({
      post: post.post,
      title: post.title,
      priority: post.priority,
      quota: quotaFor(post.count),
      occupied: 0,
    });
  }
}

/** Набор штата по расписанию участка. Случайность — своя на каждое помещение. */
function staffRoom(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const staffing = STAFFING_BY_ID.get(room.staffing);
  if (staffing === undefined) return;
  const rng = makeRng((w.seed + room.index * TUNING.floor.roomSeedStride) >>> 0);

  const posts = [...staffing.posts].sort((a, b) => a.priority - b.priority);
  for (const post of posts) {
    const quota = quotaFor(post.count);
    for (let i = 0; i < quota; i++) {
      const spot = findSpawnSpot(w.map, rng, entryX, entryY);
      spawnStaff(w, post.post, post.priority, spot.x, spot.y);
    }
  }
}

/**
 * Мебель участка. Своя случайность на помещение, поэтому обстановка
 * не зависит от порядка обхода и восстанавливается при возврате.
 */
function scatterProps(w: World, room: RoomNode, entryX: number, entryY: number): void {
  if (room.kind === 'start') return;
  const rng = makeRng((w.seed + room.index * TUNING.floor.propSeedStride) >>> 0);
  for (const spec of PROPS) {
    for (let i = 0; i < spec.scatter; i++) {
      // Мебели отступ от входа нужен свой, куда меньший, чем штату:
      // иначе поднять при входе будет нечего, захват до неё не достанет.
      const spot = findSpawnSpot(w.map, rng, entryX, entryY, TUNING.prop.spawnClearance);
      spawnProp(w, spec.id, spot.x, spot.y);
    }
  }
}

function quotaFor(count: number): number {
  return Math.max(1, Math.round(count * TUNING.floor.staffScale));
}

/** Свободная клетка подальше от точки входа. */
function findSpawnSpot(
  map: TileMap,
  rng: ReturnType<typeof makeRng>,
  awayX: number,
  awayY: number,
  clearance: number = TUNING.staff.spawnMinDistance,
): { x: number; y: number } {
  let fallback = { x: awayX, y: awayY };
  for (let attempt = 0; attempt < TUNING.floor.spawnAttempts; attempt++) {
    const cx = TUNING.room.wall + rng.int(TUNING.room.cols);
    const cy = TUNING.room.wall + rng.int(TUNING.room.rows);
    if (map.tiles[cy * map.cols + cx] !== TILE_FLOOR) continue;
    const x = (cx + 0.5) * map.size;
    const y = (cy + 0.5) * map.size;
    fallback = { x, y };
    if (Math.hypot(x - awayX, y - awayY) >= clearance) return { x, y };
  }
  return fallback;
}

function placePlayer(w: World, x: number, y: number): void {
  const t = w.transform.get(w.player);
  if (t === undefined) return;
  t.x = x;
  t.y = y;
  // Прошлый кадр тоже здесь, иначе рендер протянет субъекта через весь экран.
  t.px = x;
  t.py = y;
}

function clearExceptPlayer(w: World): void {
  // Удерживаемое остаётся на прошлом участке.
  const player = w.playerC.get(w.player);
  if (player !== undefined) player.held = -1;
  for (const e of [...w.alive]) {
    if (e === w.player) continue;
    w.alive.delete(e);
    w.transform.delete(e);
    w.body.delete(e);
    w.health.delete(e);
    w.playerC.delete(e);
    w.staffC.delete(e);
    w.internC.delete(e);
    w.inspectorC.delete(e);
    w.registrarC.delete(e);
    w.auditorC.delete(e);
    w.propC.delete(e);
    w.bulletC.delete(e);
    w.drawC.delete(e);
  }
  w.doomed.length = 0;
}

export function currentRoom(w: World): RoomNode | undefined {
  return w.floor.rooms[w.room];
}

export function clearedCount(w: World): number {
  return w.floor.rooms.reduce((sum, room) => sum + (room.cleared ? 1 : 0), 0);
}
