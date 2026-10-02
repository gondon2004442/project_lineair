/** Сборка этажа и вход в помещение. Всё случайное — из seeded PRNG. */
import { destroyEntity, type World, componentStores } from './ecs';
import { POST_COURIER, POST_ARCHIVIST, POST_KEEPER } from './data/posts';
import { MINI_BOSS_POSTS, STAFFING_BY_ID, type StaffPost } from './data/staffing';
import { DEEPEST, floorAt } from './data/floors';
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
  liftOpen,
  openLift,
} from './room';
import { ITEMS, type Item } from './data/items';
import { PROPS, PROPS_BY_ID } from './data/props';
import {
  ROOM_TEMPLATES,
  TEMPLATES_BY_ID,
  TEMPLATE_END,
  TEMPLATE_START,
  type CoverSlot,
  type Scene,
} from './data/roomTemplates';
import { WEAPON_FORMS } from './data/weaponForms';
import { SUBJECT_START, subjectAt, walledAt } from './data/subjects';
import { ENDINGS } from './data/endings';
import { ammoMax, reserveMax } from './weapon';
import { COUNTERS, type CounterSpec } from './data/counters';
import { FIXTURES_BY_ID } from './data/fixtures';
import { spillAt } from './systems/fixtures';
import {
  postNumbers,
  propNumbers,
  spawnClerk,
  spawnCounter,
  spawnFixture,
  spawnPlayer,
  spawnProp,
  spawnStaff,
  spawnStash,
} from './spawn';
import { TUNING } from './tuning';

export function createWorld(seed: number, input: InputSnapshot): World {
  const rng = makeRng(seed);
  const floor = generateFloor(rng, -1);
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
      cloudTime: 0,
      cloudX: 0,
      cloudY: 0,
      shotTime: 0,
      shotX: 0,
      shotY: 0,
    },
    sounds: [],
    status: 'playing',
    scene: 'lobby',
    player: -1,
    roster: [],
    build: [],
    tool: { id: '', cooldown: 0, charges: -1 },
    blanks: TUNING.blank.refillTo,
    passes: TUNING.stash.passesStart,
    reward: { chance: TUNING.reward.base, dry: 0, lastItem: '', lastOrder: '', lastWeight: 1 },
    record: { penalty: 0, service: 0, broken: 0, roomClean: true, controlHere: 0 },
    depth: -1,
    seals: [],
    subject: SUBJECT_START,
    freed: [],
    unlocked: [SUBJECT_START],
    filed: [],
    precedents: [],
    forms: WEAPON_FORMS.map(() => true),
    tickets: 0,
    listed: false,
    evacPlan: false,
    rebuildIn: 0,
    rebuilds: 0,
    sections: [],
    commendations: 0,
    runEnded: '',
    verdict: '',
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
    archivistC: new Map(),
    keeperC: new Map(),
    commissionC: new Map(),
    courierC: new Map(),
    propC: new Map(),
    railC: new Map(),
    stashC: new Map(),
    ticketC: new Map(),
    counterC: new Map(),
    clerkC: new Map(),
    fixtureC: new Map(),
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
  // Кем играют — решается в вестибюле, а здесь только раскладывается:
  // освобождённые прошлого забега не переезжают, формы выдаются по
  // наряду. Колесо Картографа короче не из-за числа, а из-за того, что
  // остальные формы ему ещё не выписаны.
  w.freed = [];
  const subject = subjectAt(w.subject);
  w.forms = WEAPON_FORMS.map((f) => subject.forms.includes(f.id));
  // Табельная точная одиночная есть у всякого: без неё забег начинался
  // бы без оружия вовсе, если наряд выписан неверно.
  if (!w.forms.some((f) => f)) w.forms[0] = true;
  const player = w.playerC.get(w.player);
  if (player !== undefined) player.form = w.forms.findIndex((f) => f);
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
  w.verdict = '';
  w.depth = -1;
  // Печати аннулируются вместе с допуском: подписывать спуск заново.
  w.seals = [];
  w.record.penalty = 0;
  w.record.service = 0;
  w.record.broken = 0;
  w.record.roomClean = true;
  restorePlayer(w);
  enterRoom(w, w.floor.start, null);
}

/**
 * Спуск на следующий уровень. Этаж собирается заново от своей посевной,
 * участки сбрасываются — а субъект едет как есть: дело, талоны,
 * здоровье, инвентарь, взыскание и выслуга. Поэтому глубина и страшна:
 * то, чем ты кончил один этаж, и есть то, чем ты начинаешь следующий.
 *
 * Бланки и допуски добираются до минимума, как и на входе в забег:
 * сэкономленное не копится, потраченное возвращается.
 */
export function descend(w: World): void {
  w.depth -= 1;
  // Своя посевная у каждого уровня: иначе второй этаж повторял бы
  // первый на той же посевной.
  const rng = makeRng((w.seed + Math.abs(w.depth) * TUNING.floor.depthSeedStride) >>> 0);
  w.floor = generateFloor(rng, w.depth);
  w.listed = false;
  w.evacPlan = false;
  w.note = [];
  w.noteSlot = -1;
  w.blanks = Math.max(w.blanks, TUNING.blank.refillTo);
  w.passes = Math.max(w.passes, TUNING.stash.passesStart);
  w.record.roomClean = true;
  w.status = 'playing';
  enterRoom(w, w.floor.start, null);
}

/** Есть ли куда спускаться дальше или этот уровень последний. */
export function deeperExists(w: World): boolean {
  return w.depth > DEEPEST;
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
  // Отсчёт перестройки начинается заново в каждом помещении.
  w.rebuildIn = 0;
  w.rebuilds = 0;

  const spot = fromDir === null ? roomCenter(w.map) : entryPosition(w.map, fromDir);
  placePlayer(w, spot.x, spot.y);
  buildRoster(w, room);
  scatterProps(w, room, spot.x, spot.y);
  placeStash(w, room, spot.x, spot.y);
  placeCounter(w, room, spot.x, spot.y);
  placeFixtures(w, room, spot.x, spot.y);
  placeRails(w, room);
  placeEvacPlan(w, room, spot.x, spot.y);
  placeWalled(w, room, spot.x, spot.y);
  placeForm(w, room, spot.x, spot.y);
  placeVerdict(w, room);
  placeSections(w, room);
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
 * ПЕРЕСТРОЙКА. Помещение меняет планировку, не меняя дверей.
 *
 * Переезжает мебель и встают по-новому стены; штат, добыча, стойки,
 * оборудование и талоны остаются — это уже след забега, а не планировка.
 * Тела выталкивает из нового бетона, а не защемляет в нём: застрявший
 * сотрудник читался бы как поломка, а не как приём.
 *
 * Двери те же, потому что участок остаётся тем же участком: перестройка
 * меняет комнату, а не этаж.
 */
export function rebuildRoom(w: World): void {
  const room = w.floor.rooms[w.room];
  if (room === undefined) return;
  const cfg = TUNING.rebuild;
  w.rebuilds += 1;

  // Новая планировка из пула уровня. Своя посевная и номер перестройки:
  // одно и то же помещение на одной посевной перестраивается одинаково.
  const rng = makeRng((w.seed + room.index * cfg.seedStride + w.rebuilds) >>> 0);
  const allowed = floorAt(w.depth).templates;
  const pool = ROOM_TEMPLATES.filter(
    (t) =>
      t.id !== TEMPLATE_END &&
      t.id !== TEMPLATE_START &&
      t.weight > 0 &&
      (allowed.length === 0 || allowed.includes(t.id)),
  );
  const pick = pool[rng.int(Math.max(1, pool.length))];
  if (pick === undefined) return;

  // Мебель переезжает: старую снимаем целиком, вместе с рельсами.
  const player = w.playerC.get(w.player);
  if (player !== undefined) player.held = -1;
  for (const [e] of [...w.propC]) {
    w.propC.delete(e);
    w.railC.delete(e);
    destroyEntity(w, e);
  }

  const locked = w.map.doorsLocked;
  const lift = liftOpen(w.map);
  w.map = buildRoomMap(pick.id, roomDoors(room));
  w.map.doorsLocked = locked;
  if (lift) openLift(w.map);
  w.mapToken += 1;

  // Мебель новой планировки. Точка отсчёта — середина: входа сейчас нет,
  // а отступ от входа в перестройке и не нужен.
  const centre = roomCenter(w.map);
  scatterPropsFor(w, room, pick.id, centre.x, centre.y);
  placeRails(w, room);
  ejectBodies(w);

  w.fx.shake = Math.min(TUNING.feel.shakeMax, w.fx.shake + cfg.shake);
  w.sounds.push('glass');
}

/**
 * Вытолкнуть все тела из бетона. Ищем по расходящемуся кольцу вокруг
 * того места, где тело оказалось: так сотрудник выходит из стены в ту
 * сторону, где стоял, а не улетает через всю комнату.
 */
function ejectBodies(w: World): void {
  const tile = TUNING.room.tile;
  for (const e of w.alive) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;
    if (bodyFits(w.map, t.x, t.y, b.radius)) continue;

    let moved = false;
    for (let ring = 1; ring <= TUNING.room.cols && !moved; ring++) {
      for (let a = 0; a < 12 && !moved; a++) {
        const angle = (a / 12) * Math.PI * 2;
        const x = t.x + Math.cos(angle) * ring * tile;
        const y = t.y + Math.sin(angle) * ring * tile;
        if (!bodyFits(w.map, x, y, b.radius)) continue;
        t.x = x;
        t.y = y;
        moved = true;
      }
    }
    // Кольцо не помогло: обходим все клетки помещения. Такое случается
    // с крупной мебелью в узкой планировке — столу шириной в полторы
    // клетки в коридоре может быть некуда встать вовсе.
    if (!moved) moved = toAnyFreeCell(w, t, b.radius);
    // И некуда — значит, этой мебели после перестройки просто нет.
    // Сотрудника и субъекта бросать в бетоне нельзя, их ставим в
    // середину: она свободна по правилу планировок.
    if (!moved) {
      if (w.propC.has(e)) {
        w.propC.delete(e);
        w.railC.delete(e);
        destroyEntity(w, e);
        continue;
      }
      const centre = roomCenter(w.map);
      t.x = centre.x;
      t.y = centre.y;
    }
    t.px = t.x;
    t.py = t.y;
    b.vx = 0;
    b.vy = 0;
  }
}

/**
 * Секции освещения щитовой. Ставятся по углам и в середине: субъекту
 * надо бегать между ними, иначе гонка за светом превращается в стояние
 * на одном месте.
 *
 * Зажжены с самого начала — гасит их Смотритель, и это его работа, а не
 * стартовое условие.
 */
function placeSections(w: World, room: RoomNode): void {
  w.sections = [];
  if (STAFFING_BY_ID.get(room.staffing)?.posts.some((p) => p.post === POST_KEEPER) !== true) return;
  const cfg = TUNING.keeper;
  const tile = TUNING.room.tile;
  const wall = TUNING.room.wall;
  const inset = Math.max(1, Math.round(cfg.sectionInset));
  const left = (wall + inset + 0.5) * tile;
  const right = (wall + TUNING.room.cols - inset - 0.5) * tile;
  const top = (wall + inset + 0.5) * tile;
  const bottom = (wall + TUNING.room.rows - inset - 0.5) * tile;
  const centre = roomCenter(w.map);
  const spots = [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: centre.x, y: centre.y },
  ];
  const want = Math.max(1, Math.round(cfg.sections));
  for (let i = 0; i < want; i++) {
    const at = spots[i % spots.length];
    if (at === undefined) continue;
    w.sections.push({ x: at.x, y: at.y, lit: true, charge: 0 });
  }
}

/** Любая свободная клетка помещения, начиная от середины наружу. */
function toAnyFreeCell(w: World, t: { x: number; y: number }, radius: number): boolean {
  const tile = TUNING.room.tile;
  const wall = TUNING.room.wall;
  for (let row = 0; row < TUNING.room.rows; row++) {
    for (let col = 0; col < TUNING.room.cols; col++) {
      const x = (wall + col + 0.5) * tile;
      const y = (wall + row + 0.5) * tile;
      if (!bodyFits(w.map, x, y, radius)) continue;
      t.x = x;
      t.y = y;
      return true;
    }
  }
  return false;
}

/**
 * Поставить шкафы участка на рельсы. Только там, где этаж этого просит:
 * на участке перестановка — это искажение архива, а не свойство мебели.
 *
 * Направление своё у каждого шкафа и считается от номера участка, а не
 * от порядка обхода: вернувшись, застанешь ту же перестановку.
 */
function placeRails(w: World, room: RoomNode): void {
  if (floorAt(w.depth).distortion !== 'shuffle') return;
  const cfg = TUNING.rail;
  const rng = makeRng((w.seed + room.index * cfg.seedStride) >>> 0);

  for (const [e, prop] of w.propC) {
    if (PROPS_BY_ID.get(prop.kind)?.railed !== true) continue;
    // Бросок делается всегда: поток не должен зависеть от того, сколько
    // шкафов уцелело к этому моменту.
    const roll = rng.float();
    const axis = rng.float();
    if (roll >= cfg.share) continue;
    const along = axis < 0.5;
    w.railC.set(e, {
      dirX: along ? (axis < 0.25 ? -1 : 1) : 0,
      dirY: along ? 0 : axis < 0.75 ? -1 : 1,
      speed: cfg.speed,
    });
  }
}

/**
 * План эвакуации: один на этаж, на случайном рядовом участке. Берётся
 * даром — это не добыча, а починка схемы, и платить за то, чтобы
 * интерфейс перестал врать, игрок не должен.
 */
function placeEvacPlan(w: World, room: RoomNode, entryX: number, entryY: number): void {
  if (floorAt(w.depth).distortion !== 'shuffle') return;
  if (w.evacPlan || room.index !== evacRoom(w)) return;
  const cfg = TUNING.stash;
  const rng = makeRng((w.seed + room.index * cfg.seedStride + 7) >>> 0);
  const spot = findSpawnSpot(w.map, rng, entryX, entryY, cfg.clearance, cfg.cellRadius);
  spawnStash(w, 'evac', '', 'ПЛАН ЭВАКУАЦИИ', spot.x, spot.y);
}

/** На каком участке этажа лежит план. Считается от посевной, не хранится. */
function evacRoom(w: World): number {
  const rng = makeRng((w.seed + Math.abs(w.depth) * TUNING.rail.seedStride) >>> 0);
  const pool = w.floor.rooms
    .filter((r) => r.kind !== 'start' && r.index !== w.floor.end && !r.corridor)
    .map((r) => r.index);
  if (pool.length === 0) return -1;
  return pool[rng.int(pool.length)] ?? -1;
}

/**
 * ЗАМУРОВАННЫЙ. Сотрудник, которого здание не оформило ни на одну
 * должность и потому не выпускает.
 *
 * Лежит он на своём уровне и только там: Картограф в архиве, Электрик в
 * узле. Попадается с шансом — то есть не каждый забег, — и ровно на
 * одном участке, который считается от посевной, а не хранится.
 */
function placeWalled(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const spec = walledAt(w.depth);
  if (spec === undefined || w.freed.includes(spec.id)) return;
  const cfg = TUNING.walled;
  const rng = makeRng((w.seed + Math.abs(w.depth) * cfg.seedStride) >>> 0);
  // Бросок делается всегда и до выбора участка: иначе шанс зависел бы
  // от того, в каком порядке обходят этаж.
  const wanted = rng.float() < cfg.chance;
  const pool = w.floor.rooms
    .filter((r) => r.kind !== 'start' && r.index !== w.floor.end && !r.corridor)
    .map((r) => r.index);
  const where = pool.length === 0 ? -1 : (pool[rng.int(pool.length)] ?? -1);
  if (!wanted || where !== room.index) return;
  const spot = findSpawnSpot(w.map, rng, entryX, entryY, TUNING.stash.clearance, cfg.radius);
  spawnStash(w, 'walled', spec.id, `ЗАМУРОВАННЫЙ · ${spec.title}`, spot.x, spot.y);
}

/**
 * ФИНАЛ. Три исхода в приёмной центрального архива.
 *
 * Боя здесь нет: уровень без ставок, и кончается он не зачисткой, а
 * решением. Стойки стоят в ряд, подписаны и ничего не стоят — платить
 * за собственное дело не надо, его надо выбрать.
 */
function placeVerdict(w: World, room: RoomNode): void {
  if (floorAt(w.depth).verdict !== true || room.index !== w.floor.end) return;
  const centre = roomCenter(w.map);
  const gap = TUNING.stash.deskGap;
  ENDINGS.forEach((ending, i) => {
    const x = centre.x + (i - (ENDINGS.length - 1) / 2) * gap;
    spawnStash(w, 'verdict', ending.id, `${ending.code} · ${ending.title}`, x, centre.y);
  });
}

/**
 * ИНСТРУМЕНТ, ВЫДАННЫЙ ПО ОПИСИ. Форма оружия как находка.
 *
 * Забег начинается с того, что выписано наряду, а прочие формы лежат на
 * этажах — по одной на уровень и с шансом. Отсюда прогрессия внутри
 * забега: ранние этажи и правда другие, а не те же с другим числом
 * здоровья.
 *
 * Циркулярная сюда не попадает никогда: её берут с Заведующего, и в
 * этом её смысл.
 */
function placeForm(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const cfg = TUNING.form;
  const pool = WEAPON_FORMS.map((f, i) => ({ f, i })).filter(
    ({ f, i }) => w.forms[i] !== true && f.id !== 'circular',
  );
  if (pool.length === 0) return;
  const rng = makeRng((w.seed + Math.abs(w.depth) * cfg.seedStride) >>> 0);
  // Броски делаются всегда и до выбора участка: иначе и шанс, и находка
  // зависели бы от того, в каком порядке обходят этаж.
  const wanted = rng.float() < cfg.chance;
  const rooms = w.floor.rooms
    .filter((r) => r.kind !== 'start' && r.index !== w.floor.end && !r.corridor)
    .map((r) => r.index);
  const where = rooms.length === 0 ? -1 : (rooms[rng.int(rooms.length)] ?? -1);
  const pick = pool[rng.int(pool.length)];
  if (!wanted || where !== room.index || pick === undefined) return;
  const spot = findSpawnSpot(w.map, rng, entryX, entryY, TUNING.stash.clearance, cfg.radius);
  spawnStash(w, 'form', pick.f.id, `${pick.f.code} · ${pick.f.title}`, spot.x, spot.y);
}

/**
 * Какая сцена досталась участку. Считается от seed и номера участка,
 * а не хранится: расстановка не должна зависеть от того, в каком
 * порядке игрок обходит этаж. Свой поток случайности — чтобы добавленная
 * сцена не сдвинула мебель на той же посевной.
 */
function sceneFor(w: World, room: RoomNode): Scene | undefined {
  const scenes = TEMPLATES_BY_ID.get(room.template)?.scenes;
  if (scenes === undefined || scenes.length === 0) return undefined;
  const rng = makeRng((w.seed + room.index * TUNING.floor.sceneSeedStride) >>> 0);
  return scenes[rng.int(scenes.length)];
}

/**
 * Сцена: три-четыре предмета в осмысленном расположении поверх слотов
 * планировки. Ставится по точным клеткам и без разброса — в этом весь
 * смысл: стул отодвинут именно от этого стола, а не где-то рядом.
 *
 * Не встало — и ладно: сцена необязательна, а ронять из-за неё участок
 * нельзя. Отступ от входа тот же, что у мебели.
 */
function placeScene(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const scene = sceneFor(w, room);
  if (scene === undefined) return;
  const tile = TUNING.room.tile;
  const wall = TUNING.room.wall;
  const clear = TUNING.prop.spawnClearance;

  for (const slot of scene.cover ?? []) {
    const count = Math.max(1, Math.round(slot.repeat?.count ?? 1));
    for (let i = 0; i < count; i++) {
      const col = slot.col + (slot.repeat?.stepCol ?? 0) * i;
      const row = slot.row + (slot.repeat?.stepRow ?? 0) * i;
      const x = (wall + col + 0.5) * tile;
      const y = (wall + row + 0.5) * tile;
      const radius = propNumbers(slot.kind).radius;
      if (!bodyFits(w.map, x, y, radius)) continue;
      if (Math.hypot(x - entryX, y - entryY) < clear) continue;
      spawnProp(w, slot.kind, x, y);
    }
  }
}

/**
 * Оборудование сцены. Опрокинутое ставится следом, без тела: удара не
 * было, а беспорядок уже есть.
 */
function placeSceneFixtures(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const scene = sceneFor(w, room);
  if (scene === undefined) return;
  const cfg = TUNING.fixture;

  for (const slot of scene.fixtures ?? []) {
    const spec = FIXTURES_BY_ID.get(slot.kind);
    if (spec === undefined) continue;
    const x = (TUNING.room.wall + slot.col + 0.5) * TUNING.room.tile;
    const y = (TUNING.room.wall + slot.row + 0.5) * TUNING.room.tile;
    if (!bodyFits(w.map, x, y, spec.radius)) continue;
    if (!onOpenFloor(w.map, x, y, spec.radius)) continue;
    if (Math.hypot(x - entryX, y - entryY) < cfg.clearance) continue;
    if (slot.toppled === undefined) {
      spawnFixture(w, spec, x, y);
      continue;
    }
    const len = Math.hypot(slot.toppled.x, slot.toppled.y);
    spillAt(w, spec.id, x, y, len > 0 ? slot.toppled.x / len : 1, len > 0 ? slot.toppled.y / len : 0);
  }
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
  // В центральном архиве комнаты и ЕСТЬ дела: там чужое дело лежит в
  // каждой, а не с шансом. Бросок всё равно делается — поток случайности
  // не должен зависеть от уровня.
  const wantCase = caseRng.float() < TUNING.archive.chance || floorAt(w.depth).verdict === true;
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

  // Особая выдача: крайняя ячейка справа, платят за неё благодарностью.
  const special = centre.x + ((cells + 1) - (cells - 1) / 2 - 1) * cfg.deskGap;
  spawnStash(w, 'special', '', 'ОСОБАЯ ВЫДАЧА', special, centre.y);

  // Прилавок: второй ряд перед ячейками. Стол выдачи на этаже один,
  // поэтому каждая позиция достаётся за забег ровно раз — ассортимент
  // ограничен не счётчиком, а самой раскладкой.
  const services: { kind: 'pass' | 'blank' | 'ammo' | 'heal'; title: string }[] = [
    { kind: 'pass', title: 'ДОПУСК' },
    { kind: 'blank', title: 'БЛАНК' },
    { kind: 'ammo', title: 'ПОДАЧА' },
    { kind: 'heal', title: 'ОСВИДЕТЕЛЬСТВОВАНИЕ' },
  ];
  services.forEach((service, i) => {
    const x = centre.x + (i - (services.length - 1) / 2) * cfg.deskGap;
    spawnStash(w, service.kind, '', service.title, x, centre.y + TUNING.clerk.deskRow);
  });

  // Кладовщик стоит позади ряда: к столу подходят, а не натыкаются.
  spawnClerk(w, centre.x, centre.y - TUNING.clerk.standBack);
}

/**
 * Оборудование участка. Слоты берутся из шаблона, разброс — свой поток
 * случайности: добавление кулера не должно сдвигать мебель на том же
 * seed. Клетка под стеной пропускается: оборудование стоит в помещении.
 */
function placeFixtures(w: World, room: RoomNode, entryX: number, entryY: number): void {
  const template = TEMPLATES_BY_ID.get(room.template);
  const slots = template?.fixtures ?? [];
  const cfg = TUNING.fixture;
  const rng = makeRng((w.seed + room.index * cfg.seedStride) >>> 0);

  for (const slot of slots) {
    const count = Math.max(1, Math.round(slot.repeat?.count ?? 1));
    for (let i = 0; i < count; i++) {
      // Бросок делается всегда: поток не должен зависеть от того,
      // занят слот или пропущен.
      const roll = rng.float();
      const jx = slot.jitter > 0 ? rng.range(-slot.jitter, slot.jitter) : 0;
      const jy = slot.jitter > 0 ? rng.range(-slot.jitter, slot.jitter) : 0;
      if (slot.chance !== undefined && roll >= slot.chance) continue;
      const spec = FIXTURES_BY_ID.get(slot.kind);
      if (spec === undefined) continue;

      const col = slot.col + (slot.repeat?.stepCol ?? 0) * i + jx;
      const row = slot.row + (slot.repeat?.stepRow ?? 0) * i + jy;
      const x = (TUNING.room.wall + col + 0.5) * TUNING.room.tile;
      const y = (TUNING.room.wall + row + 0.5) * TUNING.room.tile;
      if (!bodyFits(w.map, x, y, spec.radius)) continue;
      // В проёме оборудование не ставим: bodyFits считает незапертую
      // дверь проходимой, и кулер оказывался ровно в дверях.
      if (!onOpenFloor(w.map, x, y, spec.radius)) continue;
      // Вплотную к входу не ставим: шагнул в участок и сразу уронил.
      if (Math.hypot(x - entryX, y - entryY) < cfg.clearance) continue;
      spawnFixture(w, spec, x, y);
    }
  }
  placeSceneFixtures(w, room, entryX, entryY);
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
  // Стойка не должна встать вплотную к добыче: два приглашения в одной
  // точке спорят за F, и шкаф оказывается недоступен.
  let spot = findSpawnSpot(w.map, rng, entryX, entryY, cfg.clearance, cfg.radius);
  for (let attempt = 0; attempt < TUNING.floor.spawnAttempts && crowded(w, spot); attempt++) {
    spot = findSpawnSpot(w.map, rng, entryX, entryY, cfg.clearance, cfg.radius);
  }
  spawnCounter(w, spec, spot.x, spot.y);
}

/** Занято ли место рядом добычей или кладовщиком. */
function crowded(w: World, spot: { x: number; y: number }): boolean {
  const gap = TUNING.counter.radius + TUNING.stash.safeRadius;
  for (const [e] of w.stashC) {
    const t = w.transform.get(e);
    if (t === undefined) continue;
    if (Math.hypot(t.x - spot.x, t.y - spot.y) < gap) return true;
  }
  for (const [e] of w.clerkC) {
    const t = w.transform.get(e);
    if (t === undefined) continue;
    if (Math.hypot(t.x - spot.x, t.y - spot.y) < gap) return true;
  }
  return false;
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
    // Начальник на этаже один, сколько бы глубина ни множила штат: двое
    // заведующих в одной приёмной — это не трудный бой, а поломка.
    // Признак — нулевой приоритет: его закрывают первым и он один.
    const single = post.priority <= 0;
    w.roster.push({
      post: post.post,
      title: post.title,
      priority: post.priority,
      quota: single ? post.count : quotaFor(w, post.count),
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
    // Одиночная ставка: мини-босс, курьер и начальник этажа. Множитель
    // глубины их не касается — двое заведующих в одной приёмной это не
    // трудный бой, а поломка. Признак начальника — нулевой приоритет.
    const single = post.post === room.miniBoss || post.post === POST_COURIER || post.priority <= 0;
    const quota = single ? post.count : quotaFor(w, post.count);
    for (let i = 0; i < quota; i++) {
      // Архивариус садится ровно в середину: он не ходит, а вокруг него
      // кольцо стеллажей радиусом в четыре клетки. В углу половина
      // кольца оказалась бы в стене.
      const spot =
        post.post === POST_ARCHIVIST
          ? roomCenter(w.map)
          : findSpawnSpot(
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
  scatterPropsFor(w, room, room.template, entryX, entryY);
}

/**
 * Мебель под названную планировку. Обычно это планировка самого участка,
 * но перестройка подставляет другую, не трогая узел этажа.
 */
function scatterPropsFor(
  w: World,
  room: RoomNode,
  templateId: string,
  entryX: number,
  entryY: number,
): void {
  if (room.kind === 'start') return;
  // Номер перестройки входит в посевную: иначе новая планировка
  // раскладывала бы мебель по тем же местам, что и прошлая.
  const rng = makeRng(
    (w.seed + room.index * TUNING.floor.propSeedStride + w.rebuilds * TUNING.rebuild.seedStride) >>> 0,
  );

  // Мебель по слотам планировки: рука дизайнера в самой комнате, а
  // случайность — внутри слота. Одна и та же планировка не должна
  // играться дважды одинаково, но и не должна играться как попало.
  const template = TEMPLATES_BY_ID.get(templateId);
  if (template !== undefined && template.cover.length > 0) {
    for (const slot of template.cover) {
      const count = Math.max(1, Math.round(slot.repeat?.count ?? 1));
      const stepCol = slot.repeat?.stepCol ?? 0;
      const stepRow = slot.repeat?.stepRow ?? 0;
      for (let i = 0; i < count; i++) {
        // Бросок делается всегда, даже когда слот пропускается: поток
        // случайности не должен зависеть от того, занят слот или нет.
        const roll = rng.float();
        if (slot.chance !== undefined && roll >= slot.chance) continue;
        const radius = propNumbers(slot.kind).radius;
        const at = { ...slot, col: slot.col + stepCol * i, row: slot.row + stepRow * i };
        const spot = coverSpot(w.map, rng, at, radius, entryX, entryY);
        if (spot === null) continue;
        spawnProp(w, slot.kind, spot.x, spot.y);
      }
    }
    placeScene(w, room, entryX, entryY);
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

/**
 * Сколько ставок держит участок. Глубина имеет право голоса: архив злее
 * участка не тем, что у сотрудников больше здоровья, а тем, что их
 * больше.
 */
function quotaFor(w: World, count: number): number {
  const scale = TUNING.floor.staffScale * floorAt(w.depth).staffScale;
  return Math.max(1, Math.round(count * scale));
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

/**
 * Стоит ли тело целиком на полу. Отдельно от bodyFits: тот считает
 * проходимой и незапертую дверь, а оборудованию в дверях не место.
 */
function onOpenFloor(map: TileMap, x: number, y: number, radius: number): boolean {
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
  // Хранилища перечисляет ecs одним списком: пока их перечисляли здесь
  // и в flushDoomed порознь, списки разъезжались, и часть компонентов
  // при смерти не удалялась вовсе.
  const stores = componentStores(w);
  for (const e of [...w.alive]) {
    if (e === w.player) continue;
    w.alive.delete(e);
    for (const store of stores) store.delete(e);
  }
  w.doomed.length = 0;
}

export function currentRoom(w: World): RoomNode | undefined {
  return w.floor.rooms[w.room];
}

export function clearedCount(w: World): number {
  return w.floor.rooms.reduce((sum, room) => sum + (room.cleared ? 1 : 0), 0);
}
