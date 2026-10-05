/**
 * Всё живое и подвижное в объёме: субъект, штат, мебель, добыча,
 * оборудование, талоны и снаряды.
 *
 * Каждая сущность получает свой узел при первом появлении и теряет его,
 * когда исчезает из мира. Вид узла задаётся ключом: опрокинули кулер,
 * вскрыли шкаф, положили стол набок — ключ сменился, узел пересобран.
 * Между пересборками узел только двигается и меняет подсветку.
 *
 * Служебное — таблички, телеграфы, рамки — сюда не входит как геометрия:
 * оно уходит в пачки и рисуется поверх кадра, как служебный слой в
 * плоском виде. Жёлтое остаётся жёлтым в любом состоянии.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  BackSide,
  DoubleSide,
  Euler,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Entity, World } from '../ecs';
import { PALETTE } from '../palette';
import { STEP, TUNING } from '../tuning';
import { FIXTURES_BY_ID } from '../data/fixtures';
import { COUNTERS_BY_KIND } from '../data/counters';
import { litAt } from '../systems/postKeeper';
import { vacancyCount } from '../systems/staff';
import { pendingItems } from '../systems/postAuditor';
import { stashInReach } from '../systems/issue';
import { counterInReach } from '../systems/counter';
import { grabCandidate } from '../systems/telekinesis';
import { dashIFrameWindow, dashSpec } from '../systems/playerControl';
import type { QuadBatch } from './batch';
import type { Materials } from './materials';

/** Пиксели мира → клетки. */
const U = 1 / TUNING.room.tile;

// --- Общие заготовки геометрии: масштабируются под сущность ---------------
const BOX = new BoxGeometry(1, 1, 1);
const SPHERE = new SphereGeometry(0.5, 20, 14);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 18);
const CAPSULE = new CapsuleGeometry(0.5, 1, 6, 16);
const TORUS = new TorusGeometry(0.5, 0.14, 8, 24);
const OCTA = new OctahedronGeometry(0.5, 0);
const CARD = new BoxGeometry(1, 0.03, 1);

interface View {
  key: string;
  root: Group;
  /** Узел позы: наклон, шаг, растяжение. */
  body: Group;
  /** Материалы, которые вспыхивают при уроне. */
  mats: MeshStandardMaterial[];
  /** Своё у отдельных видов: рука инспектора, свита, фонарь. */
  arm?: Group;
  retinue?: Group;
  lamp?: MeshStandardMaterial;
  ghosts?: Mesh[];
  rim?: Mesh;
  /** Обломок: своя геометрия, её надо освободить. */
  own?: BufferGeometry[];
  seen: boolean;
  /** Прошлая точка: по ней считается походка. */
  lastX: number;
  lastZ: number;
  walk: number;
}

export interface Batches {
  /** Пятна на полу: лужи, щитки, кольца. Под пересчётом красного. */
  decal: QuadBatch;
  /** Аддитивные ореолы: заражение, субъект, снаряды. */
  glow: QuadBatch;
  /** Служебный слой поверх всего кадра. */
  svc: QuadBatch;
}

export interface FrameInfo {
  alpha: number;
  time: number;
  /** Цвет кожи субъекта: красный, а в заседании — почти белый. */
  skin: number;
  hiss: boolean;
  dark: boolean;
  showHitboxes: boolean;
  /** Куда смотрит камера сейчас: для табличек лицом к ней. */
  camRight: Vector3;
  camUp: Vector3;
}

const SHOT_SHAPES = ['dot', 'bar', 'diamond', 'card'] as const;

export class Actors {
  readonly group = new Group();
  private readonly views = new Map<Entity, View>();
  private readonly shots: Record<string, InstancedMesh> = {};
  private readonly tmpM = new Matrix4();
  private readonly tmpQ = new Quaternion();
  private readonly tmpS = new Vector3();
  private readonly tmpP = new Vector3();
  private readonly tmpC = new Color();
  private readonly tmpE = new Euler();
  private readonly up = new Vector3(0, 1, 0);
  /** Узел субъекта — его же рисуют второй раз поверх пересчёта. */
  playerRoot: Object3D | null = null;

  constructor(private readonly m: Materials) {
    const glowMat = new MeshBasicMaterial({ color: 0xffffff });
    const cardMat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      emissive: PALETTE.paper,
      emissiveIntensity: 0.18,
      side: DoubleSide,
    });
    const make = (geo: BufferGeometry, mat: Material, name: string, cast: boolean): void => {
      const mesh = new InstancedMesh(geo, mat, 1024);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = cast;
      mesh.frustumCulled = false;
      // Цвет по экземпляру: снаряды объекта бывают разной бумаги.
      mesh.setColorAt(0, new Color(1, 1, 1));
      this.shots[name] = mesh;
      this.group.add(mesh);
    };
    make(SPHERE, glowMat, 'glow:dot', false);
    make(CAPSULE, glowMat, 'glow:bar', false);
    make(OCTA, glowMat, 'glow:diamond', false);
    make(CARD, cardMat, 'solid:card', true);
    make(BOX, cardMat, 'solid:dot', true);
    make(CAPSULE, cardMat, 'solid:bar', true);
    make(OCTA, cardMat, 'solid:diamond', true);
  }

  /** Сбросить все узлы: смена мира или помещения. */
  clear(): void {
    for (const [e] of this.views) this.drop(e);
  }

  sync(w: World, f: FrameInfo, b: Batches): void {
    for (const view of this.views.values()) view.seen = false;

    const reachStash = stashInReach(w);
    const reachCounter = counterInReach(w);
    const candidate = grabCandidate(w);
    const held = w.playerC.get(w.player)?.held ?? -1;

    for (const [e, draw] of w.drawC) {
      if (w.bulletC.has(e)) continue;
      const t = w.transform.get(e);
      if (t === undefined) continue;
      const key = this.keyOf(w, e, draw.shape);
      let view = this.views.get(e);
      if (view === undefined || view.key !== key) {
        if (view !== undefined) this.drop(e);
        view = this.build(w, e, key, draw.size * U, draw.color);
        this.views.set(e, view);
        this.group.add(view.root);
      }
      view.seen = true;
      const x = lerp(t.px, t.x, f.alpha) * U;
      const z = lerp(t.py, t.y, f.alpha) * U;
      this.place(w, e, view, x, z, draw.size * U, f, b, held, reachStash, reachCounter);
    }

    for (const [e, view] of this.views) if (!view.seen) this.drop(e);

    this.service(w, f, b, candidate, held);
    this.bullets(w, f, b);
  }

  // --- Ключ и сборка ---------------------------------------------------------

  private keyOf(w: World, e: Entity, shape: string): string {
    if (e === w.player) return 'player';
    const stash = w.stashC.get(e);
    if (stash !== undefined) return `stash:${stash.kind}:${stash.opened}`;
    const fixture = w.fixtureC.get(e);
    if (fixture !== undefined) return `fix:${fixture.kind}:${fixture.toppled}`;
    const clerk = w.clerkC.get(e);
    if (clerk !== undefined) return `clerk:${clerk.offended}`;
    const counter = w.counterC.get(e);
    if (counter !== undefined) return `counter:${counter.used}`;
    if (w.ticketC.has(e)) return 'ticket';
    const staff = w.staffC.get(e);
    if (staff !== undefined) return `staff:${staff.silhouette}:${w.drawC.get(e)?.desk === true}`;
    const prop = w.propC.get(e);
    if (prop !== undefined) return `prop:${prop.kind}:${prop.phase === 'cover'}`;
    return `shape:${shape}`;
  }

  private build(w: World, e: Entity, key: string, s: number, color: number): View {
    const root = new Group();
    const body = new Group();
    root.add(body);
    const view: View = { key, root, body, mats: [], seen: true, lastX: NaN, lastZ: NaN, walk: 0 };
    const kind = key.split(':');
    switch (kind[0]) {
      case 'player':
        this.buildPlayer(view, s);
        this.playerRoot = root;
        break;
      case 'staff':
        this.buildStaff(w, e, view, kind[1] ?? '', kind[2] === 'true', s, color);
        break;
      case 'prop':
        this.buildProp(view, kind[1] ?? '', kind[2] === 'true', s, color, e);
        break;
      case 'stash':
        this.buildStash(view, kind[1] ?? '', kind[2] === 'true', s);
        break;
      case 'fix':
        this.buildFixture(view, kind[1] ?? '', kind[2] === 'true', s);
        break;
      case 'clerk':
        this.buildClerk(view, kind[1] === 'true', s);
        break;
      case 'counter':
        this.buildCounter(view, kind[1] === 'true', s);
        break;
      case 'ticket': {
        const paper = this.tint(PALETTE.paper, view, 0.85);
        const half = s * TUNING.render.ticketWide;
        part(body, BOX, paper, half * 2, 0.012, s * 2, 0, 0.008, 0, false);
        part(body, BOX, this.m.darkMetal, half * 2 * TUNING.render.ticketNotch, 0.014, s * 2.02, 0, 0.008, 0, false);
        body.rotation.y = ((e * 37) % 100) / 100;
        break;
      }
      default:
        part(body, BOX, this.tint(color, view), s * 2, s * 2, s * 2, 0, s, 0);
    }
    return view;
  }

  /** Материал, который принадлежит узлу и умеет вспыхивать. */
  private tint(color: number, view: View, rough = 0.7, metal = 0.05): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    view.mats.push(mat);
    return mat;
  }

  /** Заражённая плоть: бетон с прожилками, оттенок по должности. */
  private flesh(color: number, view: View): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({
      color: new Color(color).multiplyScalar(1.12),
      map: this.m.flesh.map,
      normalMap: this.m.flesh.normalMap,
      roughnessMap: this.m.flesh.roughnessMap,
      roughness: 1,
    });
    mat.normalScale.set(1.4, 1.4);
    withRim(mat, PALETTE.concrete300, 0.5);
    view.mats.push(mat);
    return mat;
  }

  private buildPlayer(view: View, s: number): void {
    const H = TUNING.view3d.bodyHeight;
    const suit = new MeshStandardMaterial({
      color: PALETTE.red,
      map: this.m.suit.map,
      normalMap: this.m.suit.normalMap,
      roughness: 0.62,
      emissive: PALETTE.red,
      emissiveIntensity: 0.28,
    });
    view.mats.push(suit);
    const skin = this.tint(0xc8b2a6, view, 0.55);
    const hair = this.tint(0x1b1612, view, 0.8);
    const r = s * 0.95;
    const torso = part(view.body, CAPSULE, suit, r * 2, (H * 0.62 - r * 2) * 0.8, r * 1.5, 0, H * 0.42, 0);
    // Ноги: два столбика под корпусом, шаг читается по ним.
    part(view.body, CAPSULE, suit, r * 0.7, H * 0.18, r * 0.7, -r * 0.42, H * 0.17, 0);
    part(view.body, CAPSULE, suit, r * 0.7, H * 0.18, r * 0.7, r * 0.42, H * 0.17, 0);
    part(view.body, SPHERE, skin, r * 0.95, r * 1.05, r * 0.95, 0, H * 0.82, 0.02);
    part(view.body, SPHERE, hair, r * 1.0, r * 0.8, r * 1.0, 0, H * 0.86, -0.04);
    // Табельное: рука с оружием, смотрит туда же, куда прицел.
    part(view.body, CAPSULE, suit, r * 0.45, r * 0.9, r * 0.45, r * 0.75, H * 0.55, r * 0.6, true, Math.PI / 2);
    part(view.body, BOX, this.m.darkMetal, r * 0.32, r * 0.42, r * 1.3, r * 0.75, H * 0.57, r * 1.45);
    // Кант: светлая обводка корпуса со спины, чтобы субъект не тонул на
    // тёмном полу, когда цвет у него отобран.
    const rimMat = new MeshBasicMaterial({ color: PALETTE.concrete100, side: BackSide, transparent: true, opacity: 0.85 });
    const rim = new Mesh(CAPSULE, rimMat);
    rim.scale.copy(torso.scale).multiplyScalar(1.09);
    rim.position.copy(torso.position);
    view.body.add(rim);
    view.rim = rim;
    // Призраки рывка.
    view.ghosts = [];
    for (let i = 0; i < Math.max(0, TUNING.render.dashTrail); i++) {
      const gm = new MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0, depthWrite: false });
      const ghost = new Mesh(CAPSULE, gm);
      ghost.scale.set(r * 2, H * 0.55, r * 1.5);
      ghost.visible = false;
      view.root.parent?.add(ghost);
      view.ghosts.push(ghost);
    }
  }

  private buildStaff(w: World, e: Entity, view: View, sil: string, desk: boolean, s: number, color: number): void {
    const H = TUNING.view3d.bodyHeight;
    const R = TUNING.render;
    const skin = this.flesh(color, view);
    const b = view.body;
    if (desk) {
      const extra = R.deskExtra * U;
      part(b, BOX, this.m.wood, (s + extra) * 2.2, 0.06, (s + extra) * 1.2, 0, 0.78, s + extra * 0.6);
      part(b, BOX, this.m.darkMetal, (s + extra) * 2.0, 0.72, 0.06, 0, 0.38, s + extra * 1.1);
    }
    switch (sil) {
      case 'armed': {
        const bw = s * R.inspectorWidth;
        part(b, CAPSULE, skin, bw * 2, H * 0.55, bw * 1.6, 0, H * 0.45, 0);
        part(b, SPHERE, skin, s * 0.85, s * 0.95, s * 0.85, 0, H * 0.9, 0);
        // Воротник шире плеч — его видно и в чёрном пятне.
        const cw = s * R.collarWidth * 1.7;
        const collar = part(b, TORUS, skin, cw, cw, cw, 0, H * 0.78, 0);
        collar.rotation.x = Math.PI / 2;
        const arm = new Group();
        arm.position.set(0, H * 0.62, 0);
        const reach = s * R.armReach;
        const thick = s * R.armThickness;
        part(arm, CAPSULE, skin, thick * 2, reach, thick * 2, 0, 0, reach * 0.55, true, Math.PI / 2);
        part(arm, BOX, this.m.darkMetal, thick * 1.6, thick * 1.8, thick * 3.2, 0, 0, reach * 1.15);
        view.root.add(arm);
        view.arm = arm;
        break;
      }
      case 'wide': {
        const bw = s * 2;
        part(b, BOX, skin, bw * 2, H * 0.55, s * 1.6, 0, H * 0.3, 0);
        part(b, SPHERE, skin, s * 0.9, s * 0.9, s * 0.9, 0, H * 0.62, 0);
        const out = s * R.registrarArmOut;
        const arm = s * R.armThickness;
        // По бокам картотеки выше корпуса: силуэт стола с двумя тумбами.
        const cab = this.tint(PALETTE.furniture, view, 0.45, 0.4);
        part(b, BOX, cab, arm * 2.4, H * 0.72, s * 1.4, -bw - out, H * 0.36, 0);
        part(b, BOX, cab, arm * 2.4, H * 0.72, s * 1.4, bw + out, H * 0.36, 0);
        break;
      }
      case 'bulk': {
        const shift = s * R.bulkShift;
        const tall = s * R.bulkTall;
        const leftW = s * R.bulkLeft;
        // Масса смещена влево, головы нет вовсе: она поглощена.
        part(b, SPHERE, skin, leftW * 2.2, H * 1.15, leftW * 2, -shift * 0.6, H * 0.5, 0);
        part(b, SPHERE, skin, leftW * 1.4, H * 0.6, leftW * 1.4, -shift * 0.4, H * 0.95, -s * 0.2);
        const rw = s * R.bulkRightWidth;
        const rh = s * R.bulkRightHeight;
        part(b, BOX, skin, rw * 2, Math.max(tall, rh) * 1.4, rw * 2, leftW * 0.9, rh * 0.7, 0);
        break;
      }
      case 'desk': {
        part(b, BOX, skin, s * 2.1, H * 0.8, s * 1.6, 0, H * 0.42, 0);
        part(b, SPHERE, skin, s * R.bulkHead * 2.2, s * R.bulkHead * 2.2, s * R.bulkHead * 2.2, 0, H * 0.93, 0);
        const retinue = new Group();
        const count = Math.max(0, R.chiefRetinue);
        const ring = s * R.chiefRetinueRadius;
        const mark = s * R.chiefRetinueSize;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const plate = part(retinue, BOX, this.m.signLit, mark * 2, mark, 0.04, Math.cos(a) * ring, 0, Math.sin(a) * ring, false);
          plate.rotation.y = -a + Math.PI / 2;
        }
        retinue.position.y = H * 0.75;
        view.root.add(retinue);
        view.retinue = retinue;
        break;
      }
      case 'counter': {
        const wide = s * R.counterDeskWide;
        const tall = s * R.counterDeskTall;
        part(b, BOX, this.m.wood, wide * 2, 0.08, tall * 2.2, 0, 0.92, tall * 0.4);
        part(b, BOX, this.tint(PALETTE.furniture, view, 0.5, 0.3), wide * 2, 0.88, tall * 2, 0, 0.44, tall * 0.4);
        part(b, CAPSULE, skin, s * 1.3, H * 0.45, s * 1.1, 0, H * 0.55, -tall * 0.9);
        part(b, SPHERE, skin, s * 0.8, s * 0.85, s * 0.8, 0, H * 0.88, -tall * 0.9);
        break;
      }
      case 'lamp': {
        const wide = s * R.keeperWidth;
        const tall = H * 1.05;
        part(b, CYL, skin, wide * 2, tall, wide * 2, 0, tall / 2, 0);
        const lamp = new MeshStandardMaterial({ color: PALETTE.concrete700, emissive: PALETTE.yellow, emissiveIntensity: 0, roughness: 0.4 });
        view.mats.push(lamp);
        const lampSize = s * R.keeperLamp * 2.2;
        part(b, BOX, lamp, lampSize, lampSize, lampSize, 0, tall + lampSize / 2, 0);
        part(b, BOX, this.m.darkMetal, lampSize * 1.2, 0.05, lampSize * 1.2, 0, tall + lampSize, 0);
        view.lamp = lamp;
        break;
      }
      case 'seat': {
        part(b, BOX, this.m.darkMetal, s * 2.2, 0.08, s * 2, 0, 0.5, 0);
        part(b, BOX, this.m.darkMetal, s * 2.2, 0.9, 0.08, 0, 0.9, -s * 0.95);
        part(b, CAPSULE, skin, s * 1.8, H * 0.35, s * 1.4, 0, H * 0.5, -s * 0.2);
        part(b, SPHERE, skin, s * R.bulkHead * 2.2, s * R.bulkHead * 2.3, s * R.bulkHead * 2.2, 0, H * 0.82, -s * 0.2);
        break;
      }
      case 'slim': {
        const across = s * R.slimWidth;
        const along = s * R.courierStretch;
        part(b, CAPSULE, skin, across * 2, H * 0.6, along * 1.2, 0, H * 0.48, 0);
        part(b, SPHERE, skin, across * 1.6, across * 1.7, across * 1.6, 0, H * 0.86, along * 0.2);
        const bag = s * R.courierBag;
        const out = s * R.courierBagOut;
        part(b, BOX, this.m.fabric, bag * 2, bag * 2.4, bag * 1.4, -out, H * 0.42, 0);
        break;
      }
      default: {
        // Стажёр: голова утоплена в плечи, вспухшее плечо торчит наружу.
        const bh = s * R.sunkenSquat;
        const bw = s * R.internWide;
        part(b, CAPSULE, skin, bw * 2, H * 0.4, bw * 1.6, 0, H * 0.36, 0);
        part(b, SPHERE, skin, s * 1.0, s * 0.9, s * 1.0, 0, H * 0.62, 0.05);
        const lump = s * R.internShoulder;
        part(b, SPHERE, skin, lump * 2.4, lump * 2.2, lump * 2.4, -bw * 0.95, H * 0.55 + bh * 0.1, 0);
        part(b, CAPSULE, skin, s * 0.6, H * 0.15, s * 0.6, -s * 0.4, H * 0.12, 0);
        part(b, CAPSULE, skin, s * 0.6, H * 0.15, s * 0.6, s * 0.4, H * 0.12, 0);
      }
    }
    void w;
    void e;
  }

  private buildProp(view: View, kind: string, cover: boolean, s: number, color: number, e: Entity): void {
    const b = view.body;
    const tone = this.tint(color, view, 0.55, 0.25);
    switch (kind) {
      case 'chair': {
        const fabric = this.tint(new Color(color).multiplyScalar(0.8).getHex(), view, 0.9);
        part(b, BOX, fabric, s * 1.7, 0.1, s * 1.6, 0, 0.5, 0);
        part(b, BOX, fabric, s * 1.6, 0.6, 0.09, 0, 0.88, -s * 0.78);
        part(b, CYL, this.m.darkMetal, 0.07, 0.42, 0.07, 0, 0.24, 0);
        for (let i = 0; i < 5; i++) {
          const leg = part(b, BOX, this.m.darkMetal, 0.06, 0.05, s * 1.0, 0, 0.04, 0);
          const a = (i / 5) * Math.PI * 2;
          leg.rotation.y = a;
          leg.position.set(Math.sin(a) * s * 0.45, 0.04, Math.cos(a) * s * 0.45);
        }
        break;
      }
      case 'cabinet': {
        const h = 1.55;
        part(b, BOX, tone, s * 2, h, s * 1.8, 0, h / 2, 0);
        for (let i = 0; i < 4; i++) {
          const y = h * (0.14 + i * 0.235);
          part(b, BOX, this.m.darkMetal, s * 1.8, 0.012, 0.012, 0, y + h * 0.1, s * 0.905, false);
          part(b, BOX, this.m.metal, s * 0.6, 0.04, 0.05, 0, y + 0.02, s * 0.92, false);
        }
        break;
      }
      case 'rubble': {
        const geo = new IcosahedronGeometry(0.5, 1);
        const pos = geo.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const k = 0.75 + hash01(e * 13 + i) * 0.45;
          pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
        }
        geo.computeVertexNormals();
        view.own = [geo];
        part(b, geo, this.m.wall, s * 2.3, s * 1.5, s * 2.1, 0, s * 0.6, 0);
        break;
      }
      case 'typewriter': {
        part(b, BOX, this.m.darkMetal, s * 2, 0.28, s * 1.6, 0, 0.14, 0);
        const keys = part(b, BOX, this.tint(PALETTE.concrete700, view, 0.6), s * 1.8, 0.08, s * 0.8, 0, 0.3, s * 0.35);
        keys.rotation.x = 0.25;
        part(b, BOX, this.m.paper, s * 1.2, 0.36, 0.01, 0, 0.45, -s * 0.5, false);
        break;
      }
      case 'cardbox': {
        part(b, BOX, this.m.wood, s * 2, 0.5, s * 2, 0, 0.25, 0);
        for (let i = 0; i < 6; i++) {
          part(b, BOX, this.m.paper, s * 1.7, 0.08, 0.012, 0, 0.5, -s * 0.8 + i * s * 0.3, false);
        }
        break;
      }
      case 'desk': {
        part(b, BOX, this.m.wood, s * 2.3, 0.07, s * 2, 0, 0.76, 0);
        part(b, BOX, tone, s * 0.8, 0.72, s * 1.8, s * 0.7, 0.36, 0);
        part(b, BOX, this.m.darkMetal, 0.06, 0.72, 0.06, -s * 1.05, 0.36, -s * 0.9);
        part(b, BOX, this.m.darkMetal, 0.06, 0.72, 0.06, -s * 1.05, 0.36, s * 0.9);
        part(b, BOX, this.m.paper, s * 0.6, 0.02, s * 0.8, -s * 0.4, 0.8, 0, false);
        break;
      }
      case 'faxstand': {
        const h = 1.2;
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          part(b, BOX, this.m.metal, 0.05, h, 0.05, px * s * 0.9, h / 2, pz * s * 0.85);
        }
        for (const y of [0.35, 0.8]) {
          part(b, BOX, this.m.metal, s * 1.9, 0.03, s * 1.8, 0, y, 0);
          part(b, BOX, this.tint(0xb8b2a2, view, 0.6), s * 1.3, 0.2, s * 1.2, 0, y + 0.12, 0);
        }
        break;
      }
      case 'tank': {
        // Огнетушитель: в жизни он красный, но красное — только субъект.
        part(b, CYL, tone, s * 1.2, 0.85, s * 1.2, 0, 0.43, 0);
        part(b, SPHERE, tone, s * 1.2, s * 0.8, s * 1.2, 0, 0.85, 0);
        part(b, BOX, this.m.darkMetal, 0.08, 0.12, 0.2, 0, 0.98, 0.04);
        part(b, CYL, this.m.darkMetal, 0.035, 0.4, 0.035, s * 0.55, 0.7, 0.05);
        break;
      }
      default:
        part(b, BOX, tone, s * 2, s * 2, s * 2, 0, s, 0);
    }
    if (cover) {
      // Положен набок: укрытие лежит плитой, лицом к полу.
      b.rotation.x = -Math.PI / 2;
      b.position.set(0, s * 0.95, -s * 0.2);
    }
  }

  private buildStash(view: View, kind: string, opened: boolean, s: number): void {
    const b = view.body;
    const seal = new MeshStandardMaterial({ color: PALETTE.yellow, emissive: PALETTE.yellow, emissiveIntensity: 0.9, roughness: 0.5 });
    view.mats.push(seal);
    if (kind === 'walled') {
      // Замурованный: кладка, из которой проступает человек.
      const h = TUNING.view3d.bodyHeight * 1.05;
      part(b, BOX, this.m.wall, s * 2.2, h, s * 2.2, 0, h / 2, 0);
      const relief = this.flesh(PALETTE.concrete300, view);
      part(b, SPHERE, relief, s * 0.9, s * 1.0, s * 0.5, 0, h * 0.82, s * 1.1);
      part(b, CAPSULE, relief, s * 1.8, h * 0.25, s * 0.5, 0, h * 0.52, s * 1.08);
      if (!opened) part(b, BOX, seal, s * 2.26, 0.08, s * 2.26, 0, h * 0.3, 0, false);
      return;
    }
    if (kind === 'safe') {
      const h = 1.15;
      const body = this.tint(opened ? PALETTE.concrete700 : 0x50555c, view, 0.38, 0.75);
      part(b, BOX, body, s * 2, h, s * 2, 0, h / 2, 0);
      part(b, CYL, this.m.metal, s * 0.5, 0.06, s * 0.5, s * 0.4, h * 0.6, s + 0.02, true, Math.PI / 2);
      if (opened) {
        const door = part(b, BOX, body, s * 1.8, h * 0.9, 0.05, s * 0.9, h / 2, s * 1.1);
        door.rotation.y = -1.2;
      } else {
        part(b, BOX, seal, s * 2.04, 0.07, s * 2.04, 0, h * 0.45, 0, false);
      }
      return;
    }
    // Ячейка стола выдачи: шкафчик с ярлыком.
    const h = 0.95;
    part(b, BOX, this.tint(opened ? PALETTE.concrete700 : PALETTE.furniture, view, 0.45, 0.45), s * 2, h, s * 2, 0, h / 2, 0);
    part(b, BOX, this.m.darkMetal, s * 1.7, h * 0.7, 0.02, 0, h * 0.48, s + 0.01, false);
    if (!opened) {
      part(b, BOX, seal, s * 2.02, 0.05, s * 0.5, 0, h + 0.025, -s * 0.6, false);
      if (kind === 'special') part(b, BOX, seal, s * 0.4, 0.05, s * 2.02, 0, h + 0.03, 0, false);
    }
  }

  private buildFixture(view: View, kind: string, toppled: boolean, s: number): void {
    const tilt = new Group();
    view.body.add(tilt);
    const body = this.tint(PALETTE.furniture, view, 0.5, 0.3);
    switch (kind) {
      case 'cooler':
        part(tilt, BOX, body, s * 1.6, 0.95, s * 1.6, 0, 0.475, 0);
        part(tilt, CYL, this.m.glass, s * 1.2, 0.55, s * 1.2, 0, 1.22, 0);
        break;
      case 'rack':
        part(tilt, CYL, this.m.darkMetal, 0.06, 1.8, 0.06, 0, 0.9, 0);
        part(tilt, CYL, this.m.darkMetal, s * 1.6, 0.05, s * 1.6, 0, 0.03, 0);
        part(tilt, BOX, this.m.fabric, s * 1.4, 0.9, s * 0.6, 0, 1.2, s * 0.3);
        break;
      case 'ficus': {
        part(tilt, CYL, this.m.wood, s * 1.5, 0.45, s * 1.5, 0, 0.225, 0);
        for (let i = 0; i < 6; i++) {
          const a = i * 2.1;
          part(tilt, SPHERE, this.m.leaf, s * 1.1, s * 0.9, s * 1.1, Math.cos(a) * s * 0.45, 0.75 + (i % 3) * 0.22, Math.sin(a) * s * 0.45);
        }
        break;
      }
      case 'bin':
        part(tilt, CYL, this.m.darkMetal, s * 1.5, 0.55, s * 1.5, 0, 0.275, 0);
        part(tilt, SPHERE, this.m.paper, s * 0.7, s * 0.5, s * 0.7, 0, 0.52, 0);
        break;
      case 'trolley':
        part(tilt, BOX, this.m.metal, s * 2.2, 0.05, s * 1.6, 0, 0.75, 0);
        part(tilt, BOX, this.m.metal, s * 2.2, 0.05, s * 1.6, 0, 0.2, 0);
        part(tilt, BOX, this.m.paper, s * 1.6, 0.3, s * 1.1, 0, 0.92, 0);
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          part(tilt, BOX, this.m.darkMetal, 0.04, 0.75, 0.04, px * s, 0.38, pz * s * 0.7);
        }
        break;
      case 'ashtray':
        part(tilt, CYL, this.m.metal, 0.06, 0.75, 0.06, 0, 0.38, 0);
        part(tilt, CYL, this.m.metal, s * 1.4, 0.06, s * 1.4, 0, 0.78, 0);
        part(tilt, CYL, this.m.darkMetal, s * 1.2, 0.04, s * 1.2, 0, 0.02, 0);
        break;
      default:
        part(tilt, BOX, body, s * 1.8, 0.9, s * 1.6, 0, 0.45, 0);
        part(tilt, BOX, this.m.paper, s * 1.4, 0.15, s * 1.2, 0, 0.97, 0);
    }
    if (toppled) tilt.rotation.x = Math.PI / 2;
  }

  private buildClerk(view: View, offended: boolean, s: number): void {
    const b = view.body;
    const extra = TUNING.render.deskExtra * U;
    part(b, BOX, this.m.wood, (s + extra) * 2.4, 0.07, (s + extra) * 1.3, 0, 0.92, s + extra * 0.5);
    part(b, BOX, this.m.furniture, (s + extra) * 2.3, 0.88, 0.07, 0, 0.44, s + extra * 1.1);
    const skin = this.flesh(offended ? PALETTE.concrete700 : PALETTE.concrete300, view);
    const H = TUNING.view3d.bodyHeight;
    part(b, CAPSULE, skin, s * 1.5, H * 0.45, s * 1.2, 0, H * 0.5, 0);
    part(b, SPHERE, skin, s * 0.9, s * 0.95, s * 0.9, 0, H * 0.84, 0);
  }

  private buildCounter(view: View, used: boolean, s: number): void {
    const b = view.body;
    const wide = s * TUNING.render.counterWide;
    part(b, BOX, this.tint(used ? PALETTE.concrete700 : PALETTE.furniture, view, 0.45, 0.35), wide * 2, 0.95, s * 2, 0, 0.475, 0);
    part(b, BOX, this.tint(used ? PALETTE.concrete500 : PALETTE.concrete300, view, 0.3, 0.1), wide * 2.1, 0.05, s * 2.1, 0, 0.975, 0);
    part(b, BOX, this.m.glass, wide * 1.9, 0.5, 0.02, 0, 1.25, -s * 0.8, false);
  }

  private drop(e: Entity): void {
    const view = this.views.get(e);
    if (view === undefined) return;
    view.root.removeFromParent();
    for (const g of view.ghosts ?? []) {
      g.removeFromParent();
      (g.material as Material).dispose();
    }
    for (const mat of view.mats) mat.dispose();
    for (const geo of view.own ?? []) geo.dispose();
    if (view.rim !== undefined) (view.rim.material as Material).dispose();
    if (this.playerRoot === view.root) this.playerRoot = null;
    this.views.delete(e);
  }

  // --- Каждый кадр -----------------------------------------------------------

  private place(
    w: World,
    e: Entity,
    view: View,
    x: number,
    z: number,
    s: number,
    f: FrameInfo,
    b: Batches,
    held: Entity,
    reachStash: Entity,
    reachCounter: Entity,
  ): void {
    const root = view.root;
    root.position.set(x, 0, z);
    const health = w.health.get(e);
    const flash = health !== undefined && health.flash > 0;
    const blink = health !== undefined && !flash && health.iframes > 0 && Math.floor(f.time * TUNING.feel.blinkRate) % 2 === 0;

    const moved = Number.isNaN(view.lastX) ? 0 : Math.hypot(x - view.lastX, z - view.lastZ);
    if (moved < 1) view.walk += moved;
    view.lastX = x;
    view.lastZ = z;

    if (e === w.player) {
      this.placePlayer(w, view, x, z, s, f, b, hurtBlink(w), flash);
      return;
    }

    root.visible = !blink;
    for (const mat of view.mats) {
      mat.emissive.setHex(flash ? 0xffffff : mat === view.lamp ? PALETTE.yellow : 0x000000);
      if (mat !== view.lamp) mat.emissiveIntensity = flash ? 0.7 : 0;
    }
    if (view.lamp !== undefined && !flash) {
      const open = litAt(w, x / U, z / U);
      view.lamp.emissiveIntensity = open ? 2.2 : 0;
      view.lamp.color.setHex(open ? PALETTE.yellow : PALETTE.concrete700);
    }

    const staff = w.staffC.get(e);
    if (staff !== undefined) {
      const bodyC = w.body.get(e);
      const vx = bodyC?.vx ?? 0;
      const vz = bodyC?.vy ?? 0;
      const speed = Math.hypot(vx, vz);
      const pt = w.transform.get(w.player);
      let yaw = root.rotation.y;
      if (staff.silhouette === 'slim' && speed > 1) yaw = Math.atan2(vx, vz);
      else if (pt !== undefined) yaw = Math.atan2(pt.x * U - x, pt.y * U - z);
      root.rotation.y = approachAngle(root.rotation.y, yaw, 0.2);
      // Шаг: подпрыгивание и наклон по ходу. Приостановленный и
      // пришитый стоят столбом.
      const still = staff.frozen > 0 || staff.pinned > 0;
      const amp = still ? 0 : Math.min(1, speed / 60);
      view.body.position.y = Math.abs(Math.sin(view.walk * 5.5)) * 0.06 * amp;
      view.body.rotation.z = Math.sin(view.walk * 5.5) * 0.06 * amp;
      view.body.rotation.x = 0.08 * amp;
      if (view.arm !== undefined) {
        const insp = w.inspectorC.get(e);
        const ax = insp?.aimX ?? 1;
        const ay = insp?.aimY ?? 0;
        view.arm.rotation.y = Math.atan2(ax, ay) - root.rotation.y;
      }
      if (view.retinue !== undefined) view.retinue.rotation.y = f.time * TUNING.render.chiefRetinueSpin;
      // Ореол заражения на полу.
      if (TUNING.render.staffGlowAlpha > 0) {
        const r = s * TUNING.render.staffGlowSpread * 2.2;
        b.glow.flat(x, z, r, r, 0.02, PALETTE.red, TUNING.render.staffGlowAlpha * 0.9);
      }
      return;
    }

    const prop = w.propC.get(e);
    if (prop !== undefined) {
      const cfg = TUNING.telekinesis;
      const lift = e === held ? (cfg.liftHeight + Math.sin(f.time * cfg.liftBobRate) * cfg.liftBob) * U * 4 : 0;
      view.body.position.y = prop.phase === 'cover' ? s * 0.95 : lift;
      if (prop.phase === 'thrown') {
        view.body.rotation.y += 0.25;
      } else if (prop.phase !== 'cover') {
        view.body.rotation.y = approachAngle(view.body.rotation.y, 0, 0.1);
      }
      if (e === held) b.glow.flat(x, z, s * 3, s * 3, 0.02, PALETTE.concrete100, 0.25);
      return;
    }

    const fixture = w.fixtureC.get(e);
    if (fixture !== undefined) {
      if (fixture.toppled) {
        view.root.rotation.y = Math.atan2(fixture.spillX, fixture.spillY);
        this.spill(w, e, x, z, b);
      }
      return;
    }

    const stash = w.stashC.get(e);
    if (stash !== undefined) {
      if (!stash.opened) this.stashIcon(b.svc, x, z, s, stash.kind, stash.item);
      if (e === reachStash && !stash.opened) {
        const pad = TUNING.render.stashReachPad * U;
        b.svc.frame(x, z, s + pad, s + pad, 0.035, 0.02, PALETTE.concrete100, 1);
      }
      return;
    }

    const clerk = w.clerkC.get(e);
    if (clerk !== undefined) {
      if (!clerk.offended || clerk.noteTime > 0) this.plate(b.svc, x, TUNING.view3d.bodyHeight * 1.05, z, s, TUNING.clerk.plateMarks);
      return;
    }

    const counter = w.counterC.get(e);
    if (counter !== undefined) {
      const spec = COUNTERS_BY_KIND.get(counter.kind as never);
      if (!counter.used) this.plate(b.svc, x, 1.45, z, s * TUNING.render.counterWide, spec === undefined ? 1 : spec.marks);
      if (e === reachCounter && !counter.used) {
        const pad = TUNING.render.stashReachPad * U;
        const wide = s * TUNING.render.counterWide;
        b.svc.frame(x, z, wide + pad, s + pad, 0.035, 0.02, PALETTE.concrete100, 1);
      }
    }
  }

  private placePlayer(w: World, view: View, x: number, z: number, s: number, f: FrameInfo, b: Batches, blink: boolean, flash: boolean): void {
    const player = w.playerC.get(w.player);
    const bodyC = w.body.get(w.player);
    if (player === undefined) return;
    const root = view.root;
    root.visible = !blink;
    const suit = view.mats[0];
    if (suit !== undefined) {
      const c = flash ? PALETTE.concrete100 : f.skin;
      suit.color.setHex(c);
      suit.emissive.setHex(c);
      suit.emissiveIntensity = f.hiss || flash ? 0.9 : 0.28;
    }

    const vx = bodyC?.vx ?? 0;
    const vz = bodyC?.vy ?? 0;
    const speed = Math.hypot(vx, vz);
    const cfg = TUNING.render;
    const dash = player.phase === 'dash';
    const yaw = dash ? Math.atan2(player.dashX, player.dashY) : Math.atan2(player.aimX, player.aimY);
    root.rotation.y = yaw;

    const amp = Math.min(1, Math.max(0, (speed - cfg.walkMinSpeed) / Math.max(1e-6, cfg.walkEase)));
    const stride = Math.max(1e-6, cfg.walkStride * U);
    const phase = (view.walk / stride) * Math.PI;
    const body = view.body;
    if (dash) {
      body.scale.set(1 / cfg.dashStretch, 1 / Math.sqrt(cfg.dashStretch), cfg.dashStretch);
      body.position.y = 0;
      body.rotation.set(0.25, 0, 0);
    } else {
      // Шаг: подъём на проходном, оседание на опорном и наклон по ходу.
      const bob = Math.abs(Math.sin(phase)) * 0.07 * amp;
      body.scale.set(1, 1 - 0.04 * amp * Math.cos(phase * 2), 1);
      body.position.y = bob;
      // Наклон считается в своих осях: тело повёрнуто к прицелу, а идти
      // может куда угодно.
      const lx = Math.cos(yaw) * vx - Math.sin(yaw) * vz;
      const lz = Math.sin(yaw) * vx + Math.cos(yaw) * vz;
      const lean = 0.0006;
      body.rotation.set(lz * lean * amp, 0, -lx * lean * amp + Math.sin(phase) * 0.04 * amp);
      // Дыхание на месте.
      if (speed < cfg.walkMinSpeed) body.scale.y = 1 + Math.sin(f.time * Math.PI * 2 / Math.max(0.1, cfg.idleBreathTime)) * cfg.idleBreath * 0.5;
    }
    if (view.rim !== undefined) view.rim.visible = !f.hiss;

    // Призраки рывка.
    const ghosts = view.ghosts ?? [];
    const spec = dash ? dashSpec(w) : null;
    const pace = spec !== null && spec.duration > 0 ? (spec.distance / spec.duration) * U : 0;
    ghosts.forEach((ghost, i) => {
      if (ghost.parent === null && root.parent !== null) root.parent.add(ghost);
      ghost.visible = dash;
      if (!dash) return;
      const back = pace * cfg.dashTrailStep * (i + 1);
      ghost.position.set(x - player.dashX * back, TUNING.view3d.bodyHeight * 0.42, z - player.dashY * back);
      ghost.rotation.y = yaw;
      const gm = ghost.material as MeshBasicMaterial;
      gm.color.setHex(f.skin);
      gm.opacity = (1 - (i + 1) / (ghosts.length + 1)) * cfg.dashGhostAlpha;
    });

    // Прицельная линия и красный ореол под ногами.
    const h = TUNING.view3d.shotHeight;
    const reach = cfg.aimLength * U;
    b.svc.line(x + player.aimX * s, z + player.aimY * s, x + player.aimX * reach, z + player.aimY * reach, cfg.aimWidth * U, h, f.skin, 0.75);
    const glowR = s * 6;
    b.glow.flat(x, z, glowR, glowR, 0.025, f.skin, 0.35);
    void s;
  }

  /** Лужа: клякса под опрокинутым, почти прозрачная, чтобы читался пол. */
  private spill(w: World, e: Entity, x: number, z: number, b: Batches): void {
    const fixture = w.fixtureC.get(e);
    const draw = w.drawC.get(e);
    if (fixture === undefined || draw === undefined) return;
    const spec = FIXTURES_BY_ID.get(fixture.kind);
    if (spec === undefined) return;
    const cfg = TUNING.fixture;
    const spread = draw.size * spec.spillSpread * U;
    const along = spread * cfg.spillStretch;
    const wide = Math.abs(fixture.spillX) >= Math.abs(fixture.spillY);
    const rx = wide ? along : spread;
    const rz = wide ? spread : along;
    const cx = x + fixture.spillX * spread * 0.4;
    const cz = z + fixture.spillY * spread * 0.4;
    const points = Math.max(3, Math.round(cfg.spillPoints));
    const color = PALETTE[spec.spill as keyof typeof PALETTE];
    const alpha = Math.min(0.85, cfg.spillAlpha * 1.4);
    for (let i = 0; i < points; i++) {
      const a0 = (i / points) * Math.PI * 2;
      const a1 = ((i + 1) / points) * Math.PI * 2;
      const w0 = 1 - cfg.spillWobble * spillNoise(e, i);
      const w1 = 1 - cfg.spillWobble * spillNoise(e, (i + 1) % points);
      const p0x = cx + Math.cos(a0) * rx * w0;
      const p0z = cz + Math.sin(a0) * rz * w0;
      const p1x = cx + Math.cos(a1) * rx * w1;
      const p1z = cz + Math.sin(a1) * rz * w1;
      b.decal.quad(cx, 0.004, cz, p0x, 0.004, p0z, p1x, 0.004, p1z, p1x, 0.004, p1z, color, alpha);
    }
  }

  // --- Служебное ---------------------------------------------------------------

  private service(w: World, f: FrameInfo, b: Batches, candidate: Entity, held: Entity): void {
    const svc = b.svc;
    svc.right.copy(f.camRight);
    svc.up.copy(f.camUp);
    const R = TUNING.render;
    const H = TUNING.view3d.bodyHeight;
    const shotH = TUNING.view3d.shotHeight;
    const line = R.telegraphWidth * U;
    const pos = (e: Entity): { x: number; z: number } | null => {
      const t = w.transform.get(e);
      if (t === undefined) return null;
      return { x: lerp(t.px, t.x, f.alpha) * U, z: lerp(t.py, t.y, f.alpha) * U };
    };

    // Линия огня инспектора.
    for (const [e, inspector] of w.inspectorC) {
      const staff = w.staffC.get(e);
      const p = pos(e);
      const pt = w.transform.get(w.player);
      const t = w.transform.get(e);
      if (staff === undefined || staff.plateFlash <= 0 || p === null || pt === undefined || t === undefined) continue;
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;
      const len = Math.hypot(dx, dy) || 1;
      const aim = inspector.shotsLeft > 0 ? { x: inspector.aimX, y: inspector.aimY } : { x: dx / len, y: dy / len };
      const pen = telegraphPen(w, staff.plateFlash);
      const ray = R.telegraphRay * U;
      svc.line(p.x, p.z, p.x + aim.x * ray, p.z + aim.y * ray, pen.width * U, shotH, pen.color, pen.alpha);
    }

    // Ревизор: луч на предмет описи.
    for (const [e, auditor] of w.auditorC) {
      if (auditor.phase === 'open' || auditor.target < 0) continue;
      const a = pos(e);
      const t = pos(auditor.target);
      if (a === null || t === null) continue;
      svc.line(a.x, a.z, t.x, t.z, line, shotH, PALETTE.concrete100, R.serviceRayAlpha);
    }

    // Цель захвата и удерживаемое.
    for (const mark of [candidate, held]) {
      if (mark < 0) continue;
      const p = pos(mark);
      const draw = w.drawC.get(mark);
      if (p === null || draw === undefined) continue;
      const half = (draw.size + R.telegraphInset) * U;
      svc.frame(p.x, p.z, half, half, line, 0.03, PALETTE.concrete100, mark === held ? 1 : 0.45);
    }
    if (held >= 0) {
      const a = pos(w.player);
      const t = pos(held);
      if (a !== null && t !== null) svc.line(a.x, a.z, t.x, t.z, line, shotH, PALETTE.concrete100, R.holdRayAlpha);
    }

    // Знаки над штатом.
    for (const [e, staff] of w.staffC) {
      const p = pos(e);
      const draw = w.drawC.get(e);
      if (p === null || draw === undefined) continue;
      const s = draw.size * U;
      if (staff.control) {
        const gap = R.controlOutlineGap * U;
        for (const pad of [gap, gap * 2]) svc.frame(p.x, p.z, s + pad, s + pad, R.controlOutline * U, 0.03, PALETTE.concrete100, 1);
      }
      // Таблички на груди, лицом к камере.
      const count = Math.max(1, staff.plates);
      for (let i = 0; i < count; i++) {
        this.plate(svc, p.x, H * (0.62 - i * 0.12), p.z + s * 1.05, s, staff.plateMarks);
      }
      if (staff.pinned > 0) {
        const half = s * R.stapleSpan;
        const leg = s * R.stapleLeg;
        const pen = R.stapleWidth * U;
        const y = H * 0.5;
        svc.upright(p.x - half, y, p.z + s, pen / 2, leg, PALETTE.concrete100);
        svc.upright(p.x + half, y, p.z + s, pen / 2, leg, PALETTE.concrete100);
        svc.upright(p.x, y + leg, p.z + s, half + pen / 2, pen / 2, PALETTE.concrete100);
      } else if (staff.frozen > 0) {
        const half = R.suspendStamp * U;
        const y = H * 1.15;
        svc.upright(p.x, y + half, p.z, half, 0.02, PALETTE.concrete100);
        svc.upright(p.x, y - half, p.z, half, 0.02, PALETTE.concrete100);
        svc.upright(p.x - half, y, p.z, 0.02, half, PALETTE.concrete100);
        svc.upright(p.x + half, y, p.z, 0.02, half, PALETTE.concrete100);
        svc.upright(p.x, y, p.z, half * 0.6, 0.025, PALETTE.concrete100);
      }
      if (staff.plateFlash > 0) {
        const pen = telegraphPen(w, staff.plateFlash);
        const inset = (draw.size + R.telegraphInset) * U;
        svc.frame(p.x, p.z, inset, inset, pen.width * U, 0.04, pen.color, pen.alpha);
      }
      if (w.registrarC.has(e)) this.counts(svc, p.x, H * 1.15, p.z, vacancyCount(w));
      const auditor = w.auditorC.get(e);
      if (auditor !== undefined) {
        this.counts(svc, p.x, H * 1.25, p.z, auditor.phase === 'open' ? 0 : pendingItems(w));
        if (auditor.phase !== 'open') {
          const inset = (draw.size + R.auditShieldInset) * U;
          svc.frame(p.x, p.z, inset, inset, R.auditShieldWidth * U, 0.03, PALETTE.concrete300, 1);
        }
      }
      if (w.commissionC.get(e)?.chair === true) {
        const pad = (draw.size + R.chairOutline) * U;
        svc.ring(p.x, p.z, pad * 1.2, R.stashEdge * U * 1.5, 0.03, PALETTE.concrete100, 1, 32);
      }
      // Во тьме сотрудника видно только по табличке.
      if (f.dark) this.plate(svc, p.x, H * 0.62, p.z + s * 1.05, s, staff.plateMarks);
    }

    // Кольцо бланка и облако огнетушителя.
    const blankLeft = fxLeft(w.fx.blankTime, f.alpha);
    if (blankLeft > 0) {
      const full = TUNING.blank.ringTime;
      const grown = full <= 0 ? 1 : 1 - blankLeft / full;
      const fade = 1 - grown * grown * grown;
      b.decal.ring(w.fx.blankX * U, w.fx.blankY * U, TUNING.blank.cancelRadius * grown * U, TUNING.blank.ringWidth * U * 1.5, 0.05, PALETTE.concrete100, TUNING.blank.ringAlpha * fade, 64);
      b.glow.ring(w.fx.blankX * U, w.fx.blankY * U, TUNING.blank.cancelRadius * grown * U, TUNING.blank.ringWidth * U * 5, 0.06, PALETTE.concrete100, 0.25 * fade, 64);
    }
    const cloudLeft = fxLeft(w.fx.cloudTime, f.alpha);
    if (cloudLeft > 0) {
      const cfg = TUNING.cloud;
      const grown = 1 - cloudLeft / Math.max(1e-6, cfg.time);
      const fade = 1 - grown * grown;
      const rings = Math.max(1, Math.round(cfg.rings));
      for (let i = 0; i < rings; i++) {
        const spread = grown * (1 - i / (rings + 1));
        const r = cfg.radius * spread * U;
        b.glow.flat(w.fx.cloudX * U, w.fx.cloudY * U, r, r, 0.3 + i * 0.25, PALETTE.concrete300, cfg.alpha * fade * 0.6);
      }
    }

    // Щитки освещения.
    if (w.sections.length > 0) {
      const half = R.sectionSize * U;
      for (const section of w.sections) {
        const sx = section.x * U;
        const sz = section.y * U;
        b.decal.flat(sx, sz, half, half, 0.012, PALETTE.black, 1);
        b.decal.frame(sx, sz, half, half, R.sectionEdge * U, 0.014, section.lit ? PALETTE.yellow : PALETTE.concrete500, 1);
        if (section.lit) {
          const core = half * R.sectionCore;
          b.decal.flat(sx, sz, core, core, 0.016, PALETTE.yellow, 1);
          b.glow.flat(sx, sz, half * 4, half * 4, 0.02, PALETTE.yellow, 0.35);
          continue;
        }
        const done = Math.max(0, Math.min(1, section.charge / Math.max(0.001, TUNING.keeper.relightTime)));
        if (done > 0) b.decal.flat(sx, sz + half - half * done, half, half * done, 0.016, PALETTE.yellow, 0.5);
      }
    }

    if (f.showHitboxes) {
      for (const [e, body] of w.body) {
        const p = pos(e);
        if (p === null) continue;
        const r = body.radius * U;
        svc.frame(p.x, p.z, r, r, R.hitboxWidth * U, 0.05, PALETTE.yellow, 1);
        svc.ring(p.x, p.z, r, R.hitboxWidth * U, 0.05, PALETTE.red, 0.6, 24);
      }
    }
  }

  /** Табличка: жёлтая пластина с насечками по старшинству. */
  private plate(svc: QuadBatch, x: number, y: number, z: number, size: number, marks: number): void {
    const R = TUNING.render;
    const w = size * R.plateWidthFactor * 0.5;
    const h = R.plateHeight * U * 0.6;
    svc.upright(x, y, z, w, h, PALETTE.yellow, 1);
    const mark = R.plateMarkSize * U * 0.6;
    const gap = R.plateMarkGap * U * 0.6;
    const total = marks * mark * 2 + Math.max(0, marks - 1) * gap;
    let cursor = x - total / 2 + mark;
    for (let i = 0; i < marks; i++) {
      // Насечка чуть ближе к камере, чтобы не мерцала с пластиной.
      svc.upright(cursor + svc.right.x * 0, y, z + 0.002, mark, mark, PALETTE.black, 1);
      cursor += mark * 2 + gap;
    }
  }

  /** Сколько ставок ещё закрывать: ряд жёлтых квадратов над головой. */
  private counts(svc: QuadBatch, x: number, y: number, z: number, open: number): void {
    const mark = TUNING.render.vacancyMark * U * 0.6;
    const gap = TUNING.render.vacancyGap * U * 0.6;
    const total = open * mark * 2 + Math.max(0, open - 1) * gap;
    let cursor = x - total / 2 + mark;
    for (let i = 0; i < open; i++) {
      svc.upright(cursor, y, z, mark, mark, PALETTE.yellow, 1);
      cursor += mark * 2 + gap;
    }
  }

  /** Знак позиции прилавка на крышке: выбирать, куда идти, надо издали. */
  private stashIcon(svc: QuadBatch, x: number, z: number, s: number, kind: string, item: string): void {
    const top = kind === 'safe' ? 1.16 : kind === 'walled' ? TUNING.view3d.bodyHeight * 1.06 : 0.96;
    const m = s * 0.55;
    const c = PALETTE.concrete100;
    const t = 0.035;
    const y = top + 0.01;
    switch (kind) {
      case 'pass':
        svc.flat(x, z, m * 0.25, m, y, c);
        break;
      case 'blank':
        svc.frame(x, z, m, m, t, y, c);
        svc.flat(x, z, m * 0.6, t, y, c);
        break;
      case 'ammo':
        svc.flat(x - m * 0.5, z, m * 0.35, m * 0.5, y, c);
        svc.flat(x + m * 0.5, z, m * 0.35, m * 0.5, y, c);
        break;
      case 'evac':
        svc.frame(x, z, m, m, t, y, c);
        svc.line(x - m * 0.2, z, x + m * 0.8, z - m * 0.5, t, y, c);
        break;
      case 'verdict':
        if (item === 'destroy') {
          svc.line(x - m, z - m, x + m, z + m, t * 1.2, y, c);
          svc.line(x + m, z - m, x - m, z + m, t * 1.2, y, c);
        } else if (item === 'sign') {
          svc.flat(x, z + m * 0.5, m, t / 2, y, c);
          svc.line(x - m * 0.6, z + m * 0.3, x + m * 0.2, z - m * 0.6, t, y, c);
        } else {
          svc.flat(x - m * 0.3, z - m * 0.5, m * 0.7, t / 2, y, c);
          svc.flat(x + m * 0.3, z + m * 0.4, m * 0.7, t / 2, y, c);
        }
        break;
      case 'form':
        svc.flat(x, z - m * 0.65, m, m * 0.25, y, c);
        svc.flat(x, z + m * 0.25, m * 0.2, m * 0.65, y, c);
        break;
      case 'heal':
        svc.flat(x, z, m * 0.25, m, y, c);
        svc.flat(x, z, m, m * 0.25, y, c);
        break;
      default:
        break;
    }
  }

  // --- Снаряды ---------------------------------------------------------------

  private bullets(w: World, f: FrameInfo, b: Batches): void {
    const counts: Record<string, number> = {};
    for (const name of Object.keys(this.shots)) counts[name] = 0;
    const h = TUNING.view3d.shotHeight;
    for (const [e] of w.bulletC) {
      const draw = w.drawC.get(e);
      const t = w.transform.get(e);
      if (draw === undefined || t === undefined) continue;
      const x = lerp(t.px, t.x, f.alpha) * U;
      const z = lerp(t.py, t.y, f.alpha) * U;
      const s = draw.size * U;
      const glow = draw.color === PALETTE.red;
      const shape = SHOT_SHAPES.includes(draw.shape as (typeof SHOT_SHAPES)[number]) ? draw.shape : 'dot';
      const name = glow ? `glow:${shape === 'card' ? 'dot' : shape}` : `solid:${shape}`;
      const mesh = this.shots[name];
      if (mesh === undefined) continue;
      const i = counts[name] ?? 0;
      if (i >= mesh.instanceMatrix.count) continue;
      counts[name] = i + 1;

      const body = w.body.get(e);
      const vx = body?.vx ?? 1;
      const vz = body?.vy ?? 0;
      const yaw = Math.atan2(vx, vz);
      this.tmpP.set(x, h, z);
      if (shape === 'card') {
        // Карточка летит плашмя и вращается: бумага, а не пуля.
        this.tmpQ.setFromAxisAngle(this.up, yaw + f.time * 9 + e);
        this.tmpS.set(s * TUNING.render.cardAcross * 2, 1, s * TUNING.render.cardAlong * 2);
      } else if (shape === 'bar') {
        this.tmpQ.setFromEuler(this.tmpE.set(Math.PI / 2, yaw, 0, 'YXZ'));
        this.tmpS.set(s * 1.4, s * TUNING.render.barLengthFactor * 1.2, s * 1.4);
      } else if (shape === 'diamond') {
        this.tmpQ.setFromAxisAngle(this.up, f.time * 6);
        this.tmpS.set(s * 2.2, s * 2.2, s * 2.2);
      } else {
        this.tmpQ.identity();
        this.tmpS.set(s * 2, s * 2, s * 2);
      }
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      mesh.setMatrixAt(i, this.tmpM);
      this.tmpC.setHex(draw.color);
      if (glow) this.tmpC.multiplyScalar(5);
      mesh.setColorAt(i, this.tmpC);
      if (glow) b.glow.upright(x, h, z, s * 4, s * 4, draw.color, 0.9);
    }
    for (const [name, mesh] of Object.entries(this.shots)) {
      mesh.count = counts[name] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
  }
}

// --- Мелочи ------------------------------------------------------------------

/**
 * Контур от кромки: чем круче поверхность уходит от взгляда, тем сильнее
 * она светится сама. Так тёмный сотрудник отделяется от тёмного пола,
 * не получая ни своего света, ни краски.
 */
function withRim(mat: MeshStandardMaterial, color: number, power: number): void {
  const rim = new Color(color).multiplyScalar(power);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uRim'] = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimK = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);\n  totalEmissiveRadiance += uRim * rimK;',
      );
  };
}

/**
 * Деталь узла: заготовка, масштабированная и поставленная на место.
 * rotX — поворот вокруг X, нужен капсулам, лежащим вдоль хода.
 */
function part(
  parent: Object3D,
  geo: BufferGeometry,
  mat: Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  cast = true,
  rotX = 0,
): Mesh {
  const mesh = new Mesh(geo, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  if (rotX !== 0) mesh.rotation.x = rotX;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fxLeft(left: number, alpha: number): number {
  return Math.max(0, left - alpha * STEP);
}

function hash01(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

function spillNoise(e: number, i: number): number {
  const v = Math.sin((e * 7 + i * 31) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/** Поворот к цели кратчайшим путём, с ограничением доли за кадр. */
function approachAngle(from: number, to: number, k: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

function telegraphPen(w: World, flash: number): { width: number; color: number; alpha: number } {
  const R = TUNING.render;
  const near = flash <= R.telegraphNear;
  const rate = near ? R.telegraphBlinkFast : R.telegraphBlinkSlow;
  const lit = Math.floor(w.tick * STEP * rate) % 2 === 0;
  return {
    width: R.telegraphWidth * (near ? R.telegraphNearFactor : 1),
    color: PALETTE.concrete100,
    alpha: lit ? R.telegraphAlpha : R.telegraphAlphaOff,
  };
}

/** Окно неуязвимости рывка: мигание после урона считается сверх него. */
export function hurtBlink(w: World): boolean {
  const health = w.health.get(w.player);
  return (
    health !== undefined &&
    health.flash <= 0 &&
    health.iframes > dashIFrameWindow(w) &&
    Math.floor(w.tick * STEP * TUNING.feel.blinkRate) % 2 === 0
  );
}
