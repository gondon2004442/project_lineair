/**
 * ВЕСТИБЮЛЬ. Показательное помещение: то, как должна выглядеть контора,
 * когда в ней ещё ничего не случилось.
 *
 * Планировка та же, что у симуляции: стены, шесть блоков и проход в
 * аномалию стоят на своих клетках, и столкновения с ними прежние. Меняется
 * только то, чем эти клетки являются. Блок 4×2 — это не бетонный куб, а
 * банк шкафчиков, витрина, архивный стеллаж, стойка приёма, кадка с
 * фикусами и ряд кресел ожидания. Проход — лестница вниз, в холодный свет.
 *
 * Свет как в настоящем здании: солнце входит только через окна дальней
 * стены и ложится на пол косыми пятнами, под потолком ровные светильники,
 * пол натёрт и отражает. Красного здесь нет — красный только субъект.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RectAreaLight,
  SpotLight,
  Vector3,
  type CanvasTexture,
  type Material,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import type { World } from '../ecs';
import { PALETTE } from '../palette';
import { TILE_GATE, TILE_WALL } from '../room';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { beamMaterial } from './beam';
import { GeoBuilder } from './geo';
import { Kit } from './kit';
import type { Materials } from './materials';
import type { RoomView } from './room';
import {
  clockFace,
  documentSheet,
  granite,
  paintedMetal,
  plaster,
  poster,
  terminalScreen,
  terrazzo,
} from './textures';

interface LobbyMats {
  plaster: MeshStandardMaterial;
  granite: MeshStandardMaterial;
  terrazzo: MeshStandardMaterial;
  cut: MeshStandardMaterial;
  locker: MeshStandardMaterial;
  lockerDoor: MeshStandardMaterial;
  radiator: MeshStandardMaterial;
  frosted: MeshStandardMaterial;
  cork: MeshStandardMaterial;
  clock: MeshStandardMaterial;
  hand: MeshStandardMaterial;
  screen: MeshStandardMaterial;
  plastic: MeshStandardMaterial;
  soil: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  leafDark: MeshStandardMaterial;
  leafPale: MeshStandardMaterial;
  pot: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  seat: MeshStandardMaterial;
  carton: MeshStandardMaterial;
  led: MeshStandardMaterial;
  felt: MeshStandardMaterial;
  shade: MeshStandardMaterial;
  doorGlow: MeshStandardMaterial;
  vitrine: MeshPhysicalMaterial;
  ceiling: MeshBasicMaterial;
  binders: MeshStandardMaterial[];
  docs: MeshStandardMaterial[];
  posters: MeshStandardMaterial[];
  screenTex: CanvasTexture;
}

let cached: LobbyMats | null = null;

function std(color: number, rough: number, metal = 0, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  Object.assign(m, extra);
  return m;
}

function lobbyMats(): LobbyMats {
  if (cached !== null) return cached;
  const pl = plaster();
  const gr = granite();
  const tz = terrazzo();
  const lk = paintedMetal(0x6f7b84);
  const rd = paintedMetal(0xc4c4bc);
  const withSet = (set: { map: unknown; normalMap: unknown; roughnessMap: unknown }, color: number, ns = 1, metal = 0): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({
      color,
      map: set.map as never,
      normalMap: set.normalMap as never,
      roughnessMap: set.roughnessMap as never,
      roughness: 1,
      metalness: metal,
    });
    m.normalScale.set(ns, ns);
    return m;
  };
  const screenTex = terminalScreen();
  const docTex = [0, 1, 2, 3].map((i) => documentSheet(i));
  cached = {
    plaster: withSet(pl, 0xffffff, 0.8),
    granite: withSet(gr, 0xffffff, 0.4),
    terrazzo: withSet(tz, 0xffffff, 0.35),
    cut: std(0x141517, 0.95),
    locker: withSet(lk, 0xffffff, 0.6, 0.35),
    lockerDoor: withSet(lk, 0xe9eef2, 0.6, 0.35),
    radiator: withSet(rd, 0xffffff, 0.5, 0.2),
    frosted: std(0xe8eef3, 0.35, 0, { emissive: new Color(0xdfe9f4), emissiveIntensity: 2.2, transparent: true, opacity: 0.92 } as Partial<MeshStandardMaterial>),
    cork: std(0x8d7356, 0.95),
    clock: std(0xffffff, 0.45, 0, { map: clockFace(), emissive: new Color(0x1a1a1a) } as Partial<MeshStandardMaterial>),
    hand: std(0x16171a, 0.5, 0.3),
    screen: std(0x0a140c, 0.2, 0, { emissive: new Color(0xffffff), emissiveMap: screenTex, emissiveIntensity: 1.6 } as Partial<MeshStandardMaterial>),
    plastic: std(0xb7b2a5, 0.55),
    soil: std(0x2a221b, 1),
    leaf: std(0x34573a, 0.6, 0, { side: DoubleSide } as Partial<MeshStandardMaterial>),
    leafDark: std(0x22402b, 0.65, 0, { side: DoubleSide } as Partial<MeshStandardMaterial>),
    leafPale: std(0x5a7a4c, 0.6, 0, { side: DoubleSide } as Partial<MeshStandardMaterial>),
    pot: std(0x8c8a84, 0.7),
    brass: std(0xb08d4a, 0.32, 0.9),
    rubber: std(0x18191b, 0.8),
    seat: std(0x3d4650, 0.9),
    carton: std(0x9c8463, 0.9),
    led: std(0xffffff, 0.3, 0, { emissive: new Color(0xf3f6ff), emissiveIntensity: 3 } as Partial<MeshStandardMaterial>),
    felt: std(0x23262a, 1),
    shade: std(0x2f3a33, 0.5, 0.4, { emissive: new Color(0xffc27a), emissiveIntensity: 0.0, side: DoubleSide } as Partial<MeshStandardMaterial>),
    doorGlow: std(0xcfe2ff, 0.4, 0, { emissive: new Color(0xbcd6ff), emissiveIntensity: 0.55 } as Partial<MeshStandardMaterial>),
    vitrine: new MeshPhysicalMaterial({
      color: 0xdfe8ea,
      roughness: 0.04,
      transparent: true,
      opacity: 0.18,
      envMapIntensity: 2,
      depthWrite: false,
      side: DoubleSide,
    }),
    // Потолок: невидим в кадре, но держит солнце — оно входит только в окна.
    ceiling: new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    binders: [PALETTE.binder, PALETTE.woodDark, 0x3e4a57, PALETTE.concrete500, 0x5b5f52, PALETTE.paper, 0x2b2e33].map((c) =>
      std(c, 0.7),
    ),
    docs: docTex.map((t) => std(0xffffff, 0.85, 0, { map: t } as Partial<MeshStandardMaterial>)),
    posters: [0, 1, 2].map((i) => std(0xffffff, 0.8, 0, { map: poster(i) } as Partial<MeshStandardMaterial>)),
    screenTex,
  };
  return cached;
}

export function buildLobby(w: World, m: Materials): RoomView {
  const v = TUNING.view3d;
  const L = lobbyMats();
  const map = w.map;
  const group = new Group();
  const fx = new Group();
  const owned: { dispose(): void }[] = [];
  const aoHidden: Object3D[] = [];
  const meshes: Mesh[] = [];
  const kit = new Kit(2);
  const rng = makeRng(0x10bb7);
  const H = v.wallHeight;
  const W = map.cols;
  const D = map.rows;
  const SOUTH = Math.max(0.25, v.southWallHeight);
  const ticks: ((time: number) => void)[] = [];

  const tile = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= D) return -1;
    return map.tiles[cy * W + cx] ?? -1;
  };
  const border = (cx: number, cy: number): boolean => cx < 1 || cy < 1 || cx >= W - 1 || cy >= D - 1;

  // --- Окна дальней стены ---------------------------------------------------
  const SILL = 1.15;
  const HEAD = Math.min(H - 0.35, 3.0);
  const windows = [5.5, 11.5, 22.5, 28.5].filter((c) => c + 1.3 < W - 1);
  const WIN = 1.3;

  // --- Стены ------------------------------------------------------------------
  // Дальняя: простенки в полный рост, под окнами и над ними — перемычки.
  let cursor = 0;
  for (const c of windows) {
    kit.box(L.plaster, cursor, 0, 0, c - WIN, H, 1);
    kit.box(L.plaster, c - WIN, 0, 0, c + WIN, SILL, 1);
    kit.box(L.plaster, c - WIN, HEAD, 0, c + WIN, H, 1);
    cursor = c + WIN;
  }
  kit.box(L.plaster, cursor, 0, 0, W, H, 1);
  // Боковые и срезанная ближняя.
  kit.box(L.plaster, 0, 0, 1, 1, H, D - 1);
  kit.box(L.plaster, W - 1, 0, 1, W, H, D - 1);
  kit.box(L.plaster, 0, 0, D - 1, W, SOUTH, D);
  // Срез стен сверху — тёмный, как разрез на чертеже.
  kit.box(L.cut, 0, H, 0, W, H + 0.02, 1);
  kit.box(L.cut, 0, H, 1, 1, H + 0.02, D - 1);
  kit.box(L.cut, W - 1, H, 1, W, H + 0.02, D - 1);
  kit.box(L.cut, 0, SOUTH, D - 1, W, SOUTH + 0.02, D);

  // Цоколь из полированного гранита и стальной профиль над ним.
  const CLAD = 1.0;
  kit.box(L.granite, 1, 0, 1, W - 1, CLAD, 1.04);
  kit.box(L.granite, 1, 0, 1.04, 1.04, CLAD, D - 1);
  kit.box(L.granite, W - 1.04, 0, 1.04, W - 1, CLAD, D - 1);
  kit.box(m.rail, 1, CLAD, 1, W - 1, CLAD + 0.035, 1.055);
  kit.box(m.rail, 1, CLAD, 1.055, 1.055, CLAD + 0.035, D - 1);
  kit.box(m.rail, W - 1.055, CLAD, 1.055, W - 1, CLAD + 0.035, D - 1);
  // Карниз под срезом.
  kit.box(L.plaster, 1, H - 0.12, 1, W - 1, H, 1.08);

  // Пилястры боковых стен: ритм, без которого стена — просто плоскость.
  for (const z of [5, 10, 15]) {
    if (z + 0.35 > D - 1) continue;
    for (const [x0, x1] of [[1, 1.16], [W - 1.16, W - 1]] as const) {
      kit.box(L.plaster, x0, 0, z - 0.35, x1, H, z + 0.35);
      kit.box(L.granite, x0 - (x0 > 2 ? 0.03 : 0), 0, z - 0.38, x1 + (x0 < 2 ? 0.03 : 0), CLAD, z + 0.38);
    }
  }

  for (const c of windows) buildWindow(c);

  function buildWindow(c: number): void {
    const x0 = c - WIN;
    const x1 = c + WIN;
    const fr = 0.05;
    const zf = 0.5;
    // Рама: периметр, импост и фрамуга. Её тени и рисуют переплёт на полу.
    kit.box(m.darkMetal, x0, SILL, zf - 0.04, x1, SILL + fr, zf + 0.04);
    kit.box(m.darkMetal, x0, HEAD - fr, zf - 0.04, x1, HEAD, zf + 0.04);
    kit.box(m.darkMetal, x0, SILL, zf - 0.04, x0 + fr, HEAD, zf + 0.04);
    kit.box(m.darkMetal, x1 - fr, SILL, zf - 0.04, x1, HEAD, zf + 0.04);
    kit.box(m.darkMetal, c - fr / 2, SILL, zf - 0.04, c + fr / 2, HEAD, zf + 0.04);
    const transom = SILL + (HEAD - SILL) * 0.68;
    kit.box(m.darkMetal, x0, transom - fr / 2, zf - 0.04, x1, transom + fr / 2, zf + 0.04);
    for (const xm of [x0 + (c - x0) / 2, c + (x1 - c) / 2]) {
      kit.box(m.darkMetal, xm - 0.015, transom, zf - 0.03, xm + 0.015, HEAD, zf + 0.03);
    }
    // Матовое стекло светится дневным светом; тени не даёт — солнце сквозь него.
    kit.box(kit.flat(L.frosted), x0 + fr, SILL + fr, zf - 0.01, x1 - fr, HEAD - fr, zf + 0.01);
    // Подоконник.
    kit.box(L.granite, x0 - 0.06, SILL - 0.05, 0.55, x1 + 0.06, SILL + 0.02, 1.14);
    // Батарея под окном.
    const ry0 = 0.2;
    const ry1 = 0.82;
    for (let x = c - 1.0; x <= c + 1.0; x += 0.085) {
      kit.box(L.radiator, x, ry0, 1.06, x + 0.05, ry1, 1.22);
    }
    kit.cyl(L.radiator, c - 1.0, ry0 - 0.1, 1.14, 0.03, 0.1);
    kit.box(L.radiator, c - 1.02, ry1 - 0.05, 1.1, c + 1.07, ry1, 1.18);
    kit.box(L.radiator, c - 1.02, ry0, 1.1, c + 1.07, ry0 + 0.05, 1.18);
  }

  // --- Пол ----------------------------------------------------------------------
  const floorB = new GeoBuilder(4);
  let gx0 = Infinity;
  let gx1 = -Infinity;
  let gz0 = Infinity;
  let gz1 = -Infinity;
  for (let cy = 1; cy < D - 1; cy++) {
    for (let cx = 1; cx < W - 1; cx++) {
      const t = tile(cx, cy);
      if (t === TILE_GATE) {
        gx0 = Math.min(gx0, cx);
        gx1 = Math.max(gx1, cx + 1);
        gz0 = Math.min(gz0, cy);
        gz1 = Math.max(gz1, cy + 1);
        continue;
      }
      floorB.quad([cx, 0, cy], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    }
  }
  const floorGeo = floorB.build();
  owned.push(floorGeo);
  const floorMesh = new Mesh(floorGeo, L.terrazzo);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // --- Лестница вниз вместо провала -----------------------------------------------
  if (Number.isFinite(gx0)) buildStairs(gx0, gz0, gx1, gz1);

  function buildStairs(x0: number, z0: number, x1: number, z1: number): void {
    const depth = 2.7;
    const steps = 9;
    const run = (z1 - z0 - 0.9) / steps;
    const rise = (depth - 0.3) / steps;
    // Стенки колодца.
    kit.box(m.wall, x0 - 0.02, -depth, z0, x0, 0, z1);
    kit.box(m.wall, x1, -depth, z0, x1 + 0.02, 0, z1);
    kit.box(m.wall, x0, -depth, z0 - 0.02, x1, 0, z0);
    for (let i = 0; i < steps; i++) {
      const top = -(i + 1) * rise;
      const za = z1 - (i + 1) * run;
      const zb = z1 - i * run;
      kit.box(L.granite, x0, -depth, za, x1, top, zb);
      // Латунная проступь на носке.
      kit.box(L.brass, x0 + 0.1, top - 0.02, zb - 0.04, x1 - 0.1, top + 0.005, zb);
    }
    // Площадка и проём внизу: туда и уходит забег.
    kit.box(L.granite, x0, -depth - 0.05, z0, x1, -depth + 0.3, z1 - steps * run);
    const cx = (x0 + x1) / 2;
    kit.box(kit.flat(L.doorGlow), cx - 0.7, -depth + 0.3, z0 + 0.01, cx + 0.7, -depth + 2.3, z0 + 0.03);
    kit.box(m.darkMetal, cx - 0.78, -depth + 0.3, z0, cx - 0.7, -depth + 2.4, z0 + 0.08);
    kit.box(m.darkMetal, cx + 0.7, -depth + 0.3, z0, cx + 0.78, -depth + 2.4, z0 + 0.08);
    kit.box(m.darkMetal, cx - 0.78, -depth + 2.3, z0, cx + 0.78, -depth + 2.4, z0 + 0.08);
    const cold = new PointLight(0xbfd6ff, 4, 6, 2);
    cold.position.set(cx, -depth + 1.4, z0 + 0.9);
    group.add(cold);
    // Поручни вдоль спуска.
    for (const xr of [x0 + 0.12, x1 - 0.12]) {
      const a = new Vector3(xr, 0.92, z1 - 0.1);
      const b = new Vector3(xr, -depth + 0.3 + 0.92, z1 - steps * run + 0.1);
      kit.tube(m.metal, a, b, 0.025);
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        const p = a.clone().lerp(b, t);
        kit.tube(m.metal, new Vector3(p.x, p.y - 0.92, p.z), p, 0.018);
      }
    }
    // Кромка: латунный уголок и служебная жёлтая полоса на полу вокруг.
    const e = 0.06;
    kit.box(L.brass, x0 - e, -0.02, z0 - e, x1 + e, 0.006, z0);
    kit.box(L.brass, x0 - e, -0.02, z0, x0, 0.006, z1);
    kit.box(L.brass, x1, -0.02, z0, x1 + e, 0.006, z1);
    const band = 0.14;
    const y = 0.004;
    kit.box(kit.flat(m.paint), x0 - e - band, 0, z0 - e - band, x1 + e + band, y, z0 - e);
    kit.box(kit.flat(m.paint), x0 - e - band, 0, z0 - e, x0 - e, y, z1);
    kit.box(kit.flat(m.paint), x1 + e, 0, z0 - e, x1 + e + band, y, z1);
  }

  // --- Шесть блоков планировки: обстановка на тех же клетках ----------------------
  const blocks = findBlocks();
  const builders = [lockers, vitrine, archive, reception, planter, waiting];
  blocks.forEach((b, i) => (builders[i] ?? reception)(b.x0, b.z0, b.x1, b.z1));

  function findBlocks(): { x0: number; z0: number; x1: number; z1: number }[] {
    const seen = new Uint8Array(W * D);
    const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
    for (let cy = 1; cy < D - 1; cy++) {
      for (let cx = 1; cx < W - 1; cx++) {
        if (seen[cy * W + cx] === 1 || tile(cx, cy) !== TILE_WALL || border(cx, cy)) continue;
        let x0 = cx;
        let x1 = cx;
        let z0 = cy;
        let z1 = cy;
        const stack = [[cx, cy]];
        seen[cy * W + cx] = 1;
        while (stack.length > 0) {
          const [px, pz] = stack.pop() ?? [0, 0];
          if (px === undefined || pz === undefined) continue;
          x0 = Math.min(x0, px);
          x1 = Math.max(x1, px);
          z0 = Math.min(z0, pz);
          z1 = Math.max(z1, pz);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = px + dx;
            const nz = pz + dz;
            if (seen[nz * W + nx] === 1 || tile(nx, nz) !== TILE_WALL || border(nx, nz)) continue;
            seen[nz * W + nx] = 1;
            stack.push([nx, nz]);
          }
        }
        out.push({ x0, z0, x1: x1 + 1, z1: z1 + 1 });
      }
    }
    return out;
  }

  /** Банк шкафчиков: две секции спиной к спине. */
  function lockers(x0: number, z0: number, x1: number, z1: number): void {
    const zc = (z0 + z1) / 2;
    const top = 1.95;
    kit.box(m.darkMetal, x0 + 0.08, 0, z0 + 0.1, x1 - 0.08, 0.1, z1 - 0.1);
    for (const [za, zb, face] of [[zc + 0.02, z1 - 0.06, 1], [z0 + 0.06, zc - 0.02, -1]] as const) {
      kit.box(L.locker, x0 + 0.04, 0.1, za, x1 - 0.04, top, zb);
      kit.box(m.darkMetal, x0 + 0.02, top, za - 0.01, x1 - 0.02, top + 0.03, zb + 0.01);
      const n = Math.max(1, Math.round((x1 - x0) / 0.5));
      const dw = (x1 - x0 - 0.08) / n;
      const fz = face > 0 ? zb : za;
      for (let i = 0; i < n; i++) {
        const a = x0 + 0.04 + i * dw;
        const ajar = face > 0 && i === 5;
        if (ajar) {
          // Одна дверца не закрыта: внутри темно и висит что-то.
          const ang = 0.9;
          const hx = a + 0.02;
          const len = dw - 0.04;
          kit.add(new BoxGeometry(1, 1, 1), L.lockerDoor, hx + Math.cos(ang) * len / 2, 1.0, fz + Math.sin(ang) * len / 2, len, 1.72, 0.02, 0, -ang);
          kit.box(m.void, a + 0.02, 0.16, fz - 0.4, a + dw - 0.02, 1.88, fz - 0.01);
          kit.box(m.fabric, a + 0.08, 0.9, fz - 0.3, a + dw - 0.08, 1.6, fz - 0.1);
          continue;
        }
        kit.box(L.lockerDoor, a + 0.02, 0.16, fz - 0.005 * face, a + dw - 0.02, 1.88, fz + 0.012 * face);
        for (let k = 0; k < 4; k++) {
          const y = 1.64 + k * 0.045;
          kit.box(m.void, a + 0.1, y, fz + 0.012 * face, a + dw - 0.1, y + 0.015, fz + 0.016 * face);
        }
        kit.box(m.metal, a + dw - 0.09, 0.95, fz + 0.012 * face, a + dw - 0.06, 1.12, fz + 0.04 * face);
        kit.box(m.paper, a + dw / 2 - 0.05, 1.45, fz + 0.012 * face, a + dw / 2 + 0.05, 1.5, fz + 0.016 * face);
      }
    }
    // Коробки на верху шкафов.
    kit.box(L.carton, x0 + 0.3, top + 0.03, z0 + 0.3, x0 + 0.85, top + 0.4, z0 + 0.8);
    kit.box(L.carton, x0 + 0.95, top + 0.03, z0 + 0.45, x0 + 1.35, top + 0.28, z0 + 0.9);
    kit.box(L.carton, x1 - 0.9, top + 0.03, z1 - 0.9, x1 - 0.3, top + 0.33, z1 - 0.35, 0.2);
  }

  /** Витрина на гранитном постаменте: в ней то, чем контора гордится. */
  function vitrine(x0: number, z0: number, x1: number, z1: number): void {
    const a = x0 + 0.15;
    const b = x1 - 0.15;
    const c = z0 + 0.2;
    const d = z1 - 0.2;
    kit.box(L.granite, a, 0, c, b, 0.78, d);
    kit.box(m.darkMetal, a + 0.05, 0, c + 0.05, b - 0.05, 0.06, d - 0.05);
    kit.box(L.felt, a + 0.02, 0.78, c + 0.02, b - 0.02, 0.8, d - 0.02);
    const top = 1.62;
    for (const [px, pz] of [[a, c], [b, c], [a, d], [b, d]] as const) {
      kit.box(m.metal, px - 0.02, 0.78, pz - 0.02, px + 0.02, top, pz + 0.02);
    }
    kit.box(m.metal, a - 0.02, top, c - 0.02, b + 0.02, top + 0.05, d + 0.02);
    kit.box(kit.flat(L.led), a + 0.05, top - 0.02, c + 0.05, b - 0.05, top, c + 0.09);
    kit.box(kit.flat(L.vitrine), a, 0.8, c, b, top, d);
    // Экспонаты: подшивки на пюпитрах, макет здания, латунные таблички.
    for (let i = 0; i < 3; i++) {
      const x = a + 0.45 + i * 0.6;
      kit.box(m.darkMetal, x - 0.02, 0.8, d - 0.45, x + 0.02, 0.98, d - 0.41);
      kit.add(new BoxGeometry(1, 1, 1), L.docs[i % L.docs.length] ?? m.paper, x, 1.02, d - 0.38, 0.32, 0.44, 0.01, -0.9);
      kit.box(L.brass, x - 0.1, 0.8, d - 0.12, x + 0.1, 0.83, d - 0.05);
    }
    // Макет: ступенчатый бетонный корпус — то самое здание, только целиком.
    const mx = b - 0.7;
    const mz = c + 0.6;
    kit.box(m.wall, mx - 0.35, 0.8, mz - 0.3, mx + 0.35, 1.0, mz + 0.3);
    kit.box(m.wall, mx - 0.25, 1.0, mz - 0.2, mx + 0.25, 1.22, mz + 0.2);
    kit.box(m.wall, mx - 0.12, 1.22, mz - 0.12, mx + 0.12, 1.45, mz + 0.12);
    for (let k = 0; k < 4; k++) kit.box(m.void, mx - 0.36, 0.84 + k * 0.04, mz - 0.25, mx - 0.35, 0.86 + k * 0.04, mz + 0.25);
  }

  /** Архив: стеллажи с подшивками, двусторонние. */
  function archive(x0: number, z0: number, x1: number, z1: number): void {
    const zc = (z0 + z1) / 2;
    const shelves = [0.1, 0.5, 0.9, 1.3, 1.7, 2.06];
    const bays = Math.max(1, Math.round(x1 - x0));
    const bw = (x1 - x0 - 0.1) / bays;
    for (let i = 0; i <= bays; i++) {
      const x = x0 + 0.05 + i * bw;
      kit.box(m.metal, x - 0.02, 0, z0 + 0.08, x + 0.02, 2.1, z1 - 0.08);
    }
    kit.box(m.metal, x0 + 0.05, 0, zc - 0.01, x1 - 0.05, 2.1, zc + 0.01);
    for (const y of shelves) kit.box(m.metal, x0 + 0.05, y, z0 + 0.08, x1 - 0.05, y + 0.025, z1 - 0.08);
    for (const [za, zb, face] of [[zc + 0.02, z1 - 0.1, 1], [z0 + 0.1, zc - 0.02, -1]] as const) {
      for (let s = 0; s < shelves.length - 1; s++) {
        const y = (shelves[s] ?? 0) + 0.025;
        for (let bay = 0; bay < bays; bay++) {
          let x = x0 + 0.08 + bay * bw;
          const end = x + bw - 0.06;
          while (x < end - 0.08) {
            const roll = rng.float();
            if (roll < 0.06) {
              x += 0.12 + rng.float() * 0.15;
              continue;
            }
            if (roll < 0.14) {
              const wBox = 0.28;
              if (x + wBox > end) break;
              kit.box(L.carton, x, y, za + 0.02, x + wBox, y + 0.27, zb - 0.02);
              kit.box(m.paper, x + 0.08, y + 0.1, face > 0 ? zb - 0.02 : za + 0.01, x + 0.2, y + 0.16, face > 0 ? zb - 0.01 : za + 0.02);
              x += wBox + 0.01;
              continue;
            }
            const bwid = 0.06 + rng.float() * 0.04;
            const bh = 0.27 + rng.float() * 0.08;
            const mat = L.binders[Math.floor(rng.float() * L.binders.length)] ?? m.paper;
            const lean = roll > 0.93 ? (rng.float() - 0.5) * 0.4 : 0;
            kit.add(new BoxGeometry(1, 1, 1), mat, x + bwid / 2 + lean * 0.3, y + bh / 2, (za + zb) / 2, bwid, bh, zb - za - 0.04, 0, 0, lean);
            if (rng.float() < 0.6 && lean === 0) {
              const fz = face > 0 ? zb - 0.02 : za + 0.02;
              kit.box(m.paper, x + 0.012, y + bh * 0.55, fz, x + bwid - 0.012, y + bh * 0.75, fz + 0.005 * face);
            }
            x += bwid + 0.004;
          }
        }
      }
    }
    // Верхняя полка: архивные коробки.
    for (let i = 0; i < bays * 2; i++) {
      const x = x0 + 0.1 + i * (bw / 2);
      if (rng.float() < 0.3) continue;
      kit.box(L.carton, x, 2.09, z0 + 0.15, x + bw / 2 - 0.05, 2.09 + 0.22 + rng.float() * 0.08, z1 - 0.15);
    }
  }

  /** Стойка приёма: ореховый фасад, гранитная столешница, рабочее место. */
  function reception(x0: number, z0: number, x1: number, z1: number): void {
    const front = z1 - 0.32;
    kit.box(m.darkMetal, x0 + 0.04, 0, front + 0.04, x1 - 0.04, 0.08, z1 - 0.04);
    kit.box(m.wood, x0, 0.08, front, x1, 1.06, z1);
    // Филёнки фасада.
    for (let x = x0 + 0.18; x < x1 - 0.2; x += 0.42) kit.box(m.wood, x, 0.18, z1, x + 0.34, 0.98, z1 + 0.015);
    kit.box(L.granite, x0 - 0.06, 1.06, front - 0.12, x1 + 0.06, 1.12, z1 + 0.08);
    kit.box(m.wood, x0, 0.08, z0 + 0.1, x0 + 0.3, 1.06, front);
    kit.box(L.granite, x0 - 0.06, 1.06, z0 + 0.05, x0 + 0.36, 1.12, front);
    // Табличка «приём» — латунь с чёрными строками.
    const cx = (x0 + x1) / 2;
    kit.box(L.brass, cx - 0.45, 0.72, z1 + 0.015, cx + 0.45, 0.9, z1 + 0.03);
    kit.box(m.void, cx - 0.36, 0.79, z1 + 0.03, cx + 0.36, 0.83, z1 + 0.034);
    // Рабочий стол за стойкой.
    kit.box(m.wood, x0 + 0.35, 0.72, z0 + 0.12, x1 - 0.08, 0.77, front - 0.04);
    kit.box(m.darkMetal, x1 - 0.55, 0, z0 + 0.15, x1 - 0.1, 0.72, front - 0.08);
    kit.box(m.darkMetal, x0 + 0.4, 0, z0 + 0.14, x0 + 0.44, 0.72, z0 + 0.18);
    // Терминал очереди на стойке, экраном к посетителям.
    const tx = x1 - 0.55;
    kit.box(L.plastic, tx - 0.24, 1.12, front - 0.1, tx + 0.24, 1.52, front + 0.28);
    kit.box(L.plastic, tx - 0.12, 1.12, front - 0.3, tx + 0.12, 1.4, front - 0.1);
    const screen = new Mesh(new PlaneGeometry(0.4, 0.3), L.screen);
    screen.position.set(tx, 1.32, front + 0.285);
    group.add(screen);
    owned.push(screen.geometry);
    ticks.push((t) => {
      L.screen.emissiveIntensity = 1.4 + Math.sin(t * 60) * 0.06 + (Math.sin(t * 2.3) > 0.97 ? -0.6 : 0);
      L.screenTex.offset.y = (t * 0.05) % 1;
    });
    // Бумаги, печать, телефон, звонок.
    for (let i = 0; i < 5; i++) {
      kit.add(new BoxGeometry(1, 1, 1), L.docs[i % L.docs.length] ?? m.paper, x0 + 0.9 + i * 0.07, 1.125 + i * 0.004, front + 0.05 + (i % 2) * 0.04, 0.3, 0.004, 0.42, 0, 0.1 * (i - 2));
    }
    kit.cyl(m.darkMetal, x0 + 1.55, 1.12, front + 0.08, 0.04, 0.06);
    kit.cyl(m.wood, x0 + 1.55, 1.18, front + 0.08, 0.018, 0.1);
    kit.sphere(L.brass, x0 + 1.85, 1.15, front + 0.12, 0.12, 0.08, 0.12);
    kit.box(L.rubber, x0 + 0.55, 0.77, z0 + 0.3, x0 + 0.85, 0.83, z0 + 0.52);
    kit.box(L.rubber, x0 + 0.52, 0.83, z0 + 0.32, x0 + 0.88, 0.87, z0 + 0.4);
    // Настольная лампа: тёплое пятно — единственный жёлтый свет в холле.
    const lx = x0 + 1.25;
    const lz = z0 + 0.35;
    kit.cyl(L.brass, lx, 0.77, lz, 0.08, 0.02);
    kit.tube(L.brass, new Vector3(lx, 0.79, lz), new Vector3(lx + 0.05, 1.12, lz + 0.12), 0.012);
    const shadeGeo = new CylinderGeometry(0.05, 0.13, 0.14, 18, 1, true);
    const shade = new Mesh(shadeGeo, L.shade);
    shade.position.set(lx + 0.08, 1.12, lz + 0.2);
    shade.rotation.x = 0.35;
    shade.castShadow = true;
    group.add(shade);
    owned.push(shadeGeo);
    L.shade.emissiveIntensity = 0.6;
    const warm = new PointLight(0xffc68a, 2.2, 4, 2);
    warm.position.set(lx + 0.1, 0.98, lz + 0.26);
    group.add(warm);
    // Кресло дежурного.
    chair(cx + 0.2, z0 + 0.62, Math.PI);
  }

  /** Кадка с фикусами и скамья вдоль неё. */
  function planter(x0: number, z0: number, x1: number, z1: number): void {
    const back = z1 - 0.5;
    kit.box(m.wall, x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 0.62, back);
    kit.box(L.granite, x0 + 0.02, 0.62, z0 + 0.02, x1 - 0.02, 0.66, z0 + 0.14);
    kit.box(L.granite, x0 + 0.02, 0.62, back - 0.12, x1 - 0.02, 0.66, back + 0.02);
    kit.box(L.granite, x0 + 0.02, 0.62, z0 + 0.14, x0 + 0.14, 0.66, back - 0.12);
    kit.box(L.granite, x1 - 0.14, 0.62, z0 + 0.14, x1 - 0.02, 0.66, back - 0.12);
    kit.box(L.soil, x0 + 0.14, 0.56, z0 + 0.14, x1 - 0.14, 0.6, back - 0.12);
    for (let i = 0; i < 40; i++) {
      kit.sphere(m.wall, x0 + 0.2 + rng.float() * (x1 - x0 - 0.4), 0.6, z0 + 0.2 + rng.float() * (back - z0 - 0.35), 0.06, 0.035, 0.05);
    }
    tree(x0 + 1.0, (z0 + back) / 2, 1.0);
    tree(x1 - 1.1, (z0 + back) / 2 + 0.05, 1.15);
    for (let k = 0; k < 3; k++) snake(x0 + 1.9 + k * 0.25, (z0 + back) / 2 + (k - 1) * 0.15);
    // Скамья: дубовые рейки на стальных опорах.
    for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) kit.box(m.darkMetal, x - 0.03, 0, back + 0.08, x + 0.03, 0.42, z1 - 0.06);
    for (let k = 0; k < 4; k++) {
      const z = back + 0.08 + k * 0.095;
      kit.box(m.wood, x0 + 0.15, 0.42, z, x1 - 0.15, 0.46, z + 0.08);
    }
  }

  function tree(x: number, z: number, scale: number): void {
    const pivot = new Group();
    pivot.position.set(x, 0.6, z);
    const k = new Kit(2);
    k.tube(m.wood, new Vector3(0, 0, 0), new Vector3(0.05, 0.9 * scale, 0.02), 0.03);
    k.tube(m.wood, new Vector3(0.03, 0.5 * scale, 0.01), new Vector3(-0.25, 1.0 * scale, 0.1), 0.018);
    k.tube(m.wood, new Vector3(0.04, 0.7 * scale, 0.01), new Vector3(0.28, 1.15 * scale, -0.08), 0.016);
    const mats = [L.leaf, L.leafDark, L.leafPale];
    // Крона — несколько облаков листвы, а не россыпь: так растёт фикус.
    const clumps = [
      [0, 1.25, 0, 0.42],
      [-0.25, 1.0, 0.1, 0.32],
      [0.28, 1.12, -0.08, 0.32],
      [0.05, 1.5, 0.05, 0.3],
    ] as const;
    for (const [cx, cy, cz, cr] of clumps) {
      for (let i = 0; i < 55; i++) {
        const u = rng.float() * Math.PI * 2;
        const vv = Math.acos(2 * rng.float() - 1);
        const r = cr * (0.55 + rng.float() * 0.45) * scale;
        const mat = mats[Math.floor(rng.float() * mats.length)] ?? L.leaf;
        k.add(
          new BoxGeometry(1, 1, 1),
          mat,
          cx * scale + Math.sin(vv) * Math.cos(u) * r,
          cy * scale + Math.cos(vv) * r * 0.7,
          cz * scale + Math.sin(vv) * Math.sin(u) * r,
          0.2,
          0.01,
          0.1,
          rng.float() * 1.2 - 0.6,
          u,
          rng.float() * 0.8 - 0.4,
        );
      }
    }
    for (const mesh of k.build(pivot)) owned.push(mesh.geometry);
    group.add(pivot);
    const phase = rng.float() * 10;
    ticks.push((t) => {
      pivot.rotation.z = Math.sin(t * 0.7 + phase) * 0.012;
      pivot.rotation.x = Math.sin(t * 0.53 + phase) * 0.01;
    });
  }

  function snake(x: number, z: number): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const h = 0.45 + rng.float() * 0.35;
      kit.add(new BoxGeometry(1, 1, 1), i % 2 === 0 ? L.leafDark : L.leafPale, x + Math.cos(a) * 0.05, 0.6 + h / 2, z + Math.sin(a) * 0.05, 0.07, h, 0.012, Math.sin(a) * 0.18, a, Math.cos(a) * 0.18);
    }
  }

  /** Зал ожидания: два ряда сцепленных кресел спинками друг к другу. */
  function waiting(x0: number, z0: number, x1: number, z1: number): void {
    const zc = (z0 + z1) / 2;
    const seats = Math.max(1, Math.floor((x1 - x0 - 0.9) / 0.62));
    const run = seats * 0.62;
    for (const [zr, face] of [[zc + 0.42, 1], [zc - 0.42, -1]] as const) {
      kit.box(m.darkMetal, x0 + 0.1, 0.22, zr - 0.03, x0 + 0.1 + run, 0.27, zr + 0.03);
      for (const x of [x0 + 0.2, x0 + run]) {
        kit.box(m.darkMetal, x - 0.03, 0, zr - 0.03, x + 0.03, 0.25, zr + 0.03);
        kit.box(m.darkMetal, x - 0.03, 0, zr - 0.25, x + 0.03, 0.03, zr + 0.25);
      }
      for (let i = 0; i < seats; i++) {
        const sx = x0 + 0.13 + i * 0.62;
        kit.box(L.seat, sx + 0.02, 0.4, zr - 0.22, sx + 0.58, 0.47, zr + 0.24);
        const bz = zr - 0.26 * face;
        kit.add(new BoxGeometry(1, 1, 1), L.seat, sx + 0.3, 0.72, bz, 0.56, 0.48, 0.06, 0.12 * face);
        kit.box(m.darkMetal, sx - 0.01, 0.27, zr - 0.02, sx + 0.02, 0.4, zr + 0.02);
        kit.box(m.metal, sx - 0.02, 0.58, zr - 0.2, sx + 0.03, 0.61, zr + 0.18);
      }
    }
    // Забытое: газета, плащ, портфель, стакан.
    kit.add(new BoxGeometry(1, 1, 1), L.docs[1] ?? m.paper, x0 + 0.45, 0.48, zc + 0.45, 0.34, 0.01, 0.46, 0, 0.4);
    kit.add(new BoxGeometry(1, 1, 1), m.fabric, x0 + 1.7, 0.6, zc - 0.42, 0.5, 0.25, 0.4, 0.3, 0.2);
    kit.box(m.wood, x0 + 1.15, 0, zc + 0.75, x0 + 1.55, 0.32, zc + 0.86);
    kit.cyl(m.paper, x0 + 2.55, 0.47, zc + 0.4, 0.04, 0.1);
    // Столик с журналами в торце.
    const tx = x1 - 0.42;
    kit.box(m.wood, tx - 0.3, 0.44, zc - 0.45, tx + 0.3, 0.48, zc + 0.45);
    kit.box(m.darkMetal, tx - 0.26, 0, zc - 0.41, tx - 0.22, 0.44, zc - 0.37);
    kit.box(m.darkMetal, tx + 0.22, 0, zc + 0.37, tx + 0.26, 0.44, zc + 0.41);
    kit.box(m.darkMetal, tx - 0.26, 0, zc + 0.37, tx - 0.22, 0.44, zc + 0.41);
    kit.box(m.darkMetal, tx + 0.22, 0, zc - 0.41, tx + 0.26, 0.44, zc - 0.37);
    for (let i = 0; i < 4; i++) {
      kit.add(new BoxGeometry(1, 1, 1), L.posters[i % L.posters.length] ?? m.paper, tx + (rng.float() - 0.5) * 0.25, 0.485 + i * 0.006, zc + (rng.float() - 0.5) * 0.4, 0.24, 0.005, 0.32, 0, rng.float() * 1.2);
    }
  }

  function chair(x: number, z: number, ry: number): void {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const at = (dx: number, dz: number): [number, number] => [x + dx * c + dz * s, z - dx * s + dz * c];
    kit.add(new BoxGeometry(1, 1, 1), L.seat, x, 0.48, z, 0.5, 0.08, 0.48, 0, ry);
    const [bx, bz] = at(0, -0.24);
    kit.add(new BoxGeometry(1, 1, 1), L.seat, bx, 0.8, bz, 0.48, 0.5, 0.07, -0.1, ry);
    kit.cyl(m.darkMetal, x, 0.08, z, 0.025, 0.4);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      kit.add(new BoxGeometry(1, 1, 1), m.darkMetal, x + Math.sin(a) * 0.15, 0.06, z + Math.cos(a) * 0.15, 0.04, 0.03, 0.3, 0, a);
      kit.sphere(L.rubber, x + Math.sin(a) * 0.29, 0.03, z + Math.cos(a) * 0.29, 0.05, 0.05, 0.05);
    }
  }

  // --- Стены: часы, доски объявлений, плакаты, огнетушители ---------------------------
  const midX = Number.isFinite(gx0) ? (gx0 + gx1) / 2 : W / 2;
  buildClock(midX, 2.62);
  kit.box(L.brass, midX - 0.6, 2.05, 1.0, midX + 0.6, 2.22, 1.03);
  kit.box(m.void, midX - 0.48, 2.12, 1.03, midX + 0.48, 2.15, 1.035);

  function buildClock(x: number, y: number): void {
    const z = 1.0;
    kit.add(new CylinderGeometry(0.5, 0.5, 1, 40), m.darkMetal, x, y, z + 0.04, 0.78, 0.08, 0.78, Math.PI / 2);
    const faceGeo = new CircleGeometry(0.34, 48);
    owned.push(faceGeo);
    const face = new Mesh(faceGeo, L.clock);
    face.position.set(x, y, z + 0.085);
    group.add(face);
    const hand = (len: number, width: number, depth: number): Group => {
      const pivot = new Group();
      pivot.position.set(x, y, z + 0.09 + depth);
      const geo = new BoxGeometry(width, len, 0.008);
      geo.translate(0, len / 2 - 0.03, 0);
      owned.push(geo);
      const mesh = new Mesh(geo, L.hand);
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    };
    const hourH = hand(0.2, 0.03, 0);
    const minH = hand(0.29, 0.02, 0.006);
    const secH = hand(0.31, 0.006, 0.012);
    ticks.push(() => {
      const d = new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const min = d.getMinutes() + sec / 60;
      const hr = (d.getHours() % 12) + min / 60;
      // Секундная идёт рывками, как на настоящих служебных часах.
      secH.rotation.z = -Math.floor(sec) / 60 * Math.PI * 2;
      minH.rotation.z = -min / 60 * Math.PI * 2;
      hourH.rotation.z = -hr / 12 * Math.PI * 2;
    });
  }

  /** Доска объявлений: пробка в раме, листки на кнопках. */
  function board(x: number, y: number, wd: number, ht: number): void {
    kit.box(m.wood, x - wd / 2 - 0.05, y - ht / 2 - 0.05, 1.0, x + wd / 2 + 0.05, y + ht / 2 + 0.05, 1.05);
    kit.box(L.cork, x - wd / 2, y - ht / 2, 1.05, x + wd / 2, y + ht / 2, 1.06);
    for (let i = 0; i < 7; i++) {
      const px = x - wd / 2 + 0.2 + rng.float() * (wd - 0.4);
      const py = y - ht / 2 + 0.22 + rng.float() * (ht - 0.44);
      const mat = L.docs[i % L.docs.length] ?? m.paper;
      kit.add(new BoxGeometry(1, 1, 1), mat, px, py, 1.065 + i * 0.002, 0.26, 0.36, 0.004, 0, 0, (rng.float() - 0.5) * 0.15);
      kit.sphere(i % 3 === 0 ? m.signLit : m.metal, px, py + 0.15, 1.075 + i * 0.002, 0.025, 0.025, 0.02);
    }
  }
  const gap = (a: number, b: number): number => (a + b) / 2;
  if (windows.length >= 4) {
    board(gap((windows[0] ?? 0) + WIN, (windows[1] ?? 0) - WIN), 1.75, 1.6, 0.9);
    board(gap((windows[2] ?? 0) + WIN, (windows[3] ?? 0) - WIN), 1.75, 1.6, 0.9);
    for (const px of [midX - 2.6, midX + 2.6]) {
      kit.box(m.darkMetal, px - 0.38, 1.25, 1.0, px + 0.38, 2.25, 1.03);
      kit.box(L.posters[px < midX ? 0 : 1] ?? m.paper, px - 0.34, 1.29, 1.03, px + 0.34, 2.21, 1.035);
    }
  }

  // Боковые стены: плакаты, пожарные шкафы, огнетушители, телефон.
  for (const [xf, s] of [[1.16, 1], [W - 1.16, -1]] as const) {
    const fx0 = Math.min(xf, xf + 0.05 * s);
    const fx1 = Math.max(xf, xf + 0.05 * s);
    // Пожарный шкаф: стальной, с остеклённой дверцей.
    kit.box(L.radiator, Math.min(xf, xf + 0.22 * s), 0.9, 7.1, Math.max(xf, xf + 0.22 * s), 1.75, 8.0);
    kit.box(kit.flat(L.vitrine), Math.min(xf + 0.22 * s, xf + 0.23 * s), 0.98, 7.18, Math.max(xf + 0.22 * s, xf + 0.23 * s), 1.67, 7.92);
    kit.cyl(L.rubber, xf + 0.12 * s, 1.12, 7.55, 0.18, 0.06, 0, Math.PI / 2);
    // Огнетушитель на кронштейне.
    kit.cyl(m.darkMetal, xf + 0.15 * s, 0.35, 12.5, 0.09, 0.55);
    kit.sphere(m.darkMetal, xf + 0.15 * s, 0.9, 12.5, 0.18, 0.1, 0.18);
    kit.box(m.metal, fx0, 0.6, 12.45, fx1, 0.68, 12.55);
    // Плакаты между пилястрами.
    kit.box(m.darkMetal, fx0, 1.3, 2.4, fx1, 2.3, 3.2);
    kit.box(L.posters[2] ?? m.paper, Math.min(xf + 0.05 * s, xf + 0.055 * s), 1.34, 2.44, Math.max(xf + 0.05 * s, xf + 0.055 * s), 2.26, 3.16);
    kit.box(m.darkMetal, fx0, 1.3, 16.6, fx1, 2.3, 17.4);
    kit.box(L.posters[s > 0 ? 0 : 1] ?? m.paper, Math.min(xf + 0.05 * s, xf + 0.055 * s), 1.34, 16.64, Math.max(xf + 0.05 * s, xf + 0.055 * s), 2.26, 17.36);
  }
  // Телефон-автомат на левой стене и пневмопочта на правой.
  kit.box(L.plastic, 1.16, 1.2, 13.6, 1.4, 1.75, 14.0);
  kit.box(L.rubber, 1.4, 1.42, 13.68, 1.47, 1.68, 13.76);
  for (const zt of [13.5, 13.75]) kit.cyl(L.brass, W - 1.3, 0, zt, 0.06, H);
  kit.box(L.brass, W - 1.5, 1.0, 13.35, W - 1.16, 1.5, 13.9);
  kit.box(m.void, W - 1.51, 1.1, 13.45, W - 1.5, 1.4, 13.8);

  // Кадки с высокими растениями в дальних углах.
  for (const [px, pz] of [[1.55, 1.6], [W - 1.55, 1.6]] as const) {
    kit.cyl(L.pot, px, 0, pz, 0.32, 0.55);
    kit.cyl(L.soil, px, 0.5, pz, 0.28, 0.04);
    for (let k = 0; k < 3; k++) snake(px + (k - 1) * 0.12, pz + (k % 2) * 0.1);
  }
  // Ведро уборщицы и складной знак у правой стены: здесь моют пол.
  const bx = W - 1.7;
  const bz = D - 2.6;
  kit.cyl(L.radiator, bx, 0, bz, 0.2, 0.32);
  kit.tube(m.wood, new Vector3(bx + 0.05, 0.25, bz), new Vector3(bx + 0.25, 1.4, bz - 0.1), 0.02);
  kit.add(new BoxGeometry(1, 1, 1), m.signLit, bx - 0.55, 0.32, bz + 0.1, 0.32, 0.62, 0.02, -0.25, 0.3);
  kit.add(new BoxGeometry(1, 1, 1), m.signLit, bx - 0.55, 0.32, bz + 0.22, 0.32, 0.62, 0.02, 0.25, 0.3);
  // Мокрое пятно под ним — пол здесь блестит сильнее.
  const wet = new Mesh(new CircleGeometry(0.9, 32), new MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(bx - 0.5, 0.003, bz + 0.3);
  wet.scale.set(1.3, 0.8, 1);
  group.add(wet);
  owned.push(wet.geometry, wet.material as Material);
  // Пара упавших листов.
  for (let i = 0; i < 4; i++) {
    kit.add(new BoxGeometry(1, 1, 1), L.docs[i % L.docs.length] ?? m.paper, 4 + rng.float() * 26, 0.004, 5 + rng.float() * 12, 0.3, 0.003, 0.42, 0, rng.float() * Math.PI);
  }

  // --- Потолок, держащий солнце ------------------------------------------------------
  const ceilGeo = new BoxGeometry(W + 2, 0.2, D + 2);
  owned.push(ceilGeo);
  const ceiling = new Mesh(ceilGeo, L.ceiling);
  ceiling.position.set(W / 2, H + 0.12, D / 2);
  ceiling.castShadow = true;
  ceiling.renderOrder = -1;
  group.add(ceiling);
  aoHidden.push(ceiling);

  // --- Верхний свет с тенью ------------------------------------------------------------
  // Светильники-панели теней не дают, а без теней мебель висит над полом.
  // Два широких прожектора под потолком кладут под каждый предмет мягкое пятно.
  const fills: SpotLight[] = [];
  // Прожекторы стоят ровно в панелях заднего ряда: блик от них на полу
  // совпадает с отражением самой панели и не висит в пустоте.
  for (const px of [W * 0.3, W * 0.7]) {
    const spot = new SpotLight(0xf3f6fa, TUNING.lobby3d.fill, 0, 1.3, 1, 2);
    spot.position.set(px, H - 0.08, D * 0.34);
    spot.target.position.set(px, 0, D * 0.62);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.radius = 8;
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = H + 2;
    group.add(spot, spot.target);
    fills.push(spot);
  }

  // --- Светильники под потолком -------------------------------------------------------
  const areas: RectAreaLight[] = [];
  const panelGeo = new PlaneGeometry(3.0, 0.7);
  owned.push(panelGeo);
  const panelMat = new MeshBasicMaterial({ color: 0xf4f7fb, side: DoubleSide });
  owned.push(panelMat);
  for (const px of [W * 0.3, W * 0.7]) {
    for (const pz of [D * 0.34, D * 0.72]) {
      const light = new RectAreaLight(0xf1f5fa, TUNING.lobby3d.area, 3.0, 0.7);
      light.position.set(px, H - 0.05, pz);
      light.lookAt(px, 0, pz);
      group.add(light);
      areas.push(light);
      // Сама панель видна только в отражении пола: камера смотрит сверху.
      const panel = new Mesh(panelGeo, panelMat);
      panel.position.set(px, H - 0.04, pz);
      panel.rotation.x = Math.PI / 2;
      panel.layers.set(2);
      group.add(panel);
    }
  }

  // --- Лучи из окон: объём воздуха от проёма до пятна на полу ----------------------------
  const shafts: { mesh: Mesh; c: number; mat: ShaderMaterial }[] = [];
  for (const c of windows) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(8 * 3), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(8 * 3), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0]), 2));
    // Четыре боковые грани призмы: верх (0–3) — проём, низ (4–7) — пятно.
    geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    const mat = beamMaterial(0xfff1dc, TUNING.lobby3d.shafts);
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    fx.add(mesh);
    owned.push(geo, mat);
    shafts.push({ mesh, c, mat });
  }
  const updateShafts = (time: number): void => {
    const cfg = TUNING.lobby3d;
    const az = (cfg.sunAzimuth * Math.PI) / 180;
    const el = (cfg.sunElevation * Math.PI) / 180;
    // Куда идёт свет: от солнца в помещение.
    const dx = -Math.sin(az) * Math.cos(el);
    const dy = -Math.sin(el);
    const dz = Math.cos(az) * Math.cos(el);
    for (const s of shafts) {
      const x0 = s.c - WIN + 0.05;
      const x1 = s.c + WIN - 0.05;
      const top = [
        [x0, HEAD - 0.05, 0.5],
        [x1, HEAD - 0.05, 0.5],
        [x1, SILL + 0.05, 0.5],
        [x0, SILL + 0.05, 0.5],
      ];
      const pos = s.mesh.geometry.getAttribute('position') as BufferAttribute;
      top.forEach(([x, y, z], i) => {
        const t = (y ?? 0) / -dy;
        pos.setXYZ(i, x ?? 0, y ?? 0, z ?? 0);
        pos.setXYZ(i + 4, (x ?? 0) + dx * t, 0.01, (z ?? 0) + dz * t);
      });
      pos.needsUpdate = true;
      s.mesh.geometry.computeVertexNormals();
      const u = s.mat.uniforms as Record<string, { value: number }>;
      if (u['uIntensity'] !== undefined) u['uIntensity'].value = cfg.shafts;
      if (u['uTime'] !== undefined) u['uTime'].value = time;
    }
  };
  ticks.push(updateShafts);
  ticks.push(() => {
    L.frosted.emissiveIntensity = TUNING.lobby3d.window;
    for (const a of areas) a.intensity = TUNING.lobby3d.area;
    for (const f of fills) f.intensity = TUNING.lobby3d.fill;
  });

  meshes.push(...kit.build(group));
  for (const mesh of meshes) owned.push(mesh.geometry);
  // Стены отбрасывают тень обеими сторонами: солнце светит им в спину.
  L.plaster.shadowSide = DoubleSide;

  return {
    group,
    fx,
    lamps: [],
    warm: true,
    floors: [floorMesh],
    aoHidden,
    look: () => ({
      sun: {
        az: TUNING.lobby3d.sunAzimuth,
        el: TUNING.lobby3d.sunElevation,
        intensity: TUNING.lobby3d.sun,
        color: TUNING.lobby3d.sunColor,
      },
      sky: TUNING.lobby3d.sky,
      env: TUNING.lobby3d.env,
      exposure: TUNING.lobby3d.exposure,
    }),
    tick(time) {
      for (const t of ticks) t(time);
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

