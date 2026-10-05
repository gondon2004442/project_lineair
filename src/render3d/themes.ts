/**
 * ТЕМЫ УРОВНЕЙ. Каждый этаж — своё место: из чего пол и стены, есть ли
 * окна и откуда свет. Планировки у этажей общие, а помещения разные —
 * буфет на первом этаже и котельная на третьем стоят на одной сетке.
 *
 * Соответствие уровней концепту:
 *   −1 УЧАСТОК           → холл: светлый камень, окна, солнце
 *   −2 АРХИВ             → головной офис: ковролин, орех, вечерний свет
 *   −3 ТЕПЛОВОЙ УЗЕЛ     → бойлерная: сырой бетон, трубы, котлы
 *   −4 НАТУРНАЯ ЧАСТЬ    → белая пустота с чёрными монолитами
 *   −5 ЦЕНТРАЛЬНЫЙ АРХИВ → картотека: ряды серых шкафов, тусклый свет
 */
import { MeshStandardMaterial, type Material } from 'three';
import { PALETTE } from '../palette';
import type { PropMats } from './furnish';
import type { Materials } from './materials';
import {
  carpet,
  concreteWall,
  granite,
  linoleum,
  oilyConcrete,
  plaster,
  terrazzo,
  whiteConcrete,
  type PbrSet,
} from './textures';

export type ThemeId = 'hall' | 'office' | 'boiler' | 'void' | 'files';

export interface Theme {
  id: ThemeId;
  floor: MeshStandardMaterial;
  /** Стена выше цоколя. */
  wall: Material;
  /** Цоколь или обшивка до высоты wainscot. */
  clad: Material;
  wainscot: number;
  /** Срез стены сверху. */
  cut: Material;
  /** Высота внешних стен и внутренних масс. */
  height: number;
  inner: number;
  windows: boolean;
  pilasters: boolean;
  /** Солнце в окнах: азимут, высота, сила, цвет. */
  sun: { az: number; el: number; intensity: number; color: number };
  sky: number;
  skyColor: number;
  groundColor: number;
  env: number;
  exposure: number;
  /** Потолочные панели: сила и цвет. Ноль — панелей нет. */
  panels: number;
  panelColor: number;
  /** Верхний свет с мягкой тенью. */
  fill: number;
  /** Видимые конусы света от ламп вместо панелей. */
  cones: boolean;
  /** Цвет пустоты вокруг помещения и дымки. */
  voidColor: number;
  fog: number;
  /** Отражения в полу. */
  reflect: number;
  /** Множитель свечения: белой пустоте его почти не нужно. */
  bloom: number;
}

let cache: Map<ThemeId, Theme> | null = null;

function pbr(set: PbrSet, color: number, ns: number, rough?: number, metal = 0): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color,
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: rough === undefined ? set.roughnessMap : null,
    roughness: rough ?? 1,
    metalness: metal,
  });
  m.normalScale.set(ns, ns);
  return m;
}

export function themeFor(depth: number, m: Materials, L: PropMats): Theme {
  if (cache === null) cache = buildThemes(m, L);
  const id: ThemeId =
    depth === -2 ? 'office' : depth === -3 ? 'boiler' : depth === -4 ? 'void' : depth <= -5 ? 'files' : 'hall';
  const theme = cache.get(id);
  if (theme === undefined) throw new Error(`Нет темы ${id}`);
  return theme;
}

function buildThemes(m: Materials, L: PropMats): Map<ThemeId, Theme> {
  const out = new Map<ThemeId, Theme>();
  const pl = plaster();
  const cut = new MeshStandardMaterial({ color: 0x141517, roughness: 0.95 });

  out.set('hall', {
    id: 'hall',
    floor: L.terrazzo,
    wall: L.plaster,
    clad: L.granite,
    wainscot: 1.0,
    cut,
    height: 3.4,
    inner: 2.6,
    windows: true,
    pilasters: true,
    sun: { az: 14, el: 31, intensity: 16, color: 0xffeedb },
    sky: 0.16,
    skyColor: 0xdfe6ee,
    groundColor: 0x3a3632,
    env: 0.3,
    exposure: 0.95,
    panels: 1.7,
    panelColor: 0xf1f5fa,
    fill: 13,
    cones: false,
    voidColor: 0x000000,
    fog: 0.004,
    reflect: 0.5,
    bloom: 1,
  });

  // Головной офис: тёплый ковролин, орех до плеча, бежевая штукатурка и
  // низкое вечернее солнце.
  const officeCarpet = pbr(carpet(0x5f5a44, 0x3b3826), 0xffffff, 0.9);
  const officePlaster = pbr(pl, 0xdacbb2, 0.7);
  out.set('office', {
    id: 'office',
    floor: officeCarpet,
    wall: officePlaster,
    clad: m.wood,
    wainscot: 1.25,
    cut,
    height: 3.1,
    inner: 2.4,
    windows: true,
    pilasters: false,
    sun: { az: -26, el: 19, intensity: 13, color: 0xffc58c },
    sky: 0.14,
    skyColor: 0xe9dcc5,
    groundColor: 0x3a2e22,
    env: 0.22,
    exposure: 1.0,
    panels: 1.1,
    panelColor: 0xffe8cc,
    fill: 9,
    cones: false,
    voidColor: 0x000000,
    fog: 0.004,
    reflect: 0,
    bloom: 1,
  });

  // Бойлерная: сырой бетон, высокий потолок, свет только от ламп.
  const raw = pbr(concreteWall(0x6c7076), 0xffffff, 1.3);
  const oily = pbr(oilyConcrete(), 0xffffff, 1.0);
  const stripes = new MeshStandardMaterial({ map: m.hazard.map, roughness: 0.7, color: 0xcfcfcf });
  out.set('boiler', {
    id: 'boiler',
    floor: oily,
    wall: raw,
    clad: stripes,
    wainscot: 0.22,
    cut,
    height: 4.2,
    inner: 3.0,
    windows: false,
    pilasters: true,
    sun: { az: 0, el: 80, intensity: 0, color: 0xffffff },
    sky: 0.05,
    skyColor: 0x9aa4ae,
    groundColor: 0x15120f,
    env: 0.12,
    exposure: 1.0,
    panels: 0,
    panelColor: 0xffffff,
    fill: 0,
    cones: true,
    voidColor: 0x000000,
    fog: 0.012,
    reflect: 0.35,
    bloom: 1.2,
  });

  // Натурная часть: здание перестало притворяться. Белое, пустое, свет
  // столбами, и только чёрные монолиты там, где были стены.
  const white = pbr(whiteConcrete(), 0xffffff, 0.5);
  const whiteWall = pbr(pl, 0xf2f2ef, 0.3);
  out.set('void', {
    id: 'void',
    floor: white,
    wall: whiteWall,
    clad: whiteWall,
    wainscot: 0.0,
    cut: new MeshStandardMaterial({ color: 0xdedede, roughness: 0.9 }),
    height: 2.2,
    inner: 2.0,
    windows: false,
    pilasters: false,
    sun: { az: 20, el: 62, intensity: 2.2, color: 0xffffff },
    sky: 0.75,
    skyColor: 0xffffff,
    groundColor: 0x4a4a4a,
    env: 0.35,
    exposure: 0.7,
    panels: 0,
    panelColor: 0xffffff,
    fill: 0,
    cones: true,
    voidColor: 0xe9e9e6,
    fog: 0.0012,
    reflect: 0.12,
    bloom: 0,
  });

  // Картотека: тёмный линолеум, крашеные в серо-зелёный стены, лампы
  // дневного света через одну.
  const lino = pbr(linoleum(0x3b423f), 0xffffff, 0.6);
  const greyPaint = pbr(pl, 0x8d978f, 0.5);
  const greyLow = pbr(pl, 0x4f5a55, 0.5);
  out.set('files', {
    id: 'files',
    floor: lino,
    wall: greyPaint,
    clad: greyLow,
    wainscot: 1.4,
    cut,
    height: 3.0,
    inner: 2.6,
    windows: false,
    pilasters: false,
    sun: { az: 0, el: 80, intensity: 0, color: 0xffffff },
    sky: 0.22,
    skyColor: 0xd6e4dc,
    groundColor: 0x1d2220,
    env: 0.2,
    exposure: 1.35,
    panels: 2.4,
    panelColor: 0xe2f2ea,
    fill: 12,
    cones: false,
    voidColor: 0x000000,
    fog: 0.008,
    reflect: 0.4,
    bloom: 1,
  });

  void granite;
  void terrazzo;
  void PALETTE;
  return out;
}
