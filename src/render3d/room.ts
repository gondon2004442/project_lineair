/**
 * Помещение в объёме. Собирается из тайлмапа один раз на вход и на
 * каждый щелчок замка — как запекался бетон в плоском виде.
 *
 * Единица — клетка. Стены получают высоту: дальняя и боковые в полный
 * рост, ближняя к камере срезана до цоколя, иначе она закрыла бы
 * помещение. Внутренние стены планировки ниже внешних — это перегородки,
 * а не несущие.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three';
import type { World } from '../ecs';
import { PALETTE } from '../palette';
import { DIRS, TILE_DOOR, TILE_GATE, TILE_WALL, TILE_WEAK, liftOpen, type TileMap } from '../room';
import { roomNumber } from '../floor';
import { currentRoom } from '../world';
import { DECOR_BY_ID } from '../data/decor';
import { TEMPLATES_BY_ID } from '../data/roomTemplates';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { beamMaterial } from './beam';
import { FACE, GeoBuilder } from './geo';
import { additive, type Materials } from './materials';

export interface Lamp {
  x: number;
  z: number;
  /** Мигает: свет, луч и пятно гаснут вместе. */
  flicker: boolean;
  /** Горит на тёмном уровне: решение берётся хешем, как в плоском виде. */
  darkLit: boolean;
  beam: Mesh;
  pool: Mesh;
  panel: Mesh;
}

export interface RoomView {
  group: Group;
  /** Лучи и пятна света: рисуются отдельным проходом, мимо затенения углов. */
  fx: Group;
  lamps: Lamp[];
  warm: boolean;
  dispose(): void;
}

/** Высота, на которой висят предметы на стене, по виду предмета. */
const WALL_MOUNT_HEIGHT: Record<string, number> = {
  extinguisher: 0.75,
  panel: 1.35,
  tube: 2.2,
  clock: 2.3,
};

export function buildRoom(w: World, m: Materials): RoomView {
  const v = TUNING.view3d;
  const map = w.map;
  const group = new Group();
  const fx = new Group();
  const owned: { dispose(): void }[] = [];
  const lamps: Lamp[] = [];
  const room = currentRoom(w);
  const warm = room !== undefined && TEMPLATES_BY_ID.get(room.template)?.sector === 'office';

  const tile = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return -1;
    return map.tiles[cy * map.cols + cx] ?? -1;
  };
  const isBorder = (cx: number, cy: number): boolean => {
    const wall = TUNING.room.wall;
    return cx < wall || cy < wall || cx >= map.cols - wall || cy >= map.rows - wall;
  };
  const southRow = (cy: number): boolean => cy >= map.rows - TUNING.room.wall;
  /** Высота стены в клетке. Ноль — не стена. */
  const wallH = (cx: number, cy: number): number => {
    if (tile(cx, cy) !== TILE_WALL) return 0;
    if (southRow(cy)) return v.southWallHeight;
    return isBorder(cx, cy) ? v.wallHeight : v.innerWallHeight;
  };

  const concrete = new GeoBuilder(4);
  const tops = new GeoBuilder(4);
  const wood = new GeoBuilder(4);
  const skirt = new GeoBuilder(4);
  const rail = new GeoBuilder(4);
  const floor = new GeoBuilder(4);
  const metal = new GeoBuilder(2);
  const dark = new GeoBuilder(2);
  const paint = new GeoBuilder(4);
  const hazard = new GeoBuilder(1);
  const glass = new GeoBuilder(1);
  const voids = new GeoBuilder(1);

  const SKIRT = 0.09;
  const RAIL = 0.05;

  /**
   * Лицевая грань стены, обращённая в помещение. Внизу цоколь, в офисе
   * до высоты обшивки орех и стальной профиль по ней, выше — бетон.
   */
  const face = (cx: number, cy: number, dx: number, dy: number, from: number, to: number, room: boolean): void => {
    const seg = (b: GeoBuilder, y0: number, y1: number, out = 0): void => {
      if (y1 <= y0) return;
      const h = y1 - y0;
      if (dy === -1) b.quad([cx, y0, cy - out], [1, 0, 0], [0, h, 0], [0, 0, -1]);
      if (dy === 1) b.quad([cx, y0, cy + 1 + out], [1, 0, 0], [0, h, 0], [0, 0, 1]);
      if (dx === -1) b.quad([cx - out, y0, cy], [0, 0, 1], [0, h, 0], [-1, 0, 0]);
      if (dx === 1) b.quad([cx + 1 + out, y0, cy], [0, 0, 1], [0, h, 0], [1, 0, 0]);
    };
    if (!room) {
      seg(concrete, from, to);
      return;
    }
    const skirtTop = Math.min(to, SKIRT);
    seg(skirt, from, skirtTop, 0.012);
    if (warm && to > v.wainscot) {
      seg(wood, skirtTop, v.wainscot, 0.02);
      // Профиль поверх обшивки: тонкая стальная планка с выносом.
      const out = 0.045;
      const y0 = v.wainscot;
      const y1 = v.wainscot + RAIL;
      if (dy === -1) rail.box(cx, y0, cy - out, cx + 1, y1, cy, FACE.PY | FACE.NZ | FACE.NY);
      if (dy === 1) rail.box(cx, y0, cy + 1, cx + 1, y1, cy + 1 + out, FACE.PY | FACE.PZ | FACE.NY);
      if (dx === -1) rail.box(cx - out, y0, cy, cx, y1, cy + 1, FACE.PY | FACE.NX | FACE.NY);
      if (dx === 1) rail.box(cx + 1, y0, cy, cx + 1 + out, y1, cy + 1, FACE.PY | FACE.PX | FACE.NY);
      seg(concrete, y1, to);
      seg(concrete, y0, y1);
    } else {
      seg(concrete, skirtTop, to);
    }
  };

  const DIR4 = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;

  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const t = tile(cx, cy);

      if (t === TILE_WALL) {
        const h = wallH(cx, cy);
        tops.quad([cx, h, cy], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
        for (const [dx, dy] of DIR4) {
          const nt = tile(cx + dx, cy + dy);
          if (nt === -1) continue;
          if (nt === TILE_WALL) {
            const nh = wallH(cx + dx, cy + dy);
            if (nh < h) face(cx, cy, dx, dy, nh, h, false);
            continue;
          }
          face(cx, cy, dx, dy, 0, h, true);
        }
        continue;
      }

      if (t === TILE_GATE) {
        buildPit(cx, cy);
        continue;
      }

      floor.quad([cx, 0, cy], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
      if (t === TILE_DOOR) buildDoor(cx, cy);
      if (t === TILE_WEAK) buildGlass(cx, cy);
    }
  }

  function buildPit(cx: number, cy: number): void {
    const depth = 3;
    voids.quad([cx, -depth, cy], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    for (const [dx, dy] of DIR4) {
      if (tile(cx + dx, cy + dy) === TILE_GATE) continue;
      // Стенки шахты смотрят внутрь неё.
      if (dy === -1) dark.quad([cx, -depth, cy], [1, 0, 0], [0, depth, 0], [0, 0, 1]);
      if (dy === 1) dark.quad([cx, -depth, cy + 1], [1, 0, 0], [0, depth, 0], [0, 0, -1]);
      if (dx === -1) dark.quad([cx, -depth, cy], [0, 0, 1], [0, depth, 0], [1, 0, 0]);
      if (dx === 1) dark.quad([cx + 1, -depth, cy], [0, 0, 1], [0, depth, 0], [-1, 0, 0]);
      // Служебная кромка по краю провала.
      const e = 0.08;
      const y = 0.006;
      if (dy === -1) paint.quad([cx, y, cy], [1, 0, 0], [0, 0, e], [0, 1, 0]);
      if (dy === 1) paint.quad([cx, y, cy + 1 - e], [1, 0, 0], [0, 0, e], [0, 1, 0]);
      if (dx === -1) paint.quad([cx, y, cy], [e, 0, 0], [0, 0, 1], [0, 1, 0]);
      if (dx === 1) paint.quad([cx + 1 - e, y, cy], [e, 0, 0], [0, 0, 1], [0, 1, 0]);
    }
  }

  function buildDoor(cx: number, cy: number): void {
    const horizontal = cy === 0 || cy === map.rows - 1;
    const south = southRow(cy);
    const lineH = south ? v.southWallHeight : v.wallHeight;
    // Наличники: где проём упирается в стену, ставим стальную раму.
    const along = horizontal ? ([[-1, 0], [1, 0]] as const) : ([[0, -1], [0, 1]] as const);
    const jt = 0.1;
    for (const [dx, dy] of along) {
      if (tile(cx + dx, cy + dy) !== TILE_WALL) continue;
      if (dx === -1) metal.box(cx, 0, cy - 0.04, cx + jt, lineH, cy + 1.04);
      if (dx === 1) metal.box(cx + 1 - jt, 0, cy - 0.04, cx + 1, lineH, cy + 1.04);
      if (dy === -1) metal.box(cx - 0.04, 0, cy, cx + 1.04, lineH, cy + jt);
      if (dy === 1) metal.box(cx - 0.04, 0, cy + 1 - jt, cx + 1.04, lineH, cy + 1);
    }
    // Перемычка над проёмом: в дальней и боковых стенах она есть, в
    // срезанной ближней её нет — там и стены почти нет.
    if (!south && v.wallHeight > v.doorHeight) {
      const y0 = v.doorHeight;
      const y1 = v.wallHeight;
      concrete.box(cx, y0, cy, cx + 1, y1, cy + 1, FACE.NY | FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
      tops.quad([cx, y1, cy], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    }

    if (map.doorsLocked) {
      // Заперто: штрихованный барьер поперёк зева.
      const hh = south ? 0.55 : 1.15;
      const th = 0.14;
      if (horizontal) hazard.box(cx, 0, cy + 0.5 - th, cx + 1, hh, cy + 0.5 + th);
      else hazard.box(cx + 0.5 - th, 0, cy, cx + 0.5 + th, hh, cy + 1);
      return;
    }
    // Открыто: две полосы разметки на пороге со стороны помещения.
    const strip = TUNING.render.doorThreshold / TUNING.room.tile;
    const y = 0.005;
    for (let i = 0; i < 2; i++) {
      const s = 0.42 + i * strip * 2.2;
      if (cy === 0) paint.quad([cx, y, cy + s], [1, 0, 0], [0, 0, strip], [0, 1, 0]);
      else if (cy === map.rows - 1) paint.quad([cx, y, cy + 1 - s - strip], [1, 0, 0], [0, 0, strip], [0, 1, 0]);
      else if (cx === 0) paint.quad([cx + s, y, cy], [strip, 0, 0], [0, 0, 1], [0, 1, 0]);
      else paint.quad([cx + 1 - s - strip, y, cy], [strip, 0, 0], [0, 0, 1], [0, 1, 0]);
    }
  }

  /**
   * Стеклянная перегородка: стальной цоколь, стойки по краям и стёкла.
   * Целых стёкол тем меньше, чем сильнее её разбили.
   */
  function buildGlass(cx: number, cy: number): void {
    const run = (nx: number, ny: number): boolean => {
      const nt = tile(nx, ny);
      return nt === TILE_WEAK || nt === TILE_WALL;
    };
    const horizontal = run(cx - 1, cy) || run(cx + 1, cy) || !(run(cx, cy - 1) || run(cx, cy + 1));
    const H = Math.min(v.innerWallHeight, 1.9);
    const th = 0.07;
    const sill = 0.18;
    const maxHp = Math.max(1, TUNING.room.weakWallHp);
    const left = map.weakHp[cy * map.cols + cx] ?? maxHp;
    const panes = Math.max(1, Math.ceil((left / maxHp) * 3));
    if (horizontal) {
      const z0 = cy + 0.5 - th;
      const z1 = cy + 0.5 + th;
      dark.box(cx, 0, z0 - 0.03, cx + 1, sill, z1 + 0.03);
      metal.box(cx, H - 0.06, z0, cx + 1, H, z1);
      metal.box(cx, sill, z0, cx + 0.05, H, z1);
      metal.box(cx + 0.95, sill, z0, cx + 1, H, z1);
      for (let i = 0; i < panes; i++) {
        const a = cx + 0.05 + (i * 0.9) / 3;
        glass.box(a + 0.01, sill, cy + 0.49, a + 0.29, H - 0.06, cy + 0.51);
      }
    } else {
      const x0 = cx + 0.5 - th;
      const x1 = cx + 0.5 + th;
      dark.box(x0 - 0.03, 0, cy, x1 + 0.03, sill, cy + 1);
      metal.box(x0, H - 0.06, cy, x1, H, cy + 1);
      metal.box(x0, sill, cy, x1, H, cy + 0.05);
      metal.box(x0, sill, cy + 0.95, x1, H, cy + 1);
      for (let i = 0; i < panes; i++) {
        const a = cy + 0.05 + (i * 0.9) / 3;
        glass.box(cx + 0.49, sill, a + 0.01, cx + 0.51, H - 0.06, a + 0.29);
      }
    }
  }

  const signPaper = new GeoBuilder(1);
  const signInk = new GeoBuilder(1);
  const signLit = new GeoBuilder(1);

  // --- Лифт: решётка поперёк шахты и табло ----------------------------------
  if (liftOpen(map)) {
    const wall = TUNING.room.wall;
    const midX = wall + Math.floor(TUNING.room.cols / 2) - 1;
    const midY = wall + Math.floor(TUNING.room.rows / 2) - 1;
    const step = TUNING.render.liftBarStep / TUNING.room.tile;
    for (let bx = midX + step; bx < midX + 2; bx += step) {
      metal.box(bx - 0.03, -0.1, midY, bx + 0.03, 0.04, midY + 2, FACE.PY | FACE.PX | FACE.NX);
    }
    // Табло на стойке у дальнего края шахты.
    const signed = w.seals.includes(w.depth);
    const text = signed ? String(w.depth - 1) : '--';
    const px = midX + 1;
    const pz = midY - 0.25;
    dark.box(px - 0.06, 0, pz - 0.06, px + 0.06, 1.3, pz + 0.06);
    const digit = 0.07;
    const wText = text.length * 3 * digit + (text.length - 1) * digit;
    const plateW = wText + 0.2;
    const plateH = 5 * digit + 0.2;
    dark.box(px - plateW / 2, 1.3, pz - 0.05, px + plateW / 2, 1.3 + plateH, pz + 0.05);
    const target = signed ? signLit : metal;
    glyphs(target, text, px - wText / 2, 1.3 + plateH - 0.1, pz + 0.05, digit, 'z');
  }

  // --- Таблички номеров у проёмов ----------------------------------------------
  if (room !== undefined) {
    for (const dir of DIRS) {
      const next = w.floor.rooms[room.neighbors[dir]];
      if (next === undefined) continue;
      const text = roomNumber(next);
      const horizontal = dir === 0 || dir === 2;
      const line = dir === 0 ? 0 : dir === 2 ? map.rows - 1 : dir === 3 ? 0 : map.cols - 1;
      const span = horizontal ? map.cols : map.rows;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < span; i++) {
        const tcx = horizontal ? i : line;
        const tcy = horizontal ? line : i;
        if (tile(tcx, tcy) !== TILE_DOOR) continue;
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
      if (hi < 0) continue;
      const at = hi + 1 < span ? hi + 1 : lo - 1;
      const digit = 0.055;
      const wText = text.length * 3 * digit + (text.length - 1) * digit;
      const pw = wText + 0.16;
      const ph = 5 * digit + 0.16;
      const h = 1.75;
      if (dir === 0) {
        const x = at + 0.5;
        const z = line + 1;
        signPaper.box(x - pw / 2, h, z, x + pw / 2, h + ph, z + 0.03);
        glyphs(signInk, text, x - wText / 2, h + ph - 0.08, z + 0.03, digit, 'z');
      } else if (dir === 2) {
        // Ближняя стена низкая: табличка лежит на её торце.
        const x = at + 0.5;
        const y = v.southWallHeight + 0.01;
        signPaper.box(x - pw / 2, y - 0.01, line + 0.5 - ph / 2, x + pw / 2, y + 0.01, line + 0.5 + ph / 2);
        glyphsFlat(signInk, text, x - wText / 2, y + 0.012, line + 0.5 - (5 * digit) / 2, digit);
      } else {
        const x = dir === 3 ? line + 1 : line;
        const z = at + 0.5;
        const out = dir === 3 ? 0.03 : -0.03;
        signPaper.box(Math.min(x, x + out), h, z - pw / 2, Math.max(x, x + out), h + ph, z + pw / 2);
        glyphs(signInk, text, z - wText / 2, h + ph - 0.08, x + out, digit, dir === 3 ? 'x+' : 'x-');
      }
    }
  }

  // --- Антураж -----------------------------------------------------------------
  const decorMats = new Map<string, MeshStandardMaterial>();
  const decorMat = (key: keyof typeof PALETTE, alpha = 1): MeshStandardMaterial => {
    const id = `${key}:${alpha}`;
    let mat = decorMats.get(id);
    if (mat === undefined) {
      mat = new MeshStandardMaterial({
        color: PALETTE[key],
        roughness: key === 'paper' ? 0.85 : 0.6,
        metalness: key === 'enamel' || key === 'brass' ? 0.4 : 0.05,
        transparent: alpha < 1,
        opacity: alpha,
        depthWrite: alpha >= 1,
        polygonOffset: alpha < 1,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      decorMats.set(id, mat);
      owned.push(mat);
    }
    return mat;
  };
  const addBox = (mat: Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh => {
    const geo = new BoxGeometry(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0));
    owned.push(geo);
    const mesh = new Mesh(geo, mat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (room !== undefined) {
    const template = TEMPLATES_BY_ID.get(room.template);
    const slots = template?.decor ?? [];
    const size = map.size;
    const wall = TUNING.room.wall;
    const rng = makeRng((w.seed + room.index * TUNING.floor.decorSeedStride) >>> 0);
    let lampIndex = 0;

    for (const slot of slots) {
      const spec = DECOR_BY_ID.get(slot.kind);
      if (spec === undefined) continue;
      const count = Math.max(1, Math.round(slot.repeat?.count ?? 1));
      const stepCol = slot.repeat?.stepCol ?? 0;
      const stepRow = slot.repeat?.stepRow ?? 0;
      for (let i = 0; i < count; i++) {
        // Те же броски, что в плоском виде: один seed — одна расстановка.
        const roll = rng.float();
        const jx = slot.jitter > 0 ? rng.range(-slot.jitter, slot.jitter) : 0;
        const jy = slot.jitter > 0 ? rng.range(-slot.jitter, slot.jitter) : 0;
        if (slot.chance !== undefined && roll >= slot.chance) continue;
        const col = slot.col + stepCol * i + jx;
        const row = slot.row + stepRow * i + jy;
        const [cw, ch] = spec.size;
        let x = wall + col;
        let z = wall + row;
        let wd = cw;
        let dp = ch;

        if (spec.mount === 'wall' && slot.facing !== undefined) {
          const f = slot.facing;
          if (f === 's') continue;
          if (f === 'n') z = wall - dp;
          if (f === 'w') x = wall - wd;
          if (f === 'e') x = wall + TUNING.room.cols;
          if (wallBusy(map, f, x * size, z * size, wd * size, dp * size)) continue;
          const vert = f === 'n' ? ch : cw;
          const cyH = WALL_MOUNT_HEIGHT[spec.id] ?? 1.6;
          const y0 = cyH - vert / 2;
          const y1 = cyH + vert / 2;
          const th = spec.id === 'extinguisher' ? 0.16 : 0.05;
          const body = decorMat(spec.color);
          if (f === 'n') {
            addBox(body, x, y0, wall, x + wd, y1, wall + th);
            if (spec.detail !== undefined) {
              const ins = wd * TUNING.render.decorDetailInset;
              const share = spec.detailShare ?? TUNING.render.decorDetailShare;
              addBox(decorMat(spec.detail), x + ins, y1 - (y1 - y0) * (share + 0.12), wall + th, x + wd - ins, y1 - (y1 - y0) * 0.12, wall + th + 0.012);
            }
          } else {
            const xf = f === 'w' ? wall : wall + TUNING.room.cols;
            const s = f === 'w' ? 1 : -1;
            addBox(body, Math.min(xf, xf + s * th), y0, z, Math.max(xf, xf + s * th), y1, z + dp);
            if (spec.detail !== undefined) {
              const ins = dp * TUNING.render.decorDetailInset;
              const share = spec.detailShare ?? TUNING.render.decorDetailShare;
              const xa = xf + s * th;
              addBox(decorMat(spec.detail), Math.min(xa, xa + s * 0.012), y1 - (y1 - y0) * (share + 0.12), z + ins, Math.max(xa, xa + s * 0.012), y1 - (y1 - y0) * 0.12, z + dp - ins);
            }
          }
          continue;
        }

        // Покрытие и потолок обрезаются по помещению.
        if (spec.mount === 'floor' || spec.mount === 'ceiling') {
          const left = wall;
          const top = wall;
          const right = wall + TUNING.room.cols;
          const bottom = wall + TUNING.room.rows;
          const x0 = Math.max(x, left);
          const z0 = Math.max(z, top);
          const x1 = Math.min(x + wd, right);
          const z1 = Math.min(z + dp, bottom);
          if (x1 <= x0 || z1 <= z0) continue;
          x = x0;
          z = z0;
          wd = x1 - x0;
          dp = z1 - z0;
        }

        if (spec.mount === 'ceiling') {
          const cx = x + wd / 2;
          const cz = z + dp / 2;
          const v2 = Math.sin((lampIndex + 1) * 12.9898) * 43758.5453;
          const darkLit = v2 - Math.floor(v2) < TUNING.dark.lampShare;
          lampIndex += 1;
          lamps.push(makeLamp(cx, cz, wd, dp, spec.flicker === true, darkLit));
          continue;
        }

        if (spec.mount === 'floor') {
          if (spec.id === 'paper') {
            // Разбросанные листы: каждый свой поворот, а не прямоугольник.
            const sheets = 3;
            for (let k = 0; k < sheets; k++) {
              const geo = new PlaneGeometry(0.3, 0.42);
              owned.push(geo);
              const mesh = new Mesh(geo, decorMat('paper', 0.75));
              mesh.rotation.x = -Math.PI / 2;
              mesh.rotation.z = rng.angle();
              mesh.position.set(x + wd * (0.2 + 0.6 * ((k * 37) % 10) / 10), 0.004 + k * 0.001, z + dp * 0.5);
              mesh.receiveShadow = true;
              group.add(mesh);
            }
            continue;
          }
          if (spec.id === 'duct') {
            addBox(m.darkMetal, x, 0, z, x + wd, 0.06, z + dp);
            continue;
          }
          const geo = new PlaneGeometry(wd, dp);
          owned.push(geo);
          const mesh = new Mesh(geo, decorMat(spec.color, spec.alpha ?? 1));
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(x + wd / 2, 0.003, z + dp / 2);
          mesh.receiveShadow = true;
          group.add(mesh);
          continue;
        }

        // Стоящее на полу: тумба своего цвета.
        addBox(decorMat(spec.color), x, 0, z, x + wd, 0.8, z + dp);
      }
    }
  }

  function makeLamp(cx: number, cz: number, wd: number, dp: number, flicker: boolean, darkLit: boolean): Lamp {
    const top = v.wallHeight + 2.4;
    const radius = Math.max(wd, dp) * 0.55;
    const beamGeo = new CylinderGeometry(radius * 0.45, radius * 1.15, top, 20, 1, true);
    const beamMat = beamMaterial(0xdfe8f2, v.lampBeam);
    owned.push(beamGeo, beamMat);
    const beam = new Mesh(beamGeo, beamMat);
    beam.position.set(cx, top / 2, cz);
    beam.renderOrder = 5;
    fx.add(beam);

    const poolGeo = new PlaneGeometry(radius * 4.2, radius * 4.2);
    const poolMat = additive(m.glow, 0xdfe8f2, 0.12);
    owned.push(poolGeo, poolMat);
    const pool = new Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, 0.01, cz);
    pool.renderOrder = 4;
    fx.add(pool);

    // Сама панель висит под потолком — видна только как светлое пятно
    // в верхней части луча, поэтому плоская и яркая.
    const panelGeo = new BoxGeometry(wd * 0.5, 0.04, dp * 0.4);
    owned.push(panelGeo);
    const panel = new Mesh(panelGeo, m.lampPanel);
    panel.position.set(cx, top, cz);
    // Потолка в кадре нет: панель не рисуется, она только источник.
    panel.visible = false;
    fx.add(panel);

    return { x: cx, z: cz, flicker, darkLit, beam, pool, panel };
  }

  // --- Сборка мешей ---------------------------------------------------------------
  const add = (b: GeoBuilder, mat: Material, cast = true): void => {
    if (b.empty) return;
    const geo = b.build();
    owned.push(geo);
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(floor, warm ? m.carpet : m.floor, false);
  add(concrete, warm ? m.wallWarm : m.wall);
  add(tops, m.wallTop);
  add(wood, m.wood);
  add(skirt, m.skirting);
  add(rail, m.rail);
  add(metal, m.metal);
  add(dark, m.darkMetal);
  add(paint, m.paint, false);
  add(hazard, m.hazard);
  add(glass, m.glass, false);
  add(voids, m.void, false);
  add(signPaper, m.paper);
  add(signInk, m.darkMetal, false);
  add(signLit, m.signLit, false);

  return {
    group,
    fx,
    lamps,
    warm,
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

/**
 * Цифры таблички — та же сетка 3×5, что и в плоском виде, только
 * кубиками на лицевой стороне. Шрифта в игре нет и не будет.
 */
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

/**
 * Вертикальная надпись. along — координата вдоль стены, top — высота
 * верхней строки, at — плоскость лица, axis — куда смотрит лицо.
 */
function glyphs(b: GeoBuilder, text: string, along: number, top: number, at: number, d: number, axis: 'z' | 'x+' | 'x-'): void {
  let cursor = along;
  const depth = 0.012;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g !== undefined) {
      for (let row = 0; row < g.length; row++) {
        const line = g[row] ?? '';
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== '1') continue;
          const y1 = top - row * d;
          const y0 = y1 - d;
          if (axis === 'z') {
            b.box(cursor + col * d, y0, at, cursor + (col + 1) * d, y1, at + depth);
          } else {
            // Сбоку текст читается слева направо по ходу оси z.
            const z0 = axis === 'x+' ? cursor + col * d : cursor + (2 - col) * d;
            const x0 = axis === 'x+' ? at : at - depth;
            b.box(x0, y0, z0, x0 + depth, y1, z0 + d);
          }
        }
      }
    }
    cursor += 4 * d;
  }
}

/** Надпись, лежащая на горизонтальной грани. */
function glyphsFlat(b: GeoBuilder, text: string, x: number, y: number, z: number, d: number): void {
  let cursor = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g !== undefined) {
      for (let row = 0; row < g.length; row++) {
        const line = g[row] ?? '';
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== '1') continue;
          b.box(cursor + col * d, y, z + row * d, cursor + (col + 1) * d, y + 0.008, z + (row + 1) * d, FACE.PY);
        }
      }
    }
    cursor += 4 * d;
  }
}

/** Та же проверка, что в плоском виде: на проём и на стекло не вешаем. */
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
