/**
 * ОБСТАНОВКА. Сборщики мебели и вещей, общие для всех помещений.
 *
 * Каждый сборщик получает прямоугольник клеток, который в симуляции
 * сплошной, и ставит на нём то, что этим прямоугольником является в
 * жизни: шкафчики, стойку, кадку, котёл. Габарит не выходит за клетки —
 * что видно, то и не пускает.
 */
import {
  BoxGeometry,
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
  Vector3,
  type CanvasTexture,
} from 'three';
import { PALETTE } from '../palette';
import type { Rng } from '../rng';
import { Kit } from './kit';
import type { Materials } from './materials';
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

/** Всё, что нужно сборщику: куда класть, чем и с какой случайностью. */
export interface Ctx {
  kit: Kit;
  m: Materials;
  L: PropMats;
  rng: Rng;
  group: Group;
  owned: { dispose(): void }[];
  ticks: ((time: number) => void)[];
}

export interface PropMats {
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

let cached: PropMats | null = null;

function std(color: number, rough: number, metal = 0, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  Object.assign(m, extra);
  return m;
}

/** Материалы обстановки: общие для всех помещений, создаются один раз. */
export function propMats(): PropMats {
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


/** Банк шкафчиков: две секции спиной к спине. */
export function lockers(ctx: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
export function vitrine(ctx: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
export function archive(ctx: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
export function reception(ctx: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
  chair(ctx, cx + 0.2, z0 + 0.62, Math.PI);
}

/** Кадка с фикусами и скамья вдоль неё. */
export function planter(ctx: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
  tree(ctx, x0 + 1.0, (z0 + back) / 2, 1.0);
  tree(ctx, x1 - 1.1, (z0 + back) / 2 + 0.05, 1.15);
  for (let k = 0; k < 3; k++) snake(ctx, x0 + 1.9 + k * 0.25, (z0 + back) / 2 + (k - 1) * 0.15);
  // Скамья: дубовые рейки на стальных опорах.
  for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) kit.box(m.darkMetal, x - 0.03, 0, back + 0.08, x + 0.03, 0.42, z1 - 0.06);
  for (let k = 0; k < 4; k++) {
    const z = back + 0.08 + k * 0.095;
    kit.box(m.wood, x0 + 0.15, 0.42, z, x1 - 0.15, 0.46, z + 0.08);
  }
}

export function tree(ctx: Ctx, x: number, z: number, scale: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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

export function snake(ctx: Ctx, x: number, z: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = 0.45 + rng.float() * 0.35;
    kit.add(new BoxGeometry(1, 1, 1), i % 2 === 0 ? L.leafDark : L.leafPale, x + Math.cos(a) * 0.05, 0.6 + h / 2, z + Math.sin(a) * 0.05, 0.07, h, 0.012, Math.sin(a) * 0.18, a, Math.cos(a) * 0.18);
  }
}

/** Зал ожидания: два ряда сцепленных кресел спинками друг к другу. */
export function waiting(ctx: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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

export function chair(ctx: Ctx, x: number, z: number, ry: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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

export function buildClock(ctx: Ctx, x: number, y: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
export function board(ctx: Ctx, x: number, y: number, wd: number, ht: number): void {
  const { kit, m, L, rng, group, owned, ticks } = ctx;
  void kit; void m; void L; void rng; void group; void owned; void ticks;
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
