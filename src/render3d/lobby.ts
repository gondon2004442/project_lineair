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
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RectAreaLight,
  SpotLight,
  Vector3,
  type Material,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import type { World } from '../ecs';
import { TILE_GATE, TILE_WALL } from '../room';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { beamMaterial } from './beam';
import { GeoBuilder } from './geo';
import { Kit } from './kit';
import type { Materials } from './materials';
import type { RoomView } from './room';
import { archive, board, buildClock, lockers, planter, propMats, reception, snake, vitrine, waiting, type Ctx } from './furnish';

export function buildLobby(w: World, m: Materials): RoomView {
  const v = TUNING.view3d;
  const L = propMats();
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
  const ctx: Ctx = { kit, m, L, rng, group, owned, ticks };

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
  blocks.forEach((b, i) => (builders[i] ?? reception)(ctx, b.x0, b.z0, b.x1, b.z1));

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










  // --- Стены: часы, доски объявлений, плакаты, огнетушители ---------------------------
  const midX = Number.isFinite(gx0) ? (gx0 + gx1) / 2 : W / 2;
  buildClock(ctx, midX, 2.62);
  kit.box(L.brass, midX - 0.6, 2.05, 1.0, midX + 0.6, 2.22, 1.03);
  kit.box(m.void, midX - 0.48, 2.12, 1.03, midX + 0.48, 2.15, 1.035);


  const gap = (a: number, b: number): number => (a + b) / 2;
  if (windows.length >= 4) {
    board(ctx, gap((windows[0] ?? 0) + WIN, (windows[1] ?? 0) - WIN), 1.75, 1.6, 0.9);
    board(ctx, gap((windows[2] ?? 0) + WIN, (windows[3] ?? 0) - WIN), 1.75, 1.6, 0.9);
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
    for (let k = 0; k < 3; k++) snake(ctx, px + (k - 1) * 0.12, pz + (k % 2) * 0.1);
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

