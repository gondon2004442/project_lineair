/**
 * ПОМЕЩЕНИЕ ЭТАЖА. Оболочка и обстановка для всех участков, кроме
 * вестибюля. Сетка симуляции та же; меняется то, чем являются клетки:
 *
 *   стены по краю — стены этажа с окнами, где тема их знает;
 *   проёмы — двери с наличником, перемычкой и коридором за ними;
 *   крупные массы — стены соседних кабинетов с дверями и портретами;
 *   мелкие блоки — мебель и машины по теме и назначению помещения;
 *   разрушаемые клетки — стекло, перегородки машбюро, рабица;
 *   слоты антуража — часы, доски, портреты, светильники.
 *
 * Свет задаёт тема: солнце в окна, потолочные панели, мягкая тень сверху
 * или конусы ламп в темноте.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RectAreaLight,
  SpotLight,
  TorusGeometry,
  Vector3,
  type Material,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import type { World } from '../ecs';
import { TILE_DOOR, TILE_GATE, TILE_WALL, TILE_WEAK, type TileMap } from '../room';
import { roomNumber } from '../floor';
import { currentRoom } from '../world';
import { DECOR_BY_ID } from '../data/decor';
import { TEMPLATES_BY_ID } from '../data/roomTemplates';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { beamMaterial } from './beam';
import { GeoBuilder } from './geo';
import { Kit } from './kit';
import { shadeAll } from './rig';
import { additive, type Materials } from './materials';
import {
  archive,
  board,
  buildClock,
  lockers,
  planter,
  propMats,
  reception,
  vitrine,
  waiting,
  type Ctx,
} from './furnish';
import {
  architecture,
  boilerUnit,
  buffetCounter,
  canteenTable,
  cageCell,
  cardCatalog,
  copier,
  cubicleCell,
  greyCabinets,
  monolith,
  pumpUnit,
  setMats,
  switchboard,
  type Rect,
} from './sets';
import { themeFor } from './themes';
import type { Lamp, RoomView } from './room';

const WALL_MOUNT_HEIGHT: Record<string, number> = {
  extinguisher: 0.75,
  panel: 1.35,
  tube: 1.6,
  clock: 2.35,
};

export function buildDressed(w: World, m: Materials): RoomView {
  const v = TUNING.view3d;
  const L = propMats();
  const S = setMats();
  const t = themeFor(w.depth, m, L);
  const map = w.map;
  const W = map.cols;
  const D = map.rows;
  const room = currentRoom(w);
  const template = room?.template ?? '';
  const group = new Group();
  const fx = new Group();
  const owned: { dispose(): void }[] = [];
  const aoHidden: Object3D[] = [];
  const ticks: ((time: number) => void)[] = [];
  const lamps: Lamp[] = [];
  const kit = new Kit(2);
  const rng = makeRng(((w.seed ^ 0x5eed) + (room?.index ?? 0) * 7919) >>> 0);
  const ctx: Ctx = { kit, m, L, rng, group, owned, ticks };
  // Ручка «высота стен» масштабирует тему, а не заменяет её.
  const H = t.height * (v.wallHeight / 3.4);
  const SOUTH = Math.max(0.25, v.southWallHeight);
  const DOOR_H = Math.min(H - 0.3, 2.35);

  const tile = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= D) return -1;
    return map.tiles[cy * W + cx] ?? -1;
  };
  const isBorder = (cx: number, cy: number): boolean => cx < 1 || cy < 1 || cx >= W - 1 || cy >= D - 1;
  const solid = (cx: number, cy: number): boolean => tile(cx, cy) === TILE_WALL;

  // --- Пол ------------------------------------------------------------------------
  const floorB = new GeoBuilder(4);
  for (let cy = 0; cy < D; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const tt = tile(cx, cy);
      // Под мебелью пол тоже есть: блок не всегда занят до края.
      if ((tt === TILE_WALL && isBorder(cx, cy)) || tt === TILE_GATE) continue;
      floorB.quad([cx, 0, cy], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    }
  }

  // --- Окна дальней стены -------------------------------------------------------------
  const WIN = 1.25;
  const SILL = 1.1;
  const HEAD = Math.min(H - 0.35, 2.85);
  const windows: number[] = [];

  /** Пролёты сплошной стены вдоль стороны: [начало, конец) по клеткам. */
  const runs = (count: number, isWall: (i: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= count; i++) {
      const wall = i < count && isWall(i);
      if (wall && start < 0) start = i;
      if (!wall && start >= 0) {
        out.push([start, i]);
        start = -1;
      }
    }
    return out;
  };

  // Дальняя стена: пролёты между проёмами, окна в пролётах.
  for (const [a, b] of runs(W, (x) => solid(x, 0))) {
    const u0 = Math.max(a, 1) + 0.9;
    const u1 = Math.min(b, W - 1) - 0.9;
    const here: number[] = [];
    if (t.windows && u1 - u0 > WIN * 2 + 0.5) {
      const n = Math.max(1, Math.floor((u1 - u0 + 2.6) / (WIN * 2 + 2.6)));
      const step = (u1 - u0) / n;
      for (let k = 0; k < n; k++) here.push(u0 + step * (k + 0.5));
    }
    let cursor = a;
    for (const c of here) {
      kit.box(t.wall, cursor, 0, 0, c - WIN, H, 1);
      kit.box(t.wall, c - WIN, 0, 0, c + WIN, SILL, 1);
      kit.box(t.wall, c - WIN, HEAD, 0, c + WIN, H, 1);
      cursor = c + WIN;
      windows.push(c);
    }
    kit.box(t.wall, cursor, 0, 0, b, H, 1);
    kit.box(t.cut, a, H, 0, b, H + 0.02, 1);
    const ia = Math.max(a, 1);
    const ib = Math.min(b, W - 1);
    if (ib > ia) {
      if (t.wainscot > 0) kit.box(t.clad, ia, 0, 1, ib, t.wainscot, 1.035);
      trim(ia, ib, 1.035, 'n');
    }
  }
  // Ближняя: низкий срез.
  for (const [a, b] of runs(W, (x) => solid(x, D - 1))) {
    kit.box(t.wall, a, 0, D - 1, b, SOUTH, D);
    kit.box(t.cut, a, SOUTH, D - 1, b, SOUTH + 0.02, D);
  }
  // Боковые.
  for (const [side, x0, x1, face] of [['w', 0, 1, 1], ['e', W - 1, W, W - 1]] as const) {
    const col = side === 'w' ? 0 : W - 1;
    for (const [a, b] of runs(D - 1, (z) => z >= 1 && solid(col, z))) {
      kit.box(t.wall, x0, 0, a, x1, H, b);
      kit.box(t.cut, x0, H, a, x1, H + 0.02, b);
      const s = side === 'w' ? 1 : -1;
      if (t.wainscot > 0) kit.box(t.clad, Math.min(face, face + 0.035 * s), 0, a, Math.max(face, face + 0.035 * s), t.wainscot, b);
      trim(a, b, face + 0.035 * s, side);
      if (t.pilasters) {
        for (let z = a + 3; z < b - 2; z += 5) {
          kit.box(t.wall, Math.min(face, face + 0.16 * s), 0, z - 0.32, Math.max(face, face + 0.16 * s), H, z + 0.32);
          if (t.wainscot > 0) kit.box(t.clad, Math.min(face, face + 0.19 * s), 0, z - 0.35, Math.max(face, face + 0.19 * s), Math.min(t.wainscot, H), z + 0.35);
        }
      }
    }
  }

  /** Профиль над цоколем: сталь в холле и картотеке, латунь в офисе. */
  function trim(a: number, b: number, at: number, side: 'n' | 'w' | 'e'): void {
    if (t.wainscot <= 0 || t.id === 'void' || t.id === 'boiler') return;
    const mat = t.id === 'office' ? L.brass : m.rail;
    const y0 = t.wainscot;
    const y1 = t.wainscot + 0.035;
    if (side === 'n') kit.box(mat, a, y0, 1, b, y1, at + 0.02);
    else if (side === 'w') kit.box(mat, 1, y0, a, at + 0.02, y1, b);
    else kit.box(mat, at - 0.02, y0, a, W - 1, y1, b);
  }

  for (const c of windows) buildWindow(c);

  function buildWindow(c: number): void {
    const x0 = c - WIN;
    const x1 = c + WIN;
    const fr = 0.05;
    const zf = 0.5;
    const frame = t.id === 'office' ? m.wood : m.darkMetal;
    kit.box(frame, x0, SILL, zf - 0.04, x1, SILL + fr, zf + 0.04);
    kit.box(frame, x0, HEAD - fr, zf - 0.04, x1, HEAD, zf + 0.04);
    kit.box(frame, x0, SILL, zf - 0.04, x0 + fr, HEAD, zf + 0.04);
    kit.box(frame, x1 - fr, SILL, zf - 0.04, x1, HEAD, zf + 0.04);
    kit.box(frame, c - fr / 2, SILL, zf - 0.04, c + fr / 2, HEAD, zf + 0.04);
    const transom = SILL + (HEAD - SILL) * 0.68;
    kit.box(frame, x0, transom - fr / 2, zf - 0.04, x1, transom + fr / 2, zf + 0.04);
    kit.box(kit.flat(L.frosted), x0 + fr, SILL + fr, zf - 0.01, x1 - fr, HEAD - fr, zf + 0.01);
    kit.box(t.id === 'office' ? m.wood : L.granite, x0 - 0.06, SILL - 0.05, 0.55, x1 + 0.06, SILL + 0.02, 1.12);
    // Батарея под окном.
    for (let x = c - 0.9; x <= c + 0.9; x += 0.085) kit.box(L.radiator, x, 0.2, 1.06, x + 0.05, 0.8, 1.2);
    kit.box(L.radiator, c - 0.92, 0.75, 1.1, c + 0.97, 0.8, 1.17);
    // Офис: жалюзи приспущены — солнце режется на полосы.
    if (t.id === 'office') {
      for (let y = HEAD - 0.1; y > transom + 0.05; y -= 0.07) kit.add(BOX1, m.paper, c, y, 0.62, WIN * 2 - 0.1, 0.008, 0.06, 0.6);
      kit.box(m.wood, x0, HEAD - 0.06, 0.55, x1, HEAD, 0.7);
    }
  }

  // --- Проёмы ---------------------------------------------------------------------------
  const doorRuns: { side: 0 | 1 | 2 | 3; a: number; b: number }[] = [];
  for (const [a, b] of runs(W, (x) => tile(x, 0) === TILE_DOOR)) doorRuns.push({ side: 0, a, b });
  for (const [a, b] of runs(W, (x) => tile(x, D - 1) === TILE_DOOR)) doorRuns.push({ side: 2, a, b });
  for (const [a, b] of runs(D, (z) => tile(0, z) === TILE_DOOR)) doorRuns.push({ side: 3, a, b });
  for (const [a, b] of runs(D, (z) => tile(W - 1, z) === TILE_DOOR)) doorRuns.push({ side: 1, a, b });

  for (const d of doorRuns) buildDoor(d.side, d.a, d.b);

  function buildDoor(side: 0 | 1 | 2 | 3, a: number, b: number): void {
    const south = side === 2;
    const h = south ? SOUTH : H;
    const jt = 0.09;
    const len = 3;
    if (side === 0) {
      kit.box(m.metal, a, 0, -0.05, a + jt, Math.min(h, DOOR_H), 1.05);
      kit.box(m.metal, b - jt, 0, -0.05, b, Math.min(h, DOOR_H), 1.05);
      kit.box(t.wall, a, DOOR_H, 0, b, H, 1);
      kit.box(t.cut, a, H, 0, b, H + 0.02, 1);
      kit.box(m.metal, a, DOOR_H - 0.06, 0.95, b, DOOR_H, 1.05);
      stub(a - 0.6, -len, b + 0.6, 0, 'z');
    } else if (side === 2) {
      kit.box(m.metal, a, 0, D - 1.05, a + jt, h + 0.05, D + 0.05);
      kit.box(m.metal, b - jt, 0, D - 1.05, b, h + 0.05, D + 0.05);
      stub(a - 0.6, D, b + 0.6, D + len, 'z');
    } else {
      const x0 = side === 3 ? 0 : W - 1;
      kit.box(m.metal, x0 - 0.05, 0, a, x0 + 1.05, Math.min(h, DOOR_H), a + jt);
      kit.box(m.metal, x0 - 0.05, 0, b - jt, x0 + 1.05, Math.min(h, DOOR_H), b);
      kit.box(t.wall, x0, DOOR_H, a, x0 + 1, H, b);
      kit.box(t.cut, x0, H, a, x0 + 1, H + 0.02, b);
      if (side === 3) stub(-len, a - 0.6, 0, b + 0.6, 'x');
      else stub(W, a - 0.6, W + len, b + 0.6, 'x');
    }
    if (map.doorsLocked) {
      const hh = south ? 0.55 : 1.15;
      const th = 0.12;
      if (side === 0 || side === 2) {
        const zc = side === 0 ? 0.5 : D - 0.5;
        kit.box(m.hazard, a + 0.05, 0, zc - th, b - 0.05, hh, zc + th);
      } else {
        const xc = side === 3 ? 0.5 : W - 0.5;
        kit.box(m.hazard, xc - th, 0, a + 0.05, xc + th, hh, b - 0.05);
      }
    } else {
      const s = 0.06;
      const y = 0.004;
      for (let i = 0; i < 2; i++) {
        const o = 0.15 + i * 0.16;
        if (side === 0) kit.box(kit.flat(m.paint), a, 0, 1 - o - s, b, y, 1 - o);
        else if (side === 2) kit.box(kit.flat(m.paint), a, 0, D - 1 + o, b, y, D - 1 + o + s);
        else if (side === 3) kit.box(kit.flat(m.paint), 1 - o - s, 0, a, 1 - o, y, b);
        else kit.box(kit.flat(m.paint), W - 1 + o, 0, a, W - 1 + o + s, y, b);
      }
    }
    sign(side, a, b);
  }

  /** Коридор за дверью: пол и стены на пару метров, дальше темнота. */
  function stub(x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z'): void {
    floorB.quad([x0, 0, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, 1, 0]);
    const h = Math.min(H, DOOR_H + 0.4);
    if (axis === 'z') {
      kit.box(t.wall, x0 - 0.3, 0, z0, x0, h, z1);
      kit.box(t.wall, x1, 0, z0, x1 + 0.3, h, z1);
      kit.box(t.cut, x0 - 0.3, h, z0, x0, h + 0.02, z1);
      kit.box(t.cut, x1, h, z0, x1 + 0.3, h + 0.02, z1);
    } else {
      kit.box(t.wall, x0, 0, z0 - 0.3, x1, h, z0);
      kit.box(t.wall, x0, 0, z1, x1, h, z1 + 0.3);
      kit.box(t.cut, x0, h, z0 - 0.3, x1, h + 0.02, z0);
      kit.box(t.cut, x0, h, z1, x1, h + 0.02, z1 + 0.3);
    }
  }

  /** Табличка с номером соседнего участка — у проёма, на лицевой стороне. */
  function sign(side: 0 | 1 | 2 | 3, _a: number, b: number): void {
    if (room === undefined) return;
    const next = w.floor.rooms[room.neighbors[side]];
    if (next === undefined) return;
    const text = roomNumber(next);
    const d = 0.05;
    const wText = text.length * 4 * d - d;
    const pw = wText + 0.16;
    const ph = 5 * d + 0.16;
    const y = 1.7;
    if (side === 0) {
      const x = b + 0.55;
      kit.box(m.paper, x - pw / 2, y, 1.0, x + pw / 2, y + ph, 1.04);
      textAt(text, x - wText / 2, y + ph - 0.08, 1.04, d, 'z', m.darkMetal);
    } else if (side === 1 || side === 3) {
      const x = side === 3 ? 1.0 : W - 1.0;
      const s = side === 3 ? 1 : -1;
      const z = b + 0.55;
      kit.box(m.paper, Math.min(x, x + 0.04 * s), y, z - pw / 2, Math.max(x, x + 0.04 * s), y + ph, z + pw / 2);
      textAt(text, z - wText / 2, y + ph - 0.08, x + 0.04 * s, d, side === 3 ? 'x+' : 'x-', m.darkMetal);
    }
  }

  // --- Лифт ------------------------------------------------------------------------------
  let gx0 = Infinity;
  let gx1 = -Infinity;
  let gz0 = Infinity;
  let gz1 = -Infinity;
  for (let cy = 1; cy < D - 1; cy++) {
    for (let cx = 1; cx < W - 1; cx++) {
      if (tile(cx, cy) !== TILE_GATE) continue;
      gx0 = Math.min(gx0, cx);
      gx1 = Math.max(gx1, cx + 1);
      gz0 = Math.min(gz0, cy);
      gz1 = Math.max(gz1, cy + 1);
    }
  }
  if (Number.isFinite(gx0)) buildLift(gx0, gz0, gx1, gz1);

  function buildLift(x0: number, z0: number, x1: number, z1: number): void {
    const depth = 3;
    kit.box(m.darkMetal, x0 - 0.02, -depth, z0, x0, 0, z1);
    kit.box(m.darkMetal, x1, -depth, z0, x1 + 0.02, 0, z1);
    kit.box(m.darkMetal, x0, -depth, z0 - 0.02, x1, 0, z0);
    kit.box(m.darkMetal, x0, -depth, z1, x1, 0, z1 + 0.02);
    kit.box(m.void, x0, -depth, z0, x1, -depth + 0.02, z1);
    // Кабина внизу, тросы, решётка поверх шахты.
    kit.box(m.metal, x0 + 0.1, -depth + 0.4, z0 + 0.1, x1 - 0.1, -depth + 0.5, z1 - 0.1);
    for (const x of [x0 + 0.5, x1 - 0.5]) kit.cyl(m.darkMetal, x, -depth + 0.5, (z0 + z1) / 2, 0.02, depth - 0.5);
    const step = TUNING.render.liftBarStep / TUNING.room.tile;
    for (let bx = x0 + step; bx < x1; bx += step) kit.box(m.metal, bx - 0.025, -0.06, z0, bx + 0.025, 0.02, z1);
    kit.box(m.metal, x0, -0.06, z0, x1, 0.02, z0 + 0.06);
    kit.box(m.metal, x0, -0.06, z1 - 0.06, x1, 0.02, z1);
    const e = 0.14;
    kit.box(kit.flat(m.paint), x0 - e, 0, z0 - e, x1 + e, 0.004, z0);
    kit.box(kit.flat(m.paint), x0 - e, 0, z1, x1 + e, 0.004, z1 + e);
    kit.box(kit.flat(m.paint), x0 - e, 0, z0, x0, 0.004, z1);
    kit.box(kit.flat(m.paint), x1, 0, z0, x1 + e, 0.004, z1);
    // Табло: куда поедет.
    const signed = w.seals.includes(w.depth);
    const text = signed ? String(w.depth - 1) : '--';
    const px = (x0 + x1) / 2;
    const pz = z0 - 0.35;
    kit.box(m.darkMetal, px - 0.05, 0, pz - 0.05, px + 0.05, 1.3, pz + 0.05);
    const d = 0.07;
    const wText = text.length * 4 * d - d;
    kit.box(m.darkMetal, px - wText / 2 - 0.1, 1.3, pz - 0.05, px + wText / 2 + 0.1, 1.3 + 5 * d + 0.2, pz + 0.05);
    textAt(text, px - wText / 2, 1.3 + 5 * d + 0.1, pz + 0.05, d, 'z', signed ? m.signLit : m.metal);
  }

  // --- Блоки планировки ---------------------------------------------------------------------
  const blocks = components(map, (cx, cy) => tile(cx, cy) === TILE_WALL && !isBorder(cx, cy));
  blocks.forEach((r, i) => furnish(r, i));

  function furnish(r: Rect, i: number): void {
    const wd = r.x1 - r.x0;
    const dp = r.z1 - r.z0;
    const big = wd * dp >= 18 || (Math.min(wd, dp) >= 3 && Math.max(wd, dp) >= 6);
    if (t.id === 'void') {
      monolith(ctx, r, i);
      return;
    }
    if (big) {
      const faces = {
        n: openAlong(r.x0, r.x1, r.z0 - 1, 'x'),
        s: openAlong(r.x0, r.x1, r.z1, 'x'),
        w: openAlong(r.z0, r.z1, r.x0 - 1, 'z'),
        e: openAlong(r.z0, r.z1, r.x1, 'z'),
      };
      architecture(ctx, r, t, faces, template === 'corridor');
      if (t.id === 'boiler') pipesOver(r);
      return;
    }
    if (t.id === 'boiler') {
      if (wd >= 3 || dp >= 3) boilerUnit(ctx, r, H);
      else pumpUnit(ctx, r, H);
      return;
    }
    if (template === 'atrium') {
      switchboard(ctx, r);
      return;
    }
    if (t.id === 'files') {
      greyCabinets(ctx, r);
      return;
    }
    if (t.id === 'office') {
      if (template === 'copy') copier(ctx, r);
      else if (template === 'cabinets') cardCatalog(ctx, r);
      else if (i % 3 === 0) cardCatalog(ctx, r);
      else (i % 3 === 1 ? reception : planter)(ctx, r.x0, r.z0, r.x1, r.z1);
      return;
    }
    // Холл.
    if (template === 'hall') {
      if (i % 2 === 0) buffetCounter(ctx, r);
      else canteenTable(ctx, r);
      return;
    }
    if (template === 'copy') {
      copier(ctx, r);
      return;
    }
    const pick = [reception, waiting, planter, vitrine, lockers, archive];
    (pick[i % pick.length] ?? reception)(ctx, r.x0, r.z0, r.x1, r.z1);
  }

  /** Есть ли пол вдоль грани блока: туда грань и смотрит. */
  function openAlong(a: number, b: number, line: number, axis: 'x' | 'z'): boolean {
    for (let i = a; i < b; i++) {
      const tt = axis === 'x' ? tile(i, line) : tile(line, i);
      if (tt !== TILE_WALL && tt !== -1) return true;
    }
    return false;
  }

  /** Над массой бойлерной — трубы с кронштейнами. */
  function pipesOver(r: Rect): void {
    const y = Math.min(H - 0.5, t.inner + 0.5);
    for (const [dz, rad] of [[0.3, 0.12], [0.7, 0.08]] as const) {
      kit.tube(S.pipe, new Vector3(r.x0, y + dz, r.z1 + 0.25), new Vector3(r.x1, y + dz, r.z1 + 0.25), rad);
    }
  }

  // --- Разрушаемые клетки ----------------------------------------------------------------------
  const maxHp = Math.max(1, TUNING.room.weakWallHp);
  const weak = components(map, (cx, cy) => tile(cx, cy) === TILE_WEAK);
  for (const r of weak) {
    const wd = r.x1 - r.x0;
    const dp = r.z1 - r.z0;
    const slab = wd >= 2 && dp >= 2;
    for (let cz = r.z0; cz < r.z1; cz++) {
      for (let cx = r.x0; cx < r.x1; cx++) {
        if (tile(cx, cz) !== TILE_WEAK) continue;
        const hp = Math.max(0, Math.min(1, (map.weakHp[cz * W + cx] ?? maxHp) / maxHp));
        const run = (nx: number, nz: number): boolean => {
          const nt = tile(nx, nz);
          return nt === TILE_WEAK || nt === TILE_WALL;
        };
        const horizontal = run(cx - 1, cz) || run(cx + 1, cz) || !(run(cx, cz - 1) || run(cx, cz + 1));
        if (template === 'cubicles') cubicleCell(ctx, cx, cz, wd >= dp, hp);
        else if (t.id === 'boiler') cageCell(ctx, cx, cz, horizontal, hp);
        else if (slab) glassCase(cx, cz, hp);
        else glassPanel(cx, cz, horizontal, hp);
      }
    }
  }

  /** Стеклянная перегородка: стальной цоколь, стойки, стёкла по прочности. */
  function glassPanel(cx: number, cz: number, horizontal: boolean, hp: number): void {
    const H2 = Math.min(t.inner, 2.0);
    const sill = 0.16;
    const panes = Math.max(1, Math.ceil(hp * 3));
    const glassMat = t.id === 'void' ? L.frosted : L.vitrine;
    if (horizontal) {
      kit.box(m.darkMetal, cx, 0, cz + 0.42, cx + 1, sill, cz + 0.58);
      kit.box(m.metal, cx, H2 - 0.05, cz + 0.46, cx + 1, H2, cz + 0.54);
      kit.box(m.metal, cx, sill, cz + 0.46, cx + 0.04, H2, cz + 0.54);
      for (let i = 0; i < panes; i++) {
        const a = cx + 0.05 + (i * 0.92) / 3;
        kit.box(kit.flat(glassMat), a, sill, cz + 0.49, a + 0.29, H2 - 0.05, cz + 0.51);
      }
    } else {
      kit.box(m.darkMetal, cx + 0.42, 0, cz, cx + 0.58, sill, cz + 1);
      kit.box(m.metal, cx + 0.46, H2 - 0.05, cz, cx + 0.54, H2, cz + 1);
      kit.box(m.metal, cx + 0.46, sill, cz, cx + 0.54, H2, cz + 0.04);
      for (let i = 0; i < panes; i++) {
        const a = cz + 0.05 + (i * 0.92) / 3;
        kit.box(kit.flat(glassMat), cx + 0.49, sill, a, cx + 0.51, H2 - 0.05, a + 0.29);
      }
    }
  }

  /** Шкаф со стеклянными дверцами: целая клетка, стекло бьётся по прочности. */
  function glassCase(cx: number, cz: number, hp: number): void {
    const body = t.id === 'files' ? S.greyCab : S.oak;
    const top = 1.75;
    kit.box(body, cx + 0.04, 0, cz + 0.06, cx + 0.96, top, cz + 0.94);
    kit.box(m.darkMetal, cx + 0.06, 0, cz + 0.08, cx + 0.94, 0.08, cz + 0.92);
    for (const y of [0.45, 0.85, 1.25]) {
      for (let k = 0; k < 9; k++) {
        if (rng.float() < 0.15) continue;
        const mat = L.binders[Math.floor(rng.float() * L.binders.length)] ?? m.paper;
        const x = cx + 0.1 + k * 0.09;
        kit.box(mat, x, y + 0.02, cz + 0.2, x + 0.07, y + 0.3, cz + 0.8);
      }
      kit.box(body, cx + 0.06, y, cz + 0.08, cx + 0.94, y + 0.02, cz + 0.92);
    }
    if (hp > 0.5) kit.box(kit.flat(L.vitrine), cx + 0.06, 0.1, cz + 0.94, cx + 0.94, top - 0.05, cz + 0.95);
    if (hp > 0.5) kit.box(kit.flat(L.vitrine), cx + 0.06, 0.1, cz + 0.05, cx + 0.94, top - 0.05, cz + 0.06);
    if (hp <= 0.5) {
      // Разбито: листы на полу у шкафа.
      for (let k = 0; k < 3; k++) kit.add(BOX1, L.docs[k % L.docs.length] ?? m.paper, cx + rng.float(), 0.004, cz + 1.05 + rng.float() * 0.3, 0.26, 0.003, 0.36, 0, rng.float() * 3);
    }
  }

  // --- Отделка по теме ------------------------------------------------------------------------
  if (t.id === 'boiler') boilerWalls();
  if (t.id === 'office') officeWalls();

  function boilerWalls(): void {
    // Магистрали вдоль дальней стены и по бокам — на кронштейнах.
    const y1 = H - 0.55;
    const y2 = H - 1.0;
    kit.tube(S.pipe, new Vector3(1, y1, 1.3), new Vector3(W - 1, y1, 1.3), 0.16);
    kit.tube(S.insulation, new Vector3(1, y2, 1.25), new Vector3(W - 1, y2, 1.25), 0.11);
    for (let x = 2; x < W - 1; x += 2.5) {
      kit.box(m.darkMetal, x - 0.03, y2 - 0.15, 1.0, x + 0.03, y1 + 0.2, 1.5);
    }
    for (const [x, s] of [[1.3, 1], [W - 1.3, -1]] as const) {
      kit.tube(S.pipe, new Vector3(x, y1, 1.3), new Vector3(x, y1, D - 1.4), 0.14);
      void s;
    }
    // Стояки вниз в пол, с задвижками.
    for (let x = 4; x < W - 3; x += 7) {
      if (tile(Math.floor(x), 0) !== TILE_WALL) continue;
      kit.tube(S.pipe, new Vector3(x, y1, 1.3), new Vector3(x, 0, 1.3), 0.12);
      kit.add(TORUS, S.valve, x, 1.2, 1.48, 0.34, 0.34, 0.34);
      kit.cyl(S.gauge, x + 0.3, 1.55, 1.08, 0.09, 0.04, Math.PI / 2);
    }
    // Лампы в клетке на стенах — тёплые пятна в темноте.
    for (let x = 3; x < W - 2; x += 6) {
      if (tile(Math.floor(x), 0) !== TILE_WALL) continue;
      kit.box(m.darkMetal, x - 0.12, H - 1.6, 1.0, x + 0.12, H - 1.35, 1.12);
      kit.sphere(kit.flat(S.cageLamp), x, H - 1.48, 1.14, 0.16, 0.16, 0.12);
    }
  }

  function officeWalls(): void {
    // Бра и портреты на боковых стенах.
    for (const [x, s] of [[1.035, 1], [W - 1.035, -1]] as const) {
      for (let z = 3; z < D - 3; z += 4) {
        if (!solid(s > 0 ? 0 : W - 1, z) || !solid(s > 0 ? 0 : W - 1, z + 1)) continue;
        const mat = S.portraits[Math.floor(rng.float() * S.portraits.length)] ?? m.paper;
        kit.box(S.frame, Math.min(x, x + 0.05 * s), 1.45, z - 0.35, Math.max(x, x + 0.05 * s), 2.35, z + 0.35);
        kit.box(mat, Math.min(x + 0.05 * s, x + 0.055 * s), 1.51, z - 0.29, Math.max(x + 0.05 * s, x + 0.055 * s), 2.29, z + 0.29);
        kit.box(kit.flat(S.sconce), Math.min(x, x + 0.12 * s), 2.45, z - 0.07, Math.max(x, x + 0.12 * s), 2.53, z + 0.07);
      }
    }
  }

  // --- Антураж из слотов планировки ---------------------------------------------------------
  const lampSpots: { x: number; z: number; wd: number; dp: number; flicker: boolean; darkLit: boolean }[] = [];
  const tpl = room === undefined ? undefined : TEMPLATES_BY_ID.get(room.template);
  if (room !== undefined && tpl?.decor !== undefined) {
    const size = map.size;
    const wall = TUNING.room.wall;
    const drng = makeRng((w.seed + room.index * TUNING.floor.decorSeedStride) >>> 0);
    let lampIndex = 0;
    for (const slot of tpl.decor) {
      const spec = DECOR_BY_ID.get(slot.kind);
      if (spec === undefined) continue;
      const count = Math.max(1, Math.round(slot.repeat?.count ?? 1));
      for (let i = 0; i < count; i++) {
        const roll = drng.float();
        const jx = slot.jitter > 0 ? drng.range(-slot.jitter, slot.jitter) : 0;
        const jy = slot.jitter > 0 ? drng.range(-slot.jitter, slot.jitter) : 0;
        if (slot.chance !== undefined && roll >= slot.chance) continue;
        const col = slot.col + (slot.repeat?.stepCol ?? 0) * i + jx;
        const row = slot.row + (slot.repeat?.stepRow ?? 0) * i + jy;
        const [cw, ch] = spec.size;
        let x = wall + col;
        let z = wall + row;
        let wd = cw;
        let dp = ch;
        if (spec.mount === 'wall' && slot.facing !== undefined) {
          const f = slot.facing;
          if (f === 's' || t.id === 'void') continue;
          if (f === 'n') z = wall - dp;
          if (f === 'w') x = wall - wd;
          if (f === 'e') x = wall + TUNING.room.cols;
          if (wallBusy(map, f, x * size, z * size, wd * size, dp * size)) continue;
          wallDecor(spec.id, f, x, z, wd, dp, spec.color, spec.detail);
          continue;
        }
        if (spec.mount === 'floor' || spec.mount === 'ceiling') {
          const x0 = Math.max(x, wall);
          const z0 = Math.max(z, wall);
          const x1 = Math.min(x + wd, wall + TUNING.room.cols);
          const z1 = Math.min(z + dp, wall + TUNING.room.rows);
          if (x1 <= x0 || z1 <= z0) continue;
          x = x0;
          z = z0;
          wd = x1 - x0;
          dp = z1 - z0;
        }
        if (spec.mount === 'ceiling') {
          const v2 = Math.sin((lampIndex + 1) * 12.9898) * 43758.5453;
          lampIndex += 1;
          lampSpots.push({ x: x + wd / 2, z: z + dp / 2, wd, dp, flicker: spec.flicker === true, darkLit: v2 - Math.floor(v2) < TUNING.dark.lampShare });
          continue;
        }
        if (spec.mount === 'floor') floorDecor(spec.id, x, z, wd, dp);
      }
    }
  }

  function wallDecor(id: string, f: 'n' | 'w' | 'e', x: number, z: number, wd: number, dp: number, color: string, detail?: string): void {
    const along0 = f === 'n' ? x : z;
    const along1 = f === 'n' ? x + wd : z + dp;
    const mid = (along0 + along1) / 2;
    const vert = f === 'n' ? dp : wd;
    const yc = WALL_MOUNT_HEIGHT[id] ?? 1.65;
    const at = f === 'n' ? 1.035 : f === 'w' ? 1.035 : W - 1.035;
    const s = f === 'e' ? -1 : 1;
    const put = (mat: Material, a0: number, a1: number, y0: number, y1: number, out0: number, out1: number): void => {
      if (f === 'n') kit.box(mat, a0, y0, at + out0, a1, y1, at + out1);
      else kit.box(mat, Math.min(at + out0 * s, at + out1 * s), y0, a0, Math.max(at + out0 * s, at + out1 * s), y1, a1);
    };
    switch (id) {
      case 'clock':
        if (f === 'n') buildClock(ctx, mid, yc);
        return;
      case 'board':
        if (f === 'n') board(ctx, mid, 1.7, Math.max(0.8, wd), 0.85);
        else put(L.cork, along0, along1, 1.3, 2.1, 0, 0.03);
        return;
      case 'portrait':
      case 'portrait-big': {
        const big = id === 'portrait-big';
        const hh = big ? 0.6 : 0.42;
        const mat = S.portraits[Math.floor(rng.float() * S.portraits.length)] ?? m.paper;
        put(S.frame, mid - hh * 0.8, mid + hh * 0.8, 1.85 - hh, 1.85 + hh, 0, 0.05);
        put(mat, mid - hh * 0.8 + 0.06, mid + hh * 0.8 - 0.06, 1.85 - hh + 0.06, 1.85 + hh - 0.06, 0.05, 0.055);
        return;
      }
      case 'extinguisher':
        if (f === 'n') {
          kit.cyl(m.darkMetal, mid, 0.35, at + 0.14, 0.09, 0.55);
          kit.sphere(m.darkMetal, mid, 0.9, at + 0.14, 0.18, 0.1, 0.18);
        } else {
          kit.cyl(m.darkMetal, at + 0.14 * s, 0.35, mid, 0.09, 0.55);
        }
        return;
      case 'tube':
        if (f === 'n') kit.cyl(L.brass, mid, 0, at + 0.08, 0.06, H);
        else kit.cyl(L.brass, at + 0.08 * s, 0, mid, 0.06, H);
        return;
      case 'panel':
        put(L.radiator, mid - 0.3, mid + 0.3, 1.0, 1.75, 0, 0.14);
        put(m.darkMetal, mid - 0.06, mid + 0.06, 1.3, 1.45, 0.14, 0.18);
        return;
      default: {
        // Бумажное: указатель, план эвакуации, календарь.
        const mat = L.docs[Math.floor(rng.float() * L.docs.length)] ?? m.paper;
        put(m.darkMetal, along0, along1, yc - vert / 2, yc + vert / 2, 0, 0.02);
        put(mat, along0 + 0.03, along1 - 0.03, yc - vert / 2 + 0.03, yc + vert / 2 - 0.03, 0.02, 0.025);
        void color;
        void detail;
      }
    }
  }

  function floorDecor(id: string, x: number, z: number, wd: number, dp: number): void {
    if (id === 'paper') {
      for (let k = 0; k < 3; k++) kit.add(BOX1, L.docs[k % L.docs.length] ?? m.paper, x + rng.float() * wd, 0.004 + k * 0.001, z + rng.float() * dp, 0.3, 0.003, 0.42, 0, rng.float() * Math.PI);
      return;
    }
    if (id === 'duct') {
      kit.box(m.darkMetal, x, 0, z, x + wd, 0.06, z + dp);
      return;
    }
    if (id === 'path') {
      // Протоптанное: ковровая дорожка там, где ходят.
      if (t.id === 'boiler' || t.id === 'void') return;
      const S2 = setMats();
      const rug = t.id === 'office' ? S2.rugWarm : S2.rug;
      kit.box(kit.flat(S2.rugEdge), x, 0, z + 0.12, x + wd, 0.006, z + dp - 0.12);
      kit.box(kit.flat(rug), x, 0, z + 0.2, x + wd, 0.008, z + dp - 0.2);
    }
  }

  // --- Свет ------------------------------------------------------------------------------------
  const areas: RectAreaLight[] = [];
  const fills: SpotLight[] = [];
  if (t.panels > 0) {
    const spots = lampSpots.length > 0
      ? lampSpots.slice(0, 6)
      : [[0.3, 0.34], [0.7, 0.34], [0.3, 0.72], [0.7, 0.72]].map(([fx2, fz]) => ({ x: W * (fx2 ?? 0.5), z: D * (fz ?? 0.5), wd: 3, dp: 0.8, flicker: false, darkLit: true }));
    const panelGeo = new PlaneGeometry(1, 1);
    const panelMat = new MeshBasicMaterial({ color: t.panelColor, side: DoubleSide });
    owned.push(panelGeo, panelMat);
    spots.forEach((p, i) => {
      const pw = Math.min(3.2, Math.max(1.2, p.wd * 0.8));
      const pd = Math.min(1.0, Math.max(0.5, p.dp * 0.35));
      const light = new RectAreaLight(t.panelColor, t.panels, pw, pd);
      light.position.set(p.x, H - 0.05, p.z);
      light.lookAt(p.x, 0, p.z);
      group.add(light);
      areas.push(light);
      const panel = new Mesh(panelGeo, panelMat);
      panel.scale.set(pw, pd, 1);
      panel.position.set(p.x, H - 0.04, p.z);
      panel.rotation.x = Math.PI / 2;
      panel.layers.set(2);
      group.add(panel);
      if (p.flicker) {
        ticks.push((time) => {
          light.intensity = t.panels * flickerAlpha(time, i);
        });
      }
    });
  }
  if (t.fill > 0) {
    for (const px of [W * 0.3, W * 0.7]) {
      const spot = new SpotLight(0xf3f6fa, t.fill, 0, 1.3, 1, 2);
      spot.position.set(px, H - 0.08, D * 0.36);
      spot.target.position.set(px, 0, D * 0.62);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.radius = 8;
      spot.shadow.bias = -0.0006;
      spot.shadow.normalBias = 0.02;
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = H + 2;
      group.add(spot, spot.target);
      fills.push(spot);
    }
  }
  if (t.cones) {
    const spots = lampSpots.length > 0
      ? lampSpots
      : [[0.25, 0.4], [0.5, 0.6], [0.75, 0.4]].map(([fx2, fz]) => ({ x: W * (fx2 ?? 0.5), z: D * (fz ?? 0.5), wd: 3, dp: 2, flicker: false, darkLit: true }));
    for (const p of spots) lamps.push(makeLamp(p.x, p.z, p.wd, p.dp, p.flicker, p.darkLit));
  }

  function makeLamp(cx: number, cz: number, wd: number, dp: number, flicker: boolean, darkLit: boolean): Lamp {
    const top = H + 2.4;
    const radius = Math.max(wd, dp) * 0.5;
    const color = t.id === 'void' ? 0xffffff : 0xffe2b8;
    const beamGeo = new CylinderGeometry(radius * 0.25, radius * 1.1, top, 24, 1, true);
    const beamMat = beamMaterial(color, v.lampBeam);
    owned.push(beamGeo, beamMat);
    const beam = new Mesh(beamGeo, beamMat);
    beam.position.set(cx, top / 2, cz);
    beam.renderOrder = 5;
    fx.add(beam);
    const poolGeo = new PlaneGeometry(radius * 4, radius * 4);
    const poolMat = additive(m.glow, color, 0.12);
    owned.push(poolGeo, poolMat);
    const pool = new Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, 0.01, cz);
    pool.renderOrder = 4;
    fx.add(pool);
    // Сам светильник: плафон на тросе — его видно, свет идёт из него.
    const shadeGeo = new CylinderGeometry(0.1, 0.3, 0.2, 20, 1, true);
    owned.push(shadeGeo);
    const panel = new Mesh(shadeGeo, t.id === 'void' ? L.plastic : m.darkMetal);
    panel.position.set(cx, H - 0.25, cz);
    group.add(panel);
    kit.sphere(kit.flat(t.id === 'void' ? L.led : S.cageLamp), cx, H - 0.36, cz, 0.12, 0.08, 0.12);
    kit.cyl(m.darkMetal, cx, H - 0.15, cz, 0.008, 0.6);
    return { x: cx, z: cz, flicker, darkLit, beam, pool, panel };
  }

  // Потолок, держащий солнце: только у тем с окнами.
  if (t.windows) {
    const geo = new PlaneGeometry(W + 6, D + 6);
    owned.push(geo);
    const ceiling = new Mesh(geo, L.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(W / 2, H + 0.05, D / 2);
    ceiling.castShadow = true;
    group.add(ceiling);
    aoHidden.push(ceiling);
  }

  // Лучи из окон.
  const shafts: { mesh: Mesh; c: number; mat: ShaderMaterial }[] = [];
  for (const c of windows) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(24), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(24), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0]), 2));
    geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    const mat = beamMaterial(t.sun.color, 0.12);
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    fx.add(mesh);
    owned.push(geo, mat);
    shafts.push({ mesh, c, mat });
  }
  ticks.push((time) => {
    const az = (t.sun.az * Math.PI) / 180;
    const el = (t.sun.el * Math.PI) / 180;
    const dx = -Math.sin(az) * Math.cos(el);
    const dy = -Math.sin(el);
    const dz = Math.cos(az) * Math.cos(el);
    for (const s of shafts) {
      const pos = s.mesh.geometry.getAttribute('position') as BufferAttribute;
      const corners = [
        [s.c - WIN + 0.05, HEAD - 0.05],
        [s.c + WIN - 0.05, HEAD - 0.05],
        [s.c + WIN - 0.05, SILL + 0.05],
        [s.c - WIN + 0.05, SILL + 0.05],
      ];
      corners.forEach(([x, y], i) => {
        const k = (y ?? 0) / -dy;
        pos.setXYZ(i, x ?? 0, y ?? 0, 0.5);
        pos.setXYZ(i + 4, (x ?? 0) + dx * k, 0.01, 0.5 + dz * k);
      });
      pos.needsUpdate = true;
      s.mesh.geometry.computeVertexNormals();
      const u = s.mat.uniforms as Record<string, { value: number }>;
      if (u['uIntensity'] !== undefined) u['uIntensity'].value = TUNING.lobby3d.shafts;
      if (u['uTime'] !== undefined) u['uTime'].value = time;
    }
    L.frosted.emissiveIntensity = TUNING.lobby3d.window;
  });

  // --- Сборка ---------------------------------------------------------------------------------
  const floorGeo = floorB.build();
  owned.push(floorGeo);
  const floorMesh = new Mesh(floorGeo, t.floor);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);
  for (const mesh of kit.build(group)) owned.push(mesh.geometry);
  shadeAll(group);
  if ('shadowSide' in t.wall) (t.wall as Material).shadowSide = DoubleSide;

  return {
    group,
    fx,
    lamps,
    warm: t.id === 'office',
    floors: [floorMesh],
    aoHidden,
    look: () => ({
      sun: t.sun,
      sky: t.sky,
      env: t.env,
      exposure: t.exposure,
      skyColor: t.skyColor,
      groundColor: t.groundColor,
      voidColor: t.voidColor,
      fog: t.fog,
      reflect: t.reflect,
      lamps: t.cones,
      bloom: t.bloom,
    }),
    tick(time) {
      for (const k of ticks) k(time);
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };

  // --- Надписи ------------------------------------------------------------------------------
  function textAt(text: string, along: number, top: number, at: number, d: number, axis: 'z' | 'x+' | 'x-', mat: Material): void {
    let cursor = along;
    for (const ch of text) {
      const g = GLYPHS[ch];
      if (g !== undefined) {
        for (let row = 0; row < g.length; row++) {
          const line = g[row] ?? '';
          for (let col = 0; col < line.length; col++) {
            if (line[col] !== '1') continue;
            const y1 = top - row * d;
            if (axis === 'z') kit.box(mat, cursor + col * d, y1 - d, at, cursor + (col + 1) * d, y1, at + 0.012);
            else if (axis === 'x+') kit.box(mat, at, y1 - d, cursor + col * d, at + 0.012, y1, cursor + (col + 1) * d);
            else kit.box(mat, at - 0.012, y1 - d, cursor + (2 - col) * d, at, y1, cursor + (3 - col) * d);
          }
        }
      }
      cursor += 4 * d;
    }
  }
}

const BOX1 = new BoxGeometry(1, 1, 1);
const TORUS = new TorusGeometry(0.42, 0.06, 8, 24);

const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '-': ['000', '000', '111', '000', '000'],
  'Б': ['111', '100', '110', '101', '110'],
};

/** Связные области клеток по условию — прямоугольником-габаритом. */
function components(map: TileMap, test: (cx: number, cy: number) => boolean): Rect[] {
  const W = map.cols;
  const D = map.rows;
  const seen = new Uint8Array(W * D);
  const out: Rect[] = [];
  for (let cy = 0; cy < D; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (seen[cy * W + cx] === 1 || !test(cx, cy)) continue;
      let x0 = cx;
      let x1 = cx;
      let z0 = cy;
      let z1 = cy;
      const stack: [number, number][] = [[cx, cy]];
      seen[cy * W + cx] = 1;
      while (stack.length > 0) {
        const p = stack.pop();
        if (p === undefined) continue;
        const [px, pz] = p;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        z0 = Math.min(z0, pz);
        z1 = Math.max(z1, pz);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const nz = pz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          if (seen[nz * W + nx] === 1 || !test(nx, nz)) continue;
          seen[nz * W + nx] = 1;
          stack.push([nx, nz]);
        }
      }
      out.push({ x0, z0, x1: x1 + 1, z1: z1 + 1 });
    }
  }
  return out;
}

function wallBusy(map: TileMap, facing: 'n' | 's' | 'e' | 'w', x: number, y: number, width: number, height: number): boolean {
  const size = map.size;
  const horizontal = facing === 'n' || facing === 's';
  const line = facing === 'n' ? 0 : facing === 's' ? map.rows - 1 : facing === 'w' ? 0 : map.cols - 1;
  const from = Math.floor((horizontal ? x : y) / size);
  const to = Math.floor(((horizontal ? x + width : y + height) - 1) / size);
  for (let i = from; i <= to; i++) {
    const cx = horizontal ? i : line;
    const cy = horizontal ? line : i;
    if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return true;
    if (map.tiles[cy * map.cols + cx] !== TILE_WALL) return true;
  }
  return false;
}

function flickerAlpha(time: number, seed: number): number {
  const cfg = TUNING.render;
  const rate = Math.max(0, cfg.lampFlickerRate);
  if (rate <= 0) return 1;
  const step = Math.floor(time * rate) + seed * 977;
  const noise = Math.sin(step * 12.9898) * 43758.5453;
  const value = noise - Math.floor(noise);
  return value < cfg.lampFlickerDrop ? cfg.lampFlickerLow : 1;
}

