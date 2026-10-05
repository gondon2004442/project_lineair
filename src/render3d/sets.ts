/**
 * НАБОРЫ УРОВНЕЙ. Сборщики обстановки для этажей: буфет и приёмная
 * холла, картотека и машбюро головного офиса, котлы бойлерной, монолиты
 * натурной части, ряды картотеки, узел связи.
 *
 * Правило то же, что у вестибюля: сборщик получает прямоугольник клеток,
 * который в симуляции сплошной, и не выходит за него.
 */
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  TorusGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import { PALETTE } from '../palette';
import type { Ctx } from './furnish';
import { meshTex, portraitTex } from './textures';
import type { Theme } from './themes';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const BOX = new BoxGeometry(1, 1, 1);

// --- Свои материалы набора: создаются один раз ------------------------------

interface SetMats {
  steel: MeshStandardMaterial;
  well: MeshStandardMaterial;
  food: MeshStandardMaterial[];
  plate: MeshStandardMaterial;
  oak: MeshStandardMaterial;
  copier: MeshStandardMaterial;
  copierLid: MeshStandardMaterial;
  scan: MeshStandardMaterial;
  button: MeshStandardMaterial;
  fabricPanel: MeshStandardMaterial;
  enamel: MeshStandardMaterial;
  jack: MeshStandardMaterial;
  lamps: MeshStandardMaterial[];
  cable: MeshStandardMaterial;
  boiler: MeshStandardMaterial;
  insulation: MeshStandardMaterial;
  fire: MeshStandardMaterial;
  gauge: MeshStandardMaterial;
  valve: MeshStandardMaterial;
  pipe: MeshStandardMaterial;
  motor: MeshStandardMaterial;
  cage: MeshStandardMaterial;
  cageLamp: MeshStandardMaterial;
  monolith: MeshStandardMaterial;
  line: MeshStandardMaterial;
  greyCab: MeshStandardMaterial;
  greyDrawer: MeshStandardMaterial;
  door: MeshStandardMaterial;
  portraits: MeshStandardMaterial[];
  frame: MeshStandardMaterial;
  sconce: MeshStandardMaterial;
  rug: MeshStandardMaterial;
  rugWarm: MeshStandardMaterial;
  rugEdge: MeshStandardMaterial;
}

let cached: SetMats | null = null;

function std(color: number, rough: number, metal = 0, extra: Record<string, unknown> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  Object.assign(m, extra);
  return m;
}

export function setMats(): SetMats {
  if (cached !== null) return cached;
  const mesh = meshTex();
  cached = {
    steel: std(0xc3c7cb, 0.28, 0.9),
    well: std(0x26292c, 0.4, 0.8),
    food: [std(0x8a6a3e, 0.6), std(0xb9a77a, 0.7), std(0x6b7a4a, 0.7), std(0xd8cfb8, 0.5)],
    plate: std(0xe7e5df, 0.3),
    oak: std(0x7a5a38, 0.55),
    copier: std(0xbdb7a6, 0.55),
    copierLid: std(0x2a2d30, 0.3, 0.2),
    scan: std(0xffffff, 0.3, 0, { emissive: new Color(0xd6f2ff), emissiveIntensity: 0 }),
    button: std(0x2f6f3f, 0.4, 0, { emissive: new Color(0x6dff8a), emissiveIntensity: 1.2 }),
    fabricPanel: std(0x5b6168, 0.95),
    enamel: std(0x6a7069, 0.5, 0.3),
    jack: std(0x121314, 0.5, 0.4),
    lamps: [
      std(0x3a2a10, 0.4, 0, { emissive: new Color(0xffb347), emissiveIntensity: 2 }),
      std(0x10301a, 0.4, 0, { emissive: new Color(0x7dff9a), emissiveIntensity: 2 }),
      std(0x303030, 0.4, 0, { emissive: new Color(0xf2f2e8), emissiveIntensity: 2 }),
    ],
    cable: std(0x111214, 0.7),
    boiler: std(0x3f4a44, 0.5, 0.5),
    insulation: std(0x9c9a92, 0.85),
    fire: std(0x301005, 0.5, 0, { emissive: new Color(0xff7a28), emissiveIntensity: 2.5 }),
    gauge: std(0xe7e3d6, 0.3),
    valve: std(0x2b3a52, 0.45, 0.6),
    pipe: std(0x5d625f, 0.45, 0.7),
    motor: std(0x46607a, 0.45, 0.4),
    cage: std(0xb9bec2, 0.5, 0.6, { map: mesh, alphaMap: mesh, transparent: true, alphaTest: 0.4, side: DoubleSide }),
    cageLamp: std(0x3a3020, 0.4, 0, { emissive: new Color(0xffc477), emissiveIntensity: 3 }),
    monolith: std(0x050506, 0.45, 0.0, { envMapIntensity: 0.05 }),
    line: std(PALETTE.yellow, 0.6, 0, { emissive: new Color(PALETTE.yellow), emissiveIntensity: 0.2 }),
    greyCab: std(0x7c8483, 0.5, 0.45),
    greyDrawer: std(0x8d9594, 0.45, 0.45),
    door: std(0x5a3f26, 0.5),
    portraits: [0, 1, 2].map((i) => std(0xffffff, 0.75, 0, { map: portraitTex(i) })),
    frame: std(0xa98446, 0.35, 0.8),
    sconce: std(0xfff1d6, 0.4, 0, { emissive: new Color(0xffd9a0), emissiveIntensity: 2.2 }),
    rug: std(0x5d666b, 0.95),
    rugWarm: std(0x6e5640, 0.95),
    rugEdge: std(0x2c3033, 0.95),
  };
  return cached;
}

// --- Холл: буфет и приёмная --------------------------------------------------

/** Раздача: стальной прилавок с мармитами и стеклом от дыхания. */
export function buffetCounter(c: Ctx, r: Rect): void {
  const S = setMats();
  const { kit, L } = c;
  const a = r.x0 + 0.08;
  const b = r.x1 - 0.08;
  const front = r.z1 - 0.1;
  const back = r.z0 + 0.4;
  kit.box(c.m.darkMetal, a + 0.05, 0, back + 0.05, b - 0.05, 0.12, front - 0.05);
  kit.box(S.steel, a, 0.12, back, b, 0.92, front);
  kit.box(S.steel, a - 0.02, 0.92, back - 0.02, b + 0.02, 0.95, front + 0.02);
  // Направляющая для подносов со стороны очереди.
  for (const y of [0.78, 0.86]) kit.box(S.steel, a, y, front + 0.02, b, y + 0.02, front + 0.22);
  const n = Math.max(2, Math.floor((b - a) / 0.62));
  const w = (b - a - 0.1) / n;
  for (let i = 0; i < n; i++) {
    const x = a + 0.05 + i * w;
    kit.box(S.well, x + 0.03, 0.86, back + 0.15, x + w - 0.03, 0.951, front - 0.15);
    const food = S.food[i % S.food.length] ?? S.plate;
    kit.box(food, x + 0.06, 0.88, back + 0.18, x + w - 0.06, 0.93, front - 0.18);
  }
  // Стекло на стойках.
  for (const x of [a + 0.1, (a + b) / 2, b - 0.1]) kit.box(S.steel, x - 0.015, 0.95, front - 0.25, x + 0.015, 1.45, front - 0.22);
  kit.add(BOX, kit.flat(L.vitrine), (a + b) / 2, 1.4, front - 0.1, b - a - 0.1, 0.01, 0.4, -0.5);
  // Стопки тарелок и подносов на заднем краю.
  for (let k = 0; k < 3; k++) kit.cyl(S.plate, a + 0.3 + k * 0.4, 0.95, back + 0.15, 0.13, 0.12);
  kit.box(c.m.darkMetal, b - 0.6, 0.95, back + 0.05, b - 0.15, 1.05, back + 0.4);
}

/** Длинный стол столовой: скамьи по сторонам, подносы, стаканы. */
export function canteenTable(c: Ctx, r: Rect): void {
  const S = setMats();
  const { kit, rng } = c;
  const zc = (r.z0 + r.z1) / 2;
  const a = r.x0 + 0.1;
  const b = r.x1 - 0.1;
  kit.box(S.oak, a, 0.74, zc - 0.42, b, 0.79, zc + 0.42);
  for (const x of [a + 0.25, b - 0.25]) {
    kit.box(c.m.darkMetal, x - 0.03, 0, zc - 0.35, x + 0.03, 0.74, zc - 0.3);
    kit.box(c.m.darkMetal, x - 0.03, 0, zc + 0.3, x + 0.03, 0.74, zc + 0.35);
    kit.box(c.m.darkMetal, x - 0.03, 0.1, zc - 0.35, x + 0.03, 0.14, zc + 0.35);
  }
  for (const zb of [zc - 0.72, zc + 0.72]) {
    kit.box(S.oak, a + 0.1, 0.44, zb - 0.16, b - 0.1, 0.48, zb + 0.16);
    for (const x of [a + 0.3, b - 0.3]) kit.box(c.m.darkMetal, x - 0.03, 0, zb - 0.12, x + 0.03, 0.44, zb + 0.12);
  }
  for (let x = a + 0.4; x < b - 0.3; x += 0.75) {
    if (rng.float() < 0.35) continue;
    const side = rng.float() < 0.5 ? -1 : 1;
    kit.box(c.m.darkMetal, x - 0.2, 0.79, zc + side * 0.18 - 0.14, x + 0.2, 0.805, zc + side * 0.18 + 0.14);
    kit.cyl(S.plate, x - 0.05, 0.805, zc + side * 0.18, 0.1, 0.02);
    kit.cyl(c.L.vitrine, x + 0.12, 0.805, zc + side * 0.18 - 0.05, 0.035, 0.11);
  }
}

// --- Головной офис -------------------------------------------------------------

/** Каталожный шкаф: дубовые ящички с латунными рамками на обеих сторонах. */
export function cardCatalog(c: Ctx, r: Rect): void {
  const S = setMats();
  const { kit, L } = c;
  const top = 1.32;
  const a = r.x0 + 0.06;
  const b = r.x1 - 0.06;
  kit.box(c.m.darkMetal, a + 0.05, 0, r.z0 + 0.12, b - 0.05, 0.1, r.z1 - 0.12);
  kit.box(S.oak, a, 0.1, r.z0 + 0.08, b, top, r.z1 - 0.08);
  kit.box(S.oak, a - 0.03, top, r.z0 + 0.05, b + 0.03, top + 0.04, r.z1 - 0.05);
  const cols = Math.max(1, Math.round((b - a) / 0.3));
  const dw = (b - a) / cols;
  const rows = 6;
  const dh = (top - 0.18) / rows;
  for (const [fz, s] of [[r.z1 - 0.08, 1], [r.z0 + 0.08, -1]] as const) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = a + i * dw;
        const y = 0.15 + j * dh;
        kit.box(c.m.wood, x + 0.012, y + 0.01, Math.min(fz, fz + 0.012 * s), x + dw - 0.012, y + dh - 0.01, Math.max(fz, fz + 0.012 * s));
        kit.box(L.brass, x + dw / 2 - 0.05, y + dh * 0.62, Math.min(fz + 0.012 * s, fz + 0.016 * s), x + dw / 2 + 0.05, y + dh * 0.82, Math.max(fz + 0.012 * s, fz + 0.016 * s));
        kit.sphere(L.brass, x + dw / 2, y + dh * 0.35, fz + 0.02 * s, 0.03, 0.03, 0.03);
      }
    }
  }
  // На крышке — выдвинутый ящик и карточки.
  kit.box(c.m.wood, a + 0.4, top + 0.04, (r.z0 + r.z1) / 2 - 0.2, a + 0.7, top + 0.14, (r.z0 + r.z1) / 2 + 0.25);
  for (let k = 0; k < 5; k++) kit.box(c.m.paper, a + 0.42, top + 0.06, (r.z0 + r.z1) / 2 - 0.15 + k * 0.08, a + 0.68, top + 0.2, (r.z0 + r.z1) / 2 - 0.146 + k * 0.08);
}

/** Копировальный аппарат: светит полоса развёртки под крышкой. */
export function copier(c: Ctx, r: Rect): void {
  const S = setMats();
  const { kit } = c;
  const a = r.x0 + 0.2;
  const b = r.x1 - 0.2;
  const z0 = r.z0 + 0.3;
  const z1 = r.z1 - 0.25;
  kit.box(c.m.darkMetal, a + 0.05, 0, z0 + 0.05, b - 0.05, 0.08, z1 - 0.05);
  kit.box(S.copier, a, 0.08, z0, b, 0.95, z1);
  for (let k = 0; k < 3; k++) {
    const y = 0.15 + k * 0.22;
    kit.box(S.copier, a + 0.05, y, z1, b - 0.05, y + 0.18, z1 + 0.02);
    kit.box(c.m.darkMetal, (a + b) / 2 - 0.15, y + 0.13, z1 + 0.02, (a + b) / 2 + 0.15, y + 0.15, z1 + 0.04);
  }
  kit.box(S.copierLid, a + 0.05, 0.95, z0 + 0.05, b - 0.35, 1.0, z1 - 0.05);
  // Пульт и лоток выдачи.
  kit.box(S.copier, b - 0.35, 0.95, z0 + 0.1, b - 0.05, 1.02, z1 - 0.1);
  for (let k = 0; k < 4; k++) kit.box(kit.flat(S.button), b - 0.3 + (k % 2) * 0.12, 1.02, z1 - 0.35 + Math.floor(k / 2) * 0.1, b - 0.22 + (k % 2) * 0.12, 1.03, z1 - 0.3 + Math.floor(k / 2) * 0.1);
  kit.box(S.copier, a - 0.25, 0.62, z0 + 0.2, a, 0.65, z1 - 0.2);
  kit.box(c.m.paper, a - 0.22, 0.65, z0 + 0.3, a - 0.02, 0.69, z1 - 0.3);
  // Полоса развёртки: бегает под крышкой туда и обратно.
  const geo = new BoxGeometry(0.05, 0.01, z1 - z0 - 0.2);
  c.owned.push(geo);
  const bar = new Mesh(geo, S.scan);
  bar.position.set(a + 0.1, 0.975, (z0 + z1) / 2);
  c.group.add(bar);
  const span = b - a - 0.55;
  const phase = c.rng.float() * 10;
  c.ticks.push((t) => {
    const k = (t * 0.35 + phase) % 1;
    const on = Math.sin((t + phase) * 0.7) > 0.2;
    bar.position.x = a + 0.1 + (k < 0.5 ? k * 2 : 2 - k * 2) * span;
    S.scan.emissiveIntensity = on ? 3 : 0;
  });
}

/**
 * Клетка машбюро: стол, тканевая перегородка посередине, машинка или
 * бумаги. Ставится по клетке, чтобы разбитая часть ряда исчезала по одной.
 */
export function cubicleCell(c: Ctx, cx: number, cz: number, horizontal: boolean, hp: number): void {
  const S = setMats();
  const { kit, rng, m, L } = c;
  const H = 1.2;
  const th = 0.05;
  if (horizontal) {
    kit.box(c.m.darkMetal, cx, 0, cz + 0.5 - th - 0.02, cx + 1, 0.06, cz + 0.5 + th + 0.02);
    kit.box(S.fabricPanel, cx + 0.01, 0.06, cz + 0.5 - th, cx + 0.99, H * hp, cz + 0.5 + th);
    kit.box(m.metal, cx, H * hp, cz + 0.5 - th - 0.01, cx + 1, H * hp + 0.03, cz + 0.5 + th + 0.01);
    for (const s of [-1, 1]) {
      const zf = cz + 0.5 + s * (th + 0.22);
      kit.box(S.oak, cx + 0.03, 0.72, Math.min(zf - 0.2, zf + 0.2), cx + 0.97, 0.76, Math.max(zf - 0.2, zf + 0.2));
      kit.box(m.darkMetal, cx + 0.06, 0, zf - 0.02, cx + 0.1, 0.72, zf + 0.02);
      deskItems(c, cx + 0.5, 0.76, zf, rng.float());
    }
  } else {
    kit.box(c.m.darkMetal, cx + 0.5 - th - 0.02, 0, cz, cx + 0.5 + th + 0.02, 0.06, cz + 1);
    kit.box(S.fabricPanel, cx + 0.5 - th, 0.06, cz + 0.01, cx + 0.5 + th, H * hp, cz + 0.99);
    kit.box(m.metal, cx + 0.5 - th - 0.01, H * hp, cz, cx + 0.5 + th + 0.01, H * hp + 0.03, cz + 1);
    for (const s of [-1, 1]) {
      const xf = cx + 0.5 + s * (th + 0.22);
      kit.box(S.oak, Math.min(xf - 0.2, xf + 0.2), 0.72, cz + 0.03, Math.max(xf - 0.2, xf + 0.2), 0.76, cz + 0.97);
      deskItems(c, xf, 0.76, cz + 0.5, rng.float());
    }
  }
  void L;
}

function deskItems(c: Ctx, x: number, y: number, z: number, roll: number): void {
  const { kit, m, L } = c;
  if (roll < 0.4) {
    // Печатная машинка с листом.
    kit.box(m.darkMetal, x - 0.18, y, z - 0.12, x + 0.18, y + 0.1, z + 0.12);
    kit.add(BOX, L.rubber, x, y + 0.12, z + 0.04, 0.32, 0.03, 0.12, 0.3);
    kit.add(BOX, m.paper, x, y + 0.2, z - 0.1, 0.24, 0.2, 0.004, -0.2);
  } else if (roll < 0.7) {
    for (let k = 0; k < 3; k++) kit.add(BOX, L.docs[k % L.docs.length] ?? m.paper, x + (k - 1) * 0.06, y + 0.005 + k * 0.004, z, 0.22, 0.003, 0.3, 0, 0.2 * (k - 1));
    kit.cyl(L.plastic, x + 0.25, y, z - 0.08, 0.04, 0.09);
  } else {
    kit.box(L.rubber, x - 0.1, y, z - 0.08, x + 0.1, y + 0.06, z + 0.08);
    kit.box(L.rubber, x - 0.12, y + 0.06, z - 0.06, x + 0.12, y + 0.09, z - 0.02);
  }
}

// --- Узел связи ----------------------------------------------------------------

/** Коммутаторная стойка: гнёзда, мигающие лампы, кабели сверху. */
export function switchboard(c: Ctx, r: Rect): void {
  const S = setMats();
  const { kit, rng } = c;
  const a = r.x0 + 0.1;
  const b = r.x1 - 0.1;
  const z0 = r.z0 + 0.1;
  const z1 = r.z1 - 0.1;
  const top = 2.15;
  kit.box(c.m.darkMetal, a + 0.04, 0, z0 + 0.04, b - 0.04, 0.1, z1 - 0.04);
  kit.box(S.enamel, a, 0.1, z0, b, top, z1);
  kit.box(c.m.darkMetal, a - 0.02, top, z0 - 0.02, b + 0.02, top + 0.06, z1 + 0.02);
  // Наклонная полка-стол с гнёздами на южной стороне.
  kit.add(BOX, S.enamel, (a + b) / 2, 0.85, z1 + 0.12, b - a, 0.05, 0.3, 0.35);
  for (const [fz, s] of [[z1, 1], [z0, -1]] as const) {
    const cols = Math.floor((b - a - 0.2) / 0.08);
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < cols; col++) {
        const x = a + 0.12 + col * 0.08;
        const y = 1.0 + row * 0.11;
        if (row % 3 === 0) {
          if (rng.float() < 0.55) {
            const mat = S.lamps[Math.floor(rng.float() * S.lamps.length)] ?? S.lamps[0];
            if (mat !== undefined) kit.sphere(kit.flat(mat), x, y, fz + 0.012 * s, 0.035, 0.035, 0.02);
          }
          continue;
        }
        kit.box(S.jack, x - 0.018, y - 0.018, Math.min(fz, fz + 0.01 * s), x + 0.018, y + 0.018, Math.max(fz, fz + 0.01 * s));
      }
    }
  }
  // Шнуры: свисают с полки в гнёзда.
  for (let k = 0; k < 6; k++) {
    const x = a + 0.2 + rng.float() * (b - a - 0.4);
    const p0 = new Vector3(x, 0.9, z1 + 0.2);
    const p1 = new Vector3(x + (rng.float() - 0.5) * 0.3, 0.55, z1 + 0.28);
    const p2 = new Vector3(x + (rng.float() - 0.5) * 0.4, 1.05 + rng.float() * 0.8, z1 + 0.01);
    kit.tube(S.cable, p0, p1, 0.01);
    kit.tube(S.cable, p1, p2, 0.01);
  }
  // Кабельные жгуты в потолок.
  for (let k = 0; k < 4; k++) {
    kit.cyl(S.cable, a + 0.2 + k * ((b - a - 0.4) / 3), top + 0.06, (z0 + z1) / 2, 0.05, 2.5);
  }
  // Мигание: три материала гаснут вразнобой.
  c.ticks.push((t) => {
    S.lamps.forEach((mat, i) => {
      const v = Math.sin(t * (1.3 + i * 0.7) + i * 2.1);
      mat.emissiveIntensity = v > 0.3 ? 2.4 : v > -0.2 ? 0.9 : 0.15;
    });
  });
}

// --- Бойлерная -----------------------------------------------------------------

/** Котёл: лежачий цилиндр на ложементах, горелка с огнём в глазке. */
export function boilerUnit(c: Ctx, r: Rect, H: number): void {
  const S = setMats();
  const { kit, rng } = c;
  const long = r.x1 - r.x0 >= r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const len = (long ? r.x1 - r.x0 : r.z1 - r.z0) - 0.7;
  const rad = Math.min(0.85, (long ? r.z1 - r.z0 : r.x1 - r.x0) / 2 - 0.08);
  const y = rad + 0.25;
  const rz = long ? Math.PI / 2 : 0;
  const rx = long ? 0 : Math.PI / 2;
  // Ложементы.
  for (const t of [-0.35, 0.35]) {
    const px = long ? cx + t * len : cx;
    const pz = long ? cz : cz + t * len;
    kit.box(c.m.wall, px - (long ? 0.15 : rad), 0, pz - (long ? rad : 0.15), px + (long ? 0.15 : rad), y - rad * 0.4, pz + (long ? rad : 0.15));
  }
  kit.add(cylGeo(), S.insulation, cx, y, cz, rad * 2, len, rad * 2, rx, 0, rz);
  // Бандажи на изоляции.
  for (let k = 0; k <= 4; k++) {
    const t = -len / 2 + (k * len) / 4;
    kit.add(cylGeo(), c.m.metal, long ? cx + t : cx, y, long ? cz : cz + t, rad * 2.04, 0.05, rad * 2.04, rx, 0, rz);
  }
  // Днища.
  for (const s of [-1, 1]) {
    kit.sphere(S.boiler, long ? cx + s * len / 2 : cx, y, long ? cz : cz + s * len / 2, long ? rad * 0.7 : rad * 2, rad * 2, long ? rad * 2 : rad * 0.7);
  }
  // Горелка со стороны камеры.
  const bx = long ? cx - len / 2 - 0.12 : cx;
  const bz = long ? cz : cz + len / 2 + 0.12;
  kit.box(S.boiler, bx - 0.22, 0.25, bz - 0.22, bx + 0.22, 0.85, bz + 0.22);
  kit.box(kit.flat(S.fire), bx - 0.08, 0.5, bz + 0.22, bx + 0.08, 0.62, bz + 0.225);
  const flame = new PointLight(0xff8a3a, 1.6, 3, 2);
  flame.position.set(bx, 0.56, bz + 0.45);
  c.group.add(flame);
  const phase = rng.float() * 10;
  c.ticks.push((t) => {
    const f = 0.75 + Math.sin(t * 13 + phase) * 0.12 + Math.sin(t * 29 + phase * 2) * 0.08;
    flame.intensity = 1.6 * f;
    S.fire.emissiveIntensity = 2.5 * f;
  });
  // Трубы вверх, манометр, задвижка.
  const top = y + rad;
  for (const t of [-0.25, 0.2]) {
    const px = long ? cx + t * len : cx;
    const pz = long ? cz : cz + t * len;
    kit.cyl(S.pipe, px, top - 0.05, pz, 0.09, H - top + 0.1);
    kit.cyl(S.pipe, px, top + 0.4, pz, 0.12, 0.08);
  }
  const gx = long ? cx + 0.1 * len : cx + rad;
  const gz = long ? cz + rad : cz;
  kit.cyl(c.m.metal, gx, top - 0.1, gz, 0.03, 0.3);
  kit.add(cylGeo(), S.gauge, gx, top + 0.25, gz + 0.03, 0.16, 0.04, 0.16, Math.PI / 2);
  valveWheel(c, long ? cx - 0.25 * len : cx, top + 0.9, long ? cz + 0.12 : cz + 0.12);
}

/** Насос: бетонная тумба в полосу, мотор с рёбрами, улитка, патрубки. */
export function pumpUnit(c: Ctx, r: Rect, H: number): void {
  const S = setMats();
  const { kit } = c;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  kit.box(c.m.wall, r.x0 + 0.15, 0, r.z0 + 0.15, r.x1 - 0.15, 0.3, r.z1 - 0.15);
  // Полоса по кромке тумбы, а не по всей крышке.
  const e = 0.1;
  kit.box(c.m.hazard, r.x0 + 0.15, 0.06, r.z1 - 0.15, r.x1 - 0.15, 0.24, r.z1 - 0.14);
  kit.box(c.m.hazard, r.x0 + 0.15, 0.3, r.z1 - 0.15 - e, r.x1 - 0.15, 0.305, r.z1 - 0.15);
  kit.add(cylGeo(), S.motor, cx - 0.3, 0.75, cz, 0.7, 0.9, 0.7, 0, 0, Math.PI / 2);
  for (let k = 0; k < 9; k++) kit.add(cylGeo(), S.motor, cx - 0.7 + k * 0.1, 0.75, cz, 0.76, 0.02, 0.76, 0, 0, Math.PI / 2);
  kit.add(cylGeo(), c.m.metal, cx + 0.25, 0.75, cz, 0.18, 0.2, 0.18, 0, 0, Math.PI / 2);
  kit.add(cylGeo(), S.boiler, cx + 0.55, 0.75, cz, 0.75, 0.32, 0.75, 0, 0, Math.PI / 2);
  kit.cyl(S.pipe, cx + 0.55, 1.1, cz, 0.11, H - 1.1);
  kit.tube(S.pipe, new Vector3(cx + 0.55, 0.75, cz + 0.3), new Vector3(cx + 0.55, 0.75, r.z1 - 0.1), 0.11);
  kit.tube(S.pipe, new Vector3(cx + 0.55, 0.75, r.z1 - 0.1), new Vector3(cx + 0.55, 0.0, r.z1 - 0.1), 0.11);
  valveWheel(c, cx + 0.55, 1.6, cz + 0.12);
}

function valveWheel(c: Ctx, x: number, y: number, z: number): void {
  const S = setMats();
  c.kit.add(torusGeo(), S.valve, x, y, z, 0.32, 0.32, 0.32);
  c.kit.add(BOX, S.valve, x, y, z, 0.3, 0.025, 0.025);
  c.kit.add(BOX, S.valve, x, y, z, 0.025, 0.3, 0.025);
}

/** Клетка из рабицы: разрушаемая перегородка бойлерной. */
export function cageCell(c: Ctx, cx: number, cz: number, horizontal: boolean, hp: number): void {
  const S = setMats();
  const { kit, m } = c;
  const H = 2.2;
  if (horizontal) {
    kit.box(m.darkMetal, cx, 0, cz + 0.47, cx + 0.04, H, cz + 0.53);
    kit.box(m.darkMetal, cx, H - 0.04, cz + 0.47, cx + 1, H, cz + 0.53);
    if (hp > 0.34) kit.box(kit.flat(S.cage), cx + 0.04, 0.05, cz + 0.495, cx + 1, H * Math.min(1, hp + 0.2), cz + 0.505);
  } else {
    kit.box(m.darkMetal, cx + 0.47, 0, cz, cx + 0.53, H, cz + 0.04);
    kit.box(m.darkMetal, cx + 0.47, H - 0.04, cz, cx + 0.53, H, cz + 1);
    if (hp > 0.34) kit.box(kit.flat(S.cage), cx + 0.495, 0.05, cz + 0.04, cx + 0.505, H * Math.min(1, hp + 0.2), cz + 1);
  }
}

// --- Натурная часть --------------------------------------------------------------

/** Монолит: чёрный блок на месте стены и жёлтая черта вокруг на полу. */
export function monolith(c: Ctx, r: Rect, index: number): void {
  const S = setMats();
  const { kit } = c;
  const h = [1.1, 1.8, 0.8, 2.3, 1.4][index % 5] ?? 1.2;
  const inset = 0.04;
  kit.box(S.monolith, r.x0 + inset, 0, r.z0 + inset, r.x1 - inset, h, r.z1 - inset);
  const e = 0.12;
  const w = 0.035;
  const y = 0.003;
  kit.box(kit.flat(S.line), r.x0 - e, 0, r.z0 - e, r.x1 + e, y, r.z0 - e + w);
  kit.box(kit.flat(S.line), r.x0 - e, 0, r.z1 + e - w, r.x1 + e, y, r.z1 + e);
  kit.box(kit.flat(S.line), r.x0 - e, 0, r.z0 - e, r.x0 - e + w, y, r.z1 + e);
  kit.box(kit.flat(S.line), r.x1 + e - w, 0, r.z0 - e, r.x1 + e, y, r.z1 + e);
}

// --- Картотека ---------------------------------------------------------------------

/** Ряд серых шкафов картотеки: ящики с обеих сторон, рамки для ярлыков. */
export function greyCabinets(c: Ctx, r: Rect): void {
  const S = setMats();
  const { kit, rng, m, L } = c;
  const top = 1.45;
  const a = r.x0 + 0.05;
  const b = r.x1 - 0.05;
  kit.box(m.darkMetal, a + 0.04, 0, r.z0 + 0.1, b - 0.04, 0.08, r.z1 - 0.1);
  kit.box(S.greyCab, a, 0.08, r.z0 + 0.06, b, top, r.z1 - 0.06);
  const cols = Math.max(1, Math.round((b - a) / 0.5));
  const dw = (b - a) / cols;
  for (const [fz, s] of [[r.z1 - 0.06, 1], [r.z0 + 0.06, -1]] as const) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 4; j++) {
        const x = a + i * dw;
        const y = 0.12 + j * 0.33;
        const out = rng.float() < 0.04 ? 0.25 : 0.014;
        kit.box(S.greyDrawer, x + 0.015, y, Math.min(fz, fz + out * s), x + dw - 0.015, y + 0.3, Math.max(fz, fz + out * s));
        kit.box(m.paper, x + dw / 2 - 0.06, y + 0.2, Math.min(fz + out * s, fz + (out + 0.004) * s), x + dw / 2 + 0.06, y + 0.25, Math.max(fz + out * s, fz + (out + 0.004) * s));
        kit.box(m.metal, x + dw / 2 - 0.07, y + 0.1, Math.min(fz + out * s, fz + (out + 0.03) * s), x + dw / 2 + 0.07, y + 0.13, Math.max(fz + out * s, fz + (out + 0.03) * s));
      }
    }
  }
  for (let i = 0; i < cols; i++) {
    if (rng.float() < 0.5) continue;
    const x = a + i * dw + 0.05;
    kit.box(L.carton, x, top, r.z0 + 0.2, x + dw - 0.1, top + 0.22 + rng.float() * 0.1, r.z1 - 0.2);
  }
}

// --- Архитектура: внутренние стены с дверями и портретами -----------------------------

/**
 * Крупная масса планировки — это не мебель, а стена соседних кабинетов.
 * На гранях, обращённых в помещение, — двери с номерами, портреты,
 * бра. Так коридор портретов становится коридором.
 */
export function architecture(c: Ctx, r: Rect, t: Theme, faces: { n: boolean; s: boolean; w: boolean; e: boolean }, portraits: boolean): void {
  const S = setMats();
  const { kit, rng } = c;
  const h = t.inner;
  hollow(c, r, t);
  const cl = 0.03;
  if (t.wainscot > 0) {
    if (faces.s) kit.box(t.clad, r.x0, 0, r.z1, r.x1, Math.min(h, t.wainscot), r.z1 + cl);
    if (faces.n) kit.box(t.clad, r.x0, 0, r.z0 - cl, r.x1, Math.min(h, t.wainscot), r.z0);
    if (faces.w) kit.box(t.clad, r.x0 - cl, 0, r.z0, r.x0, Math.min(h, t.wainscot), r.z1);
    if (faces.e) kit.box(t.clad, r.x1, 0, r.z0, r.x1 + cl, Math.min(h, t.wainscot), r.z1);
  }
  if (t.id === 'void') return;
  // Длинные грани: дверь, портреты по обе стороны, бра между ними.
  const along = (x0: number, x1: number, z: number, s: number): void => {
    const len = x1 - x0;
    const doorAt = x0 + len * (0.25 + rng.float() * 0.5);
    const ins = s > 0 ? z : z - 0.06;
    const ins2 = s > 0 ? z + 0.06 : z;
    if (t.id !== 'boiler') {
      kit.box(S.frame, doorAt - 0.5, 0, ins, doorAt + 0.5, 2.15, ins2);
      kit.box(S.door, doorAt - 0.44, 0, Math.min(z, z + 0.07 * s), doorAt + 0.44, 2.08, Math.max(z, z + 0.07 * s));
      kit.sphere(c.L.brass, doorAt + 0.32, 1.0, z + 0.1 * s, 0.05, 0.05, 0.05);
      kit.box(c.m.paper, doorAt - 0.15, 1.7, Math.min(z + 0.07 * s, z + 0.075 * s), doorAt + 0.15, 1.82, Math.max(z + 0.07 * s, z + 0.075 * s));
    } else {
      kit.box(c.m.darkMetal, doorAt - 0.5, 0, Math.min(z, z + 0.06 * s), doorAt + 0.5, 2.1, Math.max(z, z + 0.06 * s));
      kit.box(c.m.hazard, doorAt - 0.5, 1.9, Math.min(z + 0.06 * s, z + 0.065 * s), doorAt + 0.5, 2.0, Math.max(z + 0.06 * s, z + 0.065 * s));
    }
    if (!portraits && t.id !== 'office') return;
    for (let x = x0 + 0.8; x < x1 - 0.6; x += 1.6) {
      if (Math.abs(x - doorAt) < 1.0) continue;
      const mat = S.portraits[Math.floor(rng.float() * S.portraits.length)] ?? S.door;
      kit.box(S.frame, x - 0.36, 1.25, Math.min(z, z + 0.05 * s), x + 0.36, 2.15, Math.max(z, z + 0.05 * s));
      kit.box(mat, x - 0.3, 1.31, Math.min(z + 0.05 * s, z + 0.055 * s), x + 0.3, 2.09, Math.max(z + 0.05 * s, z + 0.055 * s));
      kit.box(kit.flat(S.sconce), x - 0.08, 2.25, Math.min(z, z + 0.1 * s), x + 0.08, 2.32, Math.max(z, z + 0.1 * s));
    }
  };
  if (faces.s) along(r.x0, r.x1, r.z1 + cl, 1);
  if (faces.n) along(r.x0, r.x1, r.z0 - cl, -1);
}

/**
 * Масса изнутри: сверху видно, что за стеной — кабинеты. Наружные стены
 * толщиной в ладонь, поперечные перегородки с проходами, в каждом
 * кабинете своя обстановка. Для игры масса остаётся сплошной.
 */
function hollow(c: Ctx, r: Rect, t: Theme): void {
  const S = setMats();
  const { kit, rng, m, L } = c;
  const h = t.inner;
  const wt = 0.2;
  const { x0, z0, x1, z1 } = r;
  // Наружные стены и их срез.
  kit.box(t.wall, x0, 0, z0, x1, h, z0 + wt);
  kit.box(t.wall, x0, 0, z1 - wt, x1, h, z1);
  kit.box(t.wall, x0, 0, z0 + wt, x0 + wt, h, z1 - wt);
  kit.box(t.wall, x1 - wt, 0, z0 + wt, x1, h, z1 - wt);
  kit.box(t.cut, x0, h, z0, x1, h + 0.02, z0 + wt);
  kit.box(t.cut, x0, h, z1 - wt, x1, h + 0.02, z1);
  kit.box(t.cut, x0, h, z0 + wt, x0 + wt, h + 0.02, z1 - wt);
  kit.box(t.cut, x1 - wt, h, z0 + wt, x1, h + 0.02, z1 - wt);
  // Пол кабинетов.
  const inner = t.id === 'boiler' ? t.floor : t.id === 'office' ? t.floor : t.id === 'files' ? t.floor : L.terrazzo;
  kit.box(inner, x0 + wt, 0, z0 + wt, x1 - wt, 0.01, z1 - wt);
  // Поперечные перегородки по длинной оси.
  const alongX = x1 - x0 >= z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const rooms = Math.max(1, Math.round(len / 5));
  const step = len / rooms;
  for (let i = 1; i < rooms; i++) {
    const p = (alongX ? x0 : z0) + i * step;
    const gapAt = (alongX ? z0 : x0) + wt + 0.3 + rng.float() * Math.max(0.1, (alongX ? z1 - z0 : x1 - x0) - 2 * wt - 1.6);
    if (alongX) {
      kit.box(t.wall, p - 0.08, 0, z0 + wt, p + 0.08, h, gapAt);
      kit.box(t.wall, p - 0.08, 0, gapAt + 1.0, p + 0.08, h, z1 - wt);
      kit.box(t.cut, p - 0.08, h, z0 + wt, p + 0.08, h + 0.02, gapAt);
      kit.box(t.cut, p - 0.08, h, gapAt + 1.0, p + 0.08, h + 0.02, z1 - wt);
    } else {
      kit.box(t.wall, x0 + wt, 0, p - 0.08, gapAt, h, p + 0.08);
      kit.box(t.wall, gapAt + 1.0, 0, p - 0.08, x1 - wt, h, p + 0.08);
      kit.box(t.cut, x0 + wt, h, p - 0.08, gapAt, h + 0.02, p + 0.08);
      kit.box(t.cut, gapAt + 1.0, h, p - 0.08, x1 - wt, h + 0.02, p + 0.08);
    }
  }
  // Обстановка каждого кабинета.
  for (let i = 0; i < rooms; i++) {
    const a = (alongX ? x0 : z0) + i * step + (i === 0 ? wt : 0.08) + 0.15;
    const b = (alongX ? x0 : z0) + (i + 1) * step - (i === rooms - 1 ? wt : 0.08) - 0.15;
    const ra: Rect = alongX
      ? { x0: a, z0: z0 + wt + 0.15, x1: b, z1: z1 - wt - 0.15 }
      : { x0: x0 + wt + 0.15, z0: a, x1: x1 - wt - 0.15, z1: b };
    if (t.id === 'boiler') {
      // Насосная: бак и щит.
      const cx = (ra.x0 + ra.x1) / 2;
      const cz = (ra.z0 + ra.z1) / 2;
      kit.cyl(S.boiler, cx, 0, cz, Math.min(0.8, (Math.min(ra.x1 - ra.x0, ra.z1 - ra.z0)) / 2 - 0.1), h * 0.8);
      kit.box(L.radiator, ra.x0, 0.3, ra.z0, ra.x0 + 0.6, 1.8, ra.z0 + 0.25);
      continue;
    }
    office(c, ra, t);
  }
  void m;
}

/** Кабинет: столы лицом к двери, кресла, шкаф у стены, лампа, фикус. */
function office(c: Ctx, r: Rect, t: Theme): void {
  const S = setMats();
  const { kit, rng, m, L } = c;
  const wd = r.x1 - r.x0;
  const dp = r.z1 - r.z0;
  if (wd < 1.2 || dp < 1.2) return;
  const desks = Math.max(1, Math.min(3, Math.floor(wd / 1.6)));
  const top = t.id === 'files' ? S.greyCab : S.oak;
  for (let i = 0; i < desks; i++) {
    const cx = r.x0 + (wd / desks) * (i + 0.5);
    const cz = r.z0 + Math.min(dp * 0.55, 1.4);
    kit.box(top, cx - 0.6, 0.72, cz - 0.35, cx + 0.6, 0.76, cz + 0.35);
    kit.box(m.darkMetal, cx - 0.56, 0, cz - 0.3, cx - 0.52, 0.72, cz + 0.3);
    kit.box(top, cx + 0.15, 0, cz - 0.32, cx + 0.56, 0.72, cz + 0.32);
    deskItems(c, cx - 0.15, 0.76, cz, rng.float());
    // Настольная лампа: тёплая точка, видна сверху.
    kit.sphere(kit.flat(S.sconce), cx + 0.42, 0.98, cz - 0.2, 0.12, 0.08, 0.12);
    kit.cyl(L.brass, cx + 0.42, 0.76, cz - 0.2, 0.012, 0.2);
    chairLite(c, cx, cz + 0.62);
  }
  // Шкаф вдоль задней стены и фикус в углу.
  const shelfLen = Math.min(wd - 0.4, 2.2);
  kit.box(top, r.x0 + 0.1, 0, r.z0, r.x0 + 0.1 + shelfLen, 1.6, r.z0 + 0.35);
  for (let k = 0; k < Math.floor(shelfLen / 0.09); k++) {
    if (rng.float() < 0.2) continue;
    const mat = L.binders[Math.floor(rng.float() * L.binders.length)] ?? m.paper;
    for (const y of [0.85, 1.25]) kit.box(mat, r.x0 + 0.14 + k * 0.09, y, r.z0 + 0.05, r.x0 + 0.2 + k * 0.09, y + 0.3, r.z0 + 0.3);
  }
  kit.cyl(L.pot, r.x1 - 0.3, 0, r.z1 - 0.3, 0.2, 0.35);
  kit.sphere(L.leaf, r.x1 - 0.3, 0.6, r.z1 - 0.3, 0.45, 0.5, 0.45);
  kit.sphere(L.leafDark, r.x1 - 0.25, 0.85, r.z1 - 0.35, 0.3, 0.35, 0.3);
  // Ковёр под столами.
  if (t.id === 'office') kit.box(kit.flat(S.rugWarm), r.x0 + 0.3, 0.01, r.z0 + 0.6, r.x1 - 0.3, 0.018, r.z1 - 0.2);
}

function chairLite(c: Ctx, x: number, z: number): void {
  const { kit, m, L } = c;
  kit.box(L.seat, x - 0.22, 0.44, z - 0.22, x + 0.22, 0.5, z + 0.22);
  kit.box(L.seat, x - 0.22, 0.5, z + 0.18, x + 0.22, 0.95, z + 0.24);
  kit.cyl(m.darkMetal, x, 0.05, z, 0.025, 0.39);
  kit.cyl(m.darkMetal, x, 0, z, 0.24, 0.05);
}

// --- Мелочи ------------------------------------------------------------------------

const CYL = new CylinderGeometry(0.5, 0.5, 1, 24, 1);
const TORUS = new TorusGeometry(0.42, 0.06, 8, 24);

function cylGeo(): CylinderGeometry {
  return CYL;
}

function torusGeo(): TorusGeometry {
  return TORUS;
}
