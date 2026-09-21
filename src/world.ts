/** Сборка этажа и вход в помещение. Всё случайное — из seeded PRNG. */
import type { World } from './ecs';
import { POST_COURIER } from './data/posts';
import { MINI_BOSS_POSTS, STAFFING_BY_ID, type StaffPost } from './data/staffing';
import { generateFloor, roomDoors, type RoomNode } from './floor';
import type { InputSnapshot } from './input';
import { pickItem } from './paperwork';
import { makeRng, type Rng } from './rng';
import {
  TILE_FLOOR,
  buildLobbyMap,
  buildRoomMap,
  entryPosition,
  roomCenter,
  type Dir,
  type TileMap,
} from './room';
import { ITEMS, type Item } from './data/items';
import { PROPS } from './data/props';
import { TEMPLATES_BY_ID, type CoverSlot } from './data/roomTemplates';
import { WEAPON_FORMS } from './data/weaponForms';
import { ammoMax, reserveMax } from './weapon';
import { COUNTERS, type CounterSpec } from './data/counters';
import { postNumbers, propNumbers, spawnCounter, spawnPlayer, spawnProp, spawnStaff, spawnStash } from './spawn';
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
    fx: {
      shake: 0,
      hitstop: 0,
      slowMo: 0,
      blankTime: 0,
      blankX: 0,
      blankY: 0,
      warpTime: 0,
      warpX: 0,
      warpY: 0,
      warpPower: 0,
    },
    sounds: [],
    status: 'playing',
    scene: 'lobby',
    player: -1,
    roster: [],
    build: [],
    blanks: TUNING.blank.refillTo,
    passes: TUNING.stash.passesStart,
    reward: { chance: TUNING.reward.base, dry: 0, lastItem: '', lastOrder: '', lastWeight: 1 },
    record: { penalty: 0, service: 0, broken: 0, roomClean: true, controlHere: 0 },
    tickets: 0,
    commendations: 0,
    runEnded: '',
    note: [],
    noteSlot: -1,
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
    chiefC: new Map(),
    courierC: new Map(),
    propC: new Map(),
    stashC: new Map(),
    ticketC: new Map(),
    counterC: new Map(),
    bulletC: new Map(),
    drawC: new Map(),
  };

  w.player = spawnPlayer(w, 0, 0);
  enterLobby(w);
  return w;
}

/**
 * Вестибюль. Забег ещё не начался: этаж уже собран и ждёт,
 * но пока субъект не шагнул в проём, ничего не происходит.
 */
export function enterLobby(w: World): void {
  clearExceptPlayer(w);
  w.scene = 'lobby';
  w.status = 'playing';
  w.room = w.floor.start;
  w.map = buildLobbyMap();
  w.mapToken += 1;
  w.roster = [];
  w.record.roomClean = true;
  w.record.controlHere = 0;
  w.metronome = TUNING.post.inspector.metronomeInterval;
  w.beat = 0;

  const center = roomCenter(w.map);
  // Ставим субъекта ниже проёма, чтобы забег не начался сам собой.
  placePlayer(w, center.x, center.y + TUNING.room.tile * TUNING.lobby.spawnOffsetTiles);
  restorePlayer(w);
  scatterLobbyProps(w);
}

/** Забег начинается со входа в первое помещение этажа. */
export function startRun(w: World): void {
  w.scene = 'run';
  w.status = 'playing';
  w.build = [];
  // Бланки пополняются на входе на этаж, но только до потолка: сэкономил
  // прошлый этаж — запас не копится, потратил весь — получишь полный.
  w.blanks = Math.max(w.blanks, TUNING.blank.refillTo);
  w.passes = Math.max(w.passes, TUNING.stash.passesStart);
  w.reward.chance = TUNING.reward.base;
  w.reward.dry = 0;
  w.reward.lastItem = '';
  w.reward.lastOrder = '';
  w.reward.lastWeight = 1;
  w.tickets = 0;
  w.commendations = 0;
  w.note = [];
  w.noteSlot = -1;
  w.runEnded = '';
  w.record.penalty = 0;
  w.record.service = 0;
  w.record.broken = 0;
  w.record.roomClean = true;
  restorePlayer(w);
  enterRoom(w, w.floor.start, null);
}

/** Полный запас хода, полные обоймы, полная энергия. */
function restorePlayer(w: World): void {
  const health = w.health.get(w.player);
  const player = w.playerC.get(w.player);
  if (health !== undefined) {
    health.max = TUNING.player.maxHp;
    health.hp = health.max;
    health.iframes = 0;
    health.flash = 0;
  }
  if (player !== undefined) {
    player.energy = TUNING.telekinesis.energyMax;
    player.energyDelay = 0;
    player.held = -1;
    player.charge = 0;
    player.queued = 0;
    player.reloading = false;
    player.reloadTimer = 0;
    for (let i = 0; i < WEAPON_FORMS.length; i++) {
      const form = WEAPON_FORMS[i];
      if (form === undefined) continue;
      player.ammo[i] = ammoMax(w, form.id);
      player.reserve[i] = reserveMax(w, form.id);
    }
  }
  const body = w.body.get(w.player);
  if (body !== undefined) {
    body.vx = 0;
    body.vy = 0;
  }
}

/** Канцелярская обстановка вестибюля: есть что покидать телекинезом. */
function scatterLobbyProps(w: World): void {
  const rng = makeRng((w.seed ^ TUNING.floor.propSeedStride) >>> 0);
  const center = roomCenter(w.map);
  for (const spec of PROPS) {
    for (let i = 0; i < spec.scatter; i++) {
      const spot = findSpawnSpot(
        w.map,
        rng,
        center.x,
        center.y,
        TUNING.lobby.gateClearance,
        propNumbers(spec.id).radius,
      );
      spawnProp(w, spec.id, spot.x, spot.y);
    }
  }
}

/**
 * Перейти в помещение. Всё, кроме субъекта, выметается;
 * штат участка набирается заново, если участок ещё не зачищен.
 */
export function enterRoom(w: World, index: number, fromDir: Dir | null): void {
  const room = w.floor.rooms[index];
  if (room === undefined) return;

  clearExceptPlayer(w);
  w.scene = 'run';
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
  placeStash(w, room, spot.x, spot.y);
  placeCounter(w, room, spot.x, spot.y);
  if (!room.cleared) staffRoom(w, room, spot.x, spot.y);
  if (w.staffC.size === 0 && !room.cleared) {
    room.cleared = true;
    w.map.doorsLocked = false;
  }
}

/**
 * Точка для слота мебели: середина клетки плюс разброс. Если выпавшее
 * место занято бетоном или слишком близко ко входу, слот пробует ещё
 * раз, а не ставит шкаф в стену.
 */
function coverSpot(
  map: TileMap,
  rng: Rng,
  slot: CoverSlot,
  radius: number,
  entryX: number,
  entryY: number,
): { x: number; y: number } | null {
  const tile = TUNING.room.tile;
  const wall = TUNING.room.wall;
  const clear = TUNING.prop.spawnClearance;
  for (let attempt = 0; attempt < TUNING.floor.spawnAttempts; attempt++) {
    const jitter = slot.jitter;
    const col = slot.col + (jitter > 0 ? rng.range(-jitter, jitter) : 0);
    const row = slot.row + (jitter > 0 ? rng.range(-jitter, jitter) : 0);
    const x = (wall + col + 0.5) * tile;
    const y = (wall + row + 0.5) * tile;
    if (!bodyFits(map, x, y, radius)) continue;
    if (Math.hypot(x - entryX, y - entryY) < clear) continue;
    return { x, y };
  }
  return null;
}

/**
 * Добыча участка. Шкаф стоит там, где выпал; стол выдачи — три ячейки в
 * ряд, каждая с названным приложением. Что именно лежит, решает тот же
 * seed, поэтому на одном seed добыча всегда одна и та же.
 */
function placeStash(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const cfg = TUNING.stash;

  // Чужое дело лежит открыто: платить за него не надо, его надо прочесть.
  // Бросок делается всегда, даже когда архив пуст, — иначе поток
  // случайных чисел зависел бы от хранилища, а с ним поехал бы забег.
  const caseRng = makeRng((w.seed + room.index * TUNING.archive.seedStride) >>> 0);
  const wantCase = caseRng.float() < TUNING.archive.chance;
  const slot = caseRng.int(Math.max(1, Math.round(TUNING.archive.keep)));
  if (wantCase && room.kind !== 'start' && !room.corridor) {
    const spot = findSpawnSpot(w.map, caseRng, entryX, entryY, cfg.clearance, cfg.cellRadius);
    spawnStash(w, 'case', String(slot), 'ДЕЛО ПРЕДЫДУЩЕГО ЭКЗЕМПЛЯРА', spot.x, spot.y);
  }

  if (!room.safe && !room.desk) return;
  const rng = makeRng((w.seed + room.index * cfg.seedStride) >>> 0);

  if (room.safe) {
    const spot = findSpawnSpot(w.map, rng, entryX, entryY, cfg.clearance, cfg.safeRadius);
    spawnStash(w, 'safe', '', 'ОПЕЧАТАННЫЙ ШКАФ', spot.x, spot.y);
    return;
  }

  // Стол выдачи: ячейки в ряд по центру участка, чтобы к ним подходили,
  // а не натыкались. Предлагается то, чего в деле ещё нет.
  const centre = roomCenter(w.map);
  const cells = Math.max(1, Math.round(cfg.deskCells));
  // Ячейки набираются тем же делопроизводством: одна из трёх почти
  // всегда оказывается той, что завершает распоряжение.
  const taken = new Set<string>();
  for (let i = 0; i < cells; i++) {
    const pick = pickCell(w, rng, taken);
    if (pick === undefined) break;
    taken.add(pick.id);
    const x = centre.x + (i - (cells - 1) / 2) * cfg.deskGap;
    spawnStash(w, 'cell', pick.id, `${pick.code} · ${pick.title}`, x, centre.y);
  }
}

/**
 * Какие участки этажа получают стойки и какие именно. Считается от seed
 * и раскладки этажа, а не хранится: расстановка не должна зависеть от
 * того, в каком порядке игрок обходит этаж.
 *
 * Коридоры, вестибюльный участок и приёмная не в счёт: в первом негде
 * стоять, в последней не до окошек.
 */
function counterPlan(w: World): Map<number, CounterSpec> {
  const cfg = TUNING.counter;
  const rng = makeRng((w.seed ^ cfg.seedStride) >>> 0);
  const pool = w.floor.rooms
    .filter((r) => !r.corridor && r.kind !== 'start' && r.index !== w.floor.end)
    .map((r) => r.index);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  // Виды тоже тасуются: иначе на этаже всегда была бы одна и та же пара.
  const kinds = COUNTERS.slice();
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const swap = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = swap;
  }
  const plan = new Map<number, CounterSpec>();
  const take = Math.min(pool.length, Math.max(0, Math.round(cfg.perFloor)));
  for (let i = 0; i < take; i++) {
    const spec = kinds[i % kinds.length];
    if (spec === undefined) break;
    plan.set(pool[i] ?? -1, spec);
  }
  return plan;
}

function placeCounter(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const spec = counterPlan(w).get(room.index);
  if (spec === undefined) return;
  const cfg = TUNING.counter;
  const rng = makeRng((w.seed + room.index * cfg.seedStride) >>> 0);
  const spot = findSpawnSpot(w.map, rng, entryX, entryY, cfg.clearance, cfg.radius);
  spawnCounter(w, spec, spot.x, spot.y);
}

/** Ячейка стола: то же взвешивание, но без повторов в одном столе. */
function pickCell(w: World, rng: Rng, taken: Set<string>): Item | undefined {
  for (let attempt = 0; attempt < TUNING.floor.spawnAttempts; attempt++) {
    const pick = pickItem(w, rng);
    if (pick === undefined) return undefined;
    if (!taken.has(pick.id)) return pick;
  }
  return ITEMS.find((item) => !taken.has(item.id));
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
  if (room.courier) {
    w.roster.push({ post: POST_COURIER, title: 'КУРЬЕР', priority: 3, quota: 1, occupied: 0 });
  }
  const extra = MINI_BOSS_POSTS.find((post) => post.post === room.miniBoss);
  if (extra !== undefined) {
    // Старшая ставка вводится одна, множитель квоты её не касается.
    w.roster.push({
      post: extra.post,
      title: extra.title,
      priority: extra.priority,
      quota: extra.count,
      occupied: 0,
    });
  }
}

/** Набор штата по расписанию участка. Случайность — своя на каждое помещение. */
function staffRoom(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const staffing = STAFFING_BY_ID.get(room.staffing);
  if (staffing === undefined) return;
  const rng = makeRng((w.seed + room.index * TUNING.floor.roomSeedStride) >>> 0);

  const extra = MINI_BOSS_POSTS.filter((post) => post.post === room.miniBoss);
  const runner: StaffPost[] = room.courier
    ? [{ post: POST_COURIER, title: 'КУРЬЕР', count: 1, priority: 3 }]
    : [];
  const posts = [...staffing.posts, ...extra, ...runner].sort((a, b) => a.priority - b.priority);
  for (const post of posts) {
    const single = post.post === room.miniBoss || post.post === POST_COURIER;
    const quota = single ? post.count : quotaFor(post.count);
    for (let i = 0; i < quota; i++) {
      const spot = findSpawnSpot(
        w.map,
        rng,
        entryX,
        entryY,
        TUNING.staff.spawnMinDistance,
        postNumbers(post.post).radius,
      );
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

  // Мебель по слотам планировки: рука дизайнера в самой комнате, а
  // случайность — внутри слота. Одна и та же планировка не должна
  // играться дважды одинаково, но и не должна играться как попало.
  const template = TEMPLATES_BY_ID.get(room.template);
  if (template !== undefined && template.cover.length > 0) {
    for (const slot of template.cover) {
      if (slot.chance !== undefined && rng.float() >= slot.chance) continue;
      const radius = propNumbers(slot.kind).radius;
      const spot = coverSpot(w.map, rng, slot, radius, entryX, entryY);
      if (spot === null) continue;
      spawnProp(w, slot.kind, spot.x, spot.y);
    }
    return;
  }

  for (const spec of PROPS) {
    for (let i = 0; i < spec.scatter; i++) {
      // Мебели отступ от входа нужен свой, куда меньший, чем штату:
      // иначе поднять при входе будет нечего, захват до неё не достанет.
      const spot = findSpawnSpot(
        w.map,
        rng,
        entryX,
        entryY,
        TUNING.prop.spawnClearance,
        propNumbers(spec.id).radius,
      );
      spawnProp(w, spec.id, spot.x, spot.y);
    }
  }
}

function quotaFor(count: number): number {
  return Math.max(1, Math.round(count * TUNING.floor.staffScale));
}

/**
 * Свободная точка подальше от входа, куда влезает тело заданного радиуса.
 * Проверять одну клетку мало: половина клетки — 16 пикселей, и всё, что
 * толще, торчит в соседнюю. Так Заведующий и шкаф оказывались в бетоне.
 */
function findSpawnSpot(
  map: TileMap,
  rng: ReturnType<typeof makeRng>,
  awayX: number,
  awayY: number,
  clearance: number,
  radius: number,
): { x: number; y: number } {
  let fallback: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < TUNING.floor.spawnAttempts; attempt++) {
    const cx = TUNING.room.wall + rng.int(TUNING.room.cols);
    const cy = TUNING.room.wall + rng.int(TUNING.room.rows);
    const x = (cx + 0.5) * map.size;
    const y = (cy + 0.5) * map.size;
    if (!bodyFits(map, x, y, radius)) continue;
    if (fallback === null) fallback = { x, y };
    if (Math.hypot(x - awayX, y - awayY) >= clearance) return { x, y };
  }
  return fallback ?? roomCenter(map);
}

/** Влезает ли тело радиуса radius целиком на свободные клетки. */
function bodyFits(map: TileMap, x: number, y: number, radius: number): boolean {
  const left = Math.floor((x - radius) / map.size);
  const right = Math.floor((x + radius) / map.size);
  const top = Math.floor((y - radius) / map.size);
  const bottom = Math.floor((y + radius) / map.size);
  for (let cy = top; cy <= bottom; cy++) {
    for (let cx = left; cx <= right; cx++) {
      if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return false;
      if (map.tiles[cy * map.cols + cx] !== TILE_FLOOR) return false;
    }
  }
  return true;
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
    w.chiefC.delete(e);
    w.courierC.delete(e);
    w.propC.delete(e);
    w.stashC.delete(e);
    w.ticketC.delete(e);
    w.counterC.delete(e);
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
