/**
 * Материалы сцены. Создаются один раз: пересборка помещения переиспользует
 * их, и шейдеры не компилируются заново на каждом входе.
 *
 * Палитра та же, что у плоского вида: материал держится своей светлоты,
 * а объём и фактуру даёт свет. Красное по-прежнему только у субъекта.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Texture,
} from 'three';
import { PALETTE } from '../palette';
import {
  brushedMetal,
  carpet,
  concreteWall,
  fabric,
  fleshConcrete,
  glowSprite,
  hazard,
  polishedFloor,
  walnut,
  type PbrSet,
} from './textures';

export interface Materials {
  wall: MeshStandardMaterial;
  wallWarm: MeshStandardMaterial;
  wallTop: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  carpet: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  skirting: MeshStandardMaterial;
  rail: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  darkMetal: MeshStandardMaterial;
  furniture: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  paper: MeshStandardMaterial;
  void: MeshBasicMaterial;
  paint: MeshStandardMaterial;
  hazard: MeshStandardMaterial;
  signLit: MeshStandardMaterial;
  lampPanel: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  fabric: MeshStandardMaterial;
  glow: Texture;
  flesh: PbrSet;
  suit: PbrSet;
  metalSet: PbrSet;
  woodSet: PbrSet;
}

function pbr(set: PbrSet, color: number, extra: Partial<{ metalness: number; normalScale: number; envMapIntensity: number }> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color: new Color(color).multiplyScalar(1),
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: extra.metalness ?? 0,
  });
  const ns = extra.normalScale ?? 1;
  m.normalScale.set(ns, ns);
  if (extra.envMapIntensity !== undefined) m.envMapIntensity = extra.envMapIntensity;
  return m;
}

export function createMaterials(): Materials {
  // Текстура несёт светлоту материала сама, поэтому цвет материала —
  // белый: иначе палитра умножилась бы на себя дважды.
  const concrete = concreteWall(0x7c8288);
  const concreteWarm = concreteWall(0x7b7f84);
  const floorSet = polishedFloor(0x464b51, 0x1d2024);
  const carpetSet = carpet(0x6a6856, 0x3a3826);
  const woodSet = walnut(0x6b4a2c);
  const metalSet = brushedMetal(0x9aa0a6);
  const flesh = fleshConcrete();
  const suit = fabric();

  const wall = pbr(concrete, 0xffffff, { normalScale: 1.1 });
  const wallWarm = pbr(concreteWarm, 0xc9c4ba, { normalScale: 0.6 });
  const wallTop = pbr(concrete, 0x6f747b, { normalScale: 0.5 });
  const floor = pbr(floorSet, 0xffffff, { normalScale: 0.5, envMapIntensity: 1.6 });
  const carpetM = pbr(carpetSet, 0xffffff, { normalScale: 0.9 });
  const wood = pbr(woodSet, 0xffffff, { normalScale: 0.7 });
  const skirting = pbr(metalSet, 0x2a2e33, { metalness: 0.6 });
  const rail = pbr(metalSet, 0xb9bcc0, { metalness: 0.95, normalScale: 0.4 });
  const metal = pbr(metalSet, 0xbfc3c8, { metalness: 0.85, normalScale: 0.3 });
  const darkMetal = pbr(metalSet, 0x3a3e44, { metalness: 0.7, normalScale: 0.3 });
  const furniture = pbr(metalSet, 0x6f747a, { metalness: 0.35, normalScale: 0.4 });

  const glass = new MeshPhysicalMaterial({
    color: PALETTE.glass,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    envMapIntensity: 1.6,
    side: DoubleSide,
    depthWrite: false,
  });

  const paper = new MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.85 });
  const voidM = new MeshBasicMaterial({ color: 0x000000 });
  // Служебная краска на полу: жёлтая разметка светится чуть сама, чтобы
  // читаться и в тёмном уровне.
  const paint = new MeshStandardMaterial({
    color: PALETTE.yellow,
    emissive: PALETTE.yellow,
    emissiveIntensity: 0.25,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const hazardTex = hazard(PALETTE.yellow, 0x15161a);
  const hazardM = new MeshStandardMaterial({
    map: hazardTex,
    emissive: 0xffffff,
    emissiveMap: hazardTex,
    emissiveIntensity: 0.35,
    roughness: 0.55,
    metalness: 0.2,
  });
  const signLit = new MeshStandardMaterial({
    color: PALETTE.yellow,
    emissive: PALETTE.yellow,
    emissiveIntensity: 2.4,
    roughness: 0.4,
  });
  const lampPanel = new MeshStandardMaterial({
    color: 0xf4f6f8,
    emissive: 0xeef3f8,
    emissiveIntensity: 3,
    roughness: 0.3,
  });
  const leaf = new MeshStandardMaterial({ color: PALETTE.leaf, roughness: 0.75 });
  const fabricM = pbr(suit, 0x6b665a, { normalScale: 0.6 });

  return {
    wall,
    wallWarm,
    wallTop,
    floor,
    carpet: carpetM,
    wood,
    skirting,
    rail,
    metal,
    darkMetal,
    furniture,
    glass,
    paper,
    void: voidM,
    paint,
    hazard: hazardM,
    signLit,
    lampPanel,
    leaf,
    fabric: fabricM,
    glow: glowSprite(),
    flesh,
    suit,
    metalSet,
    woodSet,
  };
}

/** Аддитивный материал для пятен света: ореолы, лужи ламп. */
export function additive(tex: Texture, color: number, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}
