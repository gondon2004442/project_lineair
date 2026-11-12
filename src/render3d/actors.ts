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
import { isSolidPoint } from '../room';
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
import { Rig, shadeAll, type RigSpec } from './rig';
import type { Debris, DebrisKind } from './debris';
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
  rimMat?: MeshBasicMaterial;
  rig?: Rig;
  /** Сглаженный поворот ног относительно корпуса. */
  legYaw?: number;
  /** Скорость по последним кадрам, клеток/с: для обломков при распаде. */
  vx?: number;
  vz?: number;
  /** Скорость брошенного на прошлом кадре: по её провалу виден удар. */
  lastSpeed?: number;
  /** Кувырок брошенного: накопленный угол и ось. */
  tumble?: number;
  /** Цвет основного материала: им крошится при распаде. */
  tint?: number;
  /**
   * Человек, а не должность: подвешенный, опущенный или снятый. Висит,
   * сидит на полу или сидит на стуле.
   */
  civ?: 'hung' | 'floor' | 'chair';
  /** Обломок: своя геометрия, её надо освободить. */
  own?: BufferGeometry[];
  seen: boolean;
  /** Прошлая точка: по ней считается походка. */
  lastX: number;
  lastZ: number;
  walk: number;
}

export interface Batches {
  /** Пыль из-под ног: мягкие пятна, растут и тают. */
  puff: QuadBatch;
  /** Пятна на полу: лужи, щитки, кольца. Под пересчётом красного. */
  decal: QuadBatch;
  /** Аддитивные ореолы: заражение, субъект, снаряды. */
  glow: QuadBatch;
  /** Служебный слой поверх всего кадра. */
  svc: QuadBatch;
}

export interface FrameInfo {
  alpha: number;
  /** Реальное время кадра, с: для обломков и скоростей. */
  dt: number;
  /** Пол мягкий: ковролин глушит шаг. */
  soft: boolean;
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
  /** Звуки кадра: шаги. Забирает рендер. */
  readonly events: string[] = [];
  private readonly puffs: { x: number; z: number; t: number; size: number; life: number }[] = [];
  private lastStep = 0;
  private lastPuff = 0;
  /** Обломки кадра. Ставит рендер. */
  debris: Debris | null = null;
  /** Помещение сменилось: ушедшие сущности не умерли, а остались там. */
  quiet = false;
  /** Пули прошлого кадра: исчезнувшая раньше срока — попала. */
  private flying = new Map<Entity, { x: number; z: number; vx: number; vz: number; life: number; glow: boolean; card: boolean }>();

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

  /** Время последнего кадра: распад случается вне place(). */
  private clock = 0;

  sync(w: World, f: FrameInfo, b: Batches): void {
    this.clock = f.time;
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
        if (view !== undefined) {
          this.transition(w, e, view, key);
          this.drop(e);
        }
        view = this.build(w, e, key, draw.size * U, draw.color);
        view.tint = draw.color;
        shadeAll(view.root);
        this.views.set(e, view);
        this.group.add(view.root);
      }
      view.seen = true;
      const x = lerp(t.px, t.x, f.alpha) * U;
      const z = lerp(t.py, t.y, f.alpha) * U;
      this.place(w, e, view, x, z, draw.size * U, f, b, held, reachStash, reachCounter);
    }

    for (const [e, view] of this.views) {
      if (view.seen) continue;
      if (!this.quiet) this.gone(w, e, view);
      this.drop(e);
    }
    this.quiet = false;

    this.service(w, f, b, candidate, held);
    this.bullets(w, f, b);
    this.dust(f, b);
  }

  // --- Ключ и сборка ---------------------------------------------------------

  private keyOf(w: World, e: Entity, shape: string): string {
    if (e === w.player) return 'player';
    // Мишень аттестации — тоже предмет, но читаться должна как цель.
    if (w.targetC.has(e)) return 'target';
    const stash = w.stashC.get(e);
    if (stash !== undefined) return `stash:${stash.kind}:${stash.opened}`;
    const fixture = w.fixtureC.get(e);
    if (fixture !== undefined) return `fix:${fixture.kind}:${fixture.toppled}:${fixture.hung}`;
    const clerk = w.clerkC.get(e);
    if (clerk !== undefined) return `clerk:${clerk.offended}`;
    const counter = w.counterC.get(e);
    if (counter !== undefined) return `counter:${counter.used}`;
    if (w.ticketC.has(e)) return 'ticket';
    const staff = w.staffC.get(e);
    if (staff !== undefined) {
      if (staff.retired) return 'retired';
      // У начальника отдела кадров своей карточки должности нет: силуэт
      // ему даёт вид, а не данные.
      const sil = staff.post === 'personnel' ? 'personnel' : staff.silhouette;
      return `staff:${sil}:${w.drawC.get(e)?.desk === true}`;
    }
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
        if (kind[1] === 'hung') this.buildCivilian(view, s, kind[3] === 'true' ? 'hung' : 'floor', e);
        else this.buildFixture(view, kind[1] ?? '', kind[2] === 'true', s);
        break;
      case 'retired':
        this.buildCivilian(view, s, 'chair', e);
        break;
      case 'target':
        this.buildTarget(view, s);
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

  private brassMat: MeshStandardMaterial | null = null;
  /** Латунь: общая на всех, не вспыхивает. */
  private brass(): MeshStandardMaterial {
    if (this.brassMat === null) this.brassMat = new MeshStandardMaterial({ color: 0x8a7038, metalness: 0.85, roughness: 0.35 });
    return this.brassMat;
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
    const shoe = this.tint(0x141416, view, 0.5);
    const rig = new Rig({ height: H, shoulder: s * 0.82, hunch: 0.04, headSink: 0, head: 1, bulk: 1, arm: 1 }, { suit, skin, shoe });
    view.body.add(rig.root);
    view.rig = rig;
    // Волосы: тёмная шапка на затылке, собранные назад.
    const hairCap = new Mesh(SPHERE, hair);
    hairCap.scale.set(H * 0.13, H * 0.12, H * 0.14);
    hairCap.position.set(0, H * 0.025, -H * 0.012);
    hairCap.castShadow = true;
    rig.head.add(hairCap);
    // Табельное в правой руке: ствол вдоль кисти, смотрит туда же, куда рука.
    part(rig.handR, BOX, this.m.darkMetal, 0.06, 0.24, 0.09, 0, -0.1, 0.02);
    part(rig.handR, BOX, this.m.darkMetal, 0.05, 0.08, 0.14, 0, 0.0, -0.05);
    // Кант: светлая обводка, чтобы субъект не тонул на тёмном полу.
    const rimMat = new MeshBasicMaterial({ color: PALETTE.concrete100, side: BackSide, transparent: true, opacity: 0.7 });
    view.rimMat = rimMat;
    rig.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh !== true || mesh.material === rimMat) return;
      const hull = new Mesh(mesh.geometry, rimMat);
      hull.scale.setScalar(1.12);
      mesh.add(hull);
    });
    // Призраки рывка.
    view.ghosts = [];
    for (let i = 0; i < Math.max(0, TUNING.render.dashTrail); i++) {
      const gm = new MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0, depthWrite: false });
      const ghost = new Mesh(CAPSULE, gm);
      ghost.scale.set(s * 1.6, H * 0.5, s * 1.2);
      ghost.visible = false;
      view.ghosts.push(ghost);
    }
  }

  private buildStaff(w: World, e: Entity, view: View, sil: string, desk: boolean, s: number, color: number): void {
    const H = TUNING.view3d.bodyHeight;
    const R = TUNING.render;
    const skin = this.flesh(color, view);
    // Форма: тёмная шерсть. Светлее у младших — у них ещё остался цвет.
    const light = Math.min(1, ((color >> 16) & 255) / 255);
    const suit = this.tint(new Color(0x4a515b).lerp(new Color(0x7d848c), light).getHex(), view, 0.85);
    const shoe = this.tint(0x15161a, view, 0.9, 0);
    const mats = { suit, skin, shoe };
    const b = view.body;
    if (desk) {
      const extra = R.deskExtra * U;
      part(b, BOX, this.m.wood, (s + extra) * 2.4, 0.06, (s + extra) * 1.3, 0, 0.78, s + extra * 0.8);
      part(b, BOX, this.m.darkMetal, (s + extra) * 2.2, 0.72, 0.06, 0, 0.38, s + extra * 1.4);
    }
    let spec: RigSpec = { height: H * 0.95, shoulder: s * 0.85, hunch: 0.08, headSink: 0.1, head: 1, bulk: 1, arm: 1 };
    switch (sil) {
      case 'armed':
        spec = { height: H, shoulder: s * 0.78, hunch: 0, headSink: 0, head: 0.95, bulk: 0.9, arm: 1.08 };
        break;
      case 'wide':
        spec = { height: H * 0.92, shoulder: s * 1.55, hunch: 0.12, headSink: 0.35, head: 0.9, bulk: 1.45, arm: 0.92 };
        break;
      case 'bulk':
        spec = { height: H * 1.08, shoulder: s * 1.2, hunch: 0.28, headSink: 0, head: 0, bulk: 1.7, arm: 0.85 };
        break;
      case 'desk':
        spec = { height: H * 1.1, shoulder: s * 1.1, hunch: 0.04, headSink: 0.05, head: 1.1, bulk: 1.3, arm: 1 };
        break;
      case 'counter':
        spec = { height: H * 0.95, shoulder: s * 1.0, hunch: 0.2, headSink: 0.2, head: 1, bulk: 1.1, arm: 1, seated: true };
        break;
      case 'lamp':
        spec = { height: H * 1.15, shoulder: s * 0.55, hunch: 0, headSink: 0, head: 0, bulk: 0.75, arm: 1.2 };
        break;
      case 'seat':
        spec = { height: H * 0.95, shoulder: s * 0.9, hunch: 0.1, headSink: 0.1, head: 1, bulk: 1, arm: 1, seated: true };
        break;
      case 'slim':
        spec = { height: H, shoulder: s * 0.62, hunch: 0.22, headSink: 0, head: 0.88, bulk: 0.72, arm: 1.05 };
        break;
      case 'personnel':
        // Начальник отдела кадров: высокий, прямой, в длинном пальто.
        spec = { height: H * 1.14, shoulder: s * 0.82, hunch: -0.04, headSink: 0, head: 1.0, bulk: 1.05, arm: 1.05 };
        break;
      default:
        // Стажёр: сутулый, голова ушла в плечи.
        spec = { height: H * 0.9, shoulder: s * 0.92, hunch: 0.38, headSink: 0.6, head: 1, bulk: 1.1, arm: 0.95 };
    }
    const rig = new Rig(spec, mats);
    b.add(rig.root);
    view.rig = rig;
    const T = rig.torsoLen;
    switch (sil) {
      case 'armed': {
        // Воротник шире плеч — его видно и в чёрном пятне. Штамп в руке.
        const cw = spec.shoulder * 2.1;
        const collar = part(rig.torso, TORUS, skin, cw, cw, cw * 0.7, 0, T * 0.98, 0);
        collar.rotation.x = Math.PI / 2;
        part(rig.handR, BOX, this.m.darkMetal, 0.08, 0.22, 0.1, 0, -0.1, 0);
        break;
      }
      case 'wide': {
        // По бокам — картотечные ящики, вросшие в руки.
        const cab = this.tint(PALETTE.furniture, view, 0.45, 0.4);
        const arm = s * R.armThickness;
        part(rig.handL, BOX, cab, arm * 2.6, H * 0.3, s * 1.2, 0, -H * 0.12, 0);
        part(rig.handR, BOX, cab, arm * 2.6, H * 0.3, s * 1.2, 0, -H * 0.12, 0);
        break;
      }
      case 'bulk': {
        // Масса смещена влево, головы нет вовсе: она поглощена.
        const leftW = s * R.bulkLeft;
        part(rig.torso, SPHERE, skin, leftW * 2.3, T * 1.6, leftW * 2, -spec.shoulder * 0.7, T * 0.75, 0);
        part(rig.torso, SPHERE, skin, leftW * 1.3, T * 1.0, leftW * 1.3, -spec.shoulder * 0.2, T * 1.15, -0.05);
        part(rig.torso, SPHERE, skin, leftW * 0.8, T * 0.6, leftW * 0.9, spec.shoulder * 0.5, T * 1.05, 0.05);
        break;
      }
      case 'desk': {
        const retinue = new Group();
        const count = Math.max(0, R.chiefRetinue);
        const ring = s * R.chiefRetinueRadius;
        const mark = s * R.chiefRetinueSize;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const plate = part(retinue, BOX, this.m.signLit, mark * 2, mark, 0.04, Math.cos(a) * ring, 0, Math.sin(a) * ring, false);
          plate.rotation.y = -a + Math.PI / 2;
        }
        retinue.position.y = H * 0.8;
        view.root.add(retinue);
        view.retinue = retinue;
        // Наросты на плечах: у заведующего кожи почти не осталось.
        part(rig.torso, SPHERE, skin, s * 0.9, s * 0.7, s * 0.9, -spec.shoulder * 0.8, T * 0.95, 0);
        part(rig.torso, SPHERE, skin, s * 0.7, s * 0.6, s * 0.7, spec.shoulder * 0.9, T * 0.9, 0.05);
        break;
      }
      case 'counter': {
        const wide = s * R.counterDeskWide;
        const tall = s * R.counterDeskTall;
        part(b, BOX, this.m.wood, wide * 2, 0.08, tall * 1.4, 0, 0.92, tall * 0.9);
        part(b, BOX, this.tint(PALETTE.furniture, view, 0.5, 0.3), wide * 2, 0.88, 0.1, 0, 0.44, tall * 1.5);
        part(b, BOX, this.m.darkMetal, s * 1.6, 0.06, s * 1.4, 0, 0.47, 0);
        break;
      }
      case 'lamp': {
        // Вместо головы — фонарь: под лампой светлый, в темноте глухой.
        const lamp = new MeshStandardMaterial({ color: PALETTE.concrete700, emissive: PALETTE.yellow, emissiveIntensity: 0, roughness: 0.4 });
        view.mats.push(lamp);
        const lampSize = s * R.keeperLamp * 2.2;
        part(rig.torso, BOX, lamp, lampSize, lampSize, lampSize, 0, T + lampSize * 0.7, 0);
        part(rig.torso, BOX, this.m.darkMetal, lampSize * 1.25, 0.05, lampSize * 1.25, 0, T + lampSize * 1.25, 0);
        part(rig.torso, BOX, this.m.darkMetal, lampSize * 1.25, 0.05, lampSize * 1.25, 0, T + lampSize * 0.15, 0);
        view.lamp = lamp;
        break;
      }
      case 'seat': {
        part(b, BOX, this.m.darkMetal, s * 2.0, 0.06, s * 1.7, 0, 0.47, -0.05);
        part(b, BOX, this.m.darkMetal, s * 2.0, 0.85, 0.07, 0, 0.88, -s * 0.9);
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) part(b, BOX, this.m.darkMetal, 0.04, 0.45, 0.04, px * s * 0.9, 0.22, pz * s * 0.75);
        break;
      }
      case 'personnel': {
        // Пальто ниже колен, папка с распоряжениями под мышкой, штамп в
        // руке. Над головой ходят листы — те, что он ещё не выдал.
        const coat = this.tint(0x2b3036, view, 0.8);
        part(rig.pelvis, CYL, coat, spec.shoulder * 2.3, rig.legLen * 0.75, spec.shoulder * 1.7, 0, -rig.legLen * 0.33, 0);
        part(rig.torso, BOX, coat, spec.shoulder * 2.25, T * 0.95, spec.shoulder * 1.45, 0, T * 0.48, 0);
        const lapel = part(rig.torso, BOX, this.m.paper, spec.shoulder * 0.5, T * 0.4, 0.02, 0, T * 0.72, spec.shoulder * 0.74, false);
        lapel.rotation.z = Math.PI / 4;
        part(rig.handL, BOX, this.m.darkMetal, 0.06, 0.34, 0.26, 0.02, -0.14, 0);
        part(rig.handL, BOX, this.m.paper, 0.05, 0.31, 0.24, 0.05, -0.14, 0, false);
        part(rig.handR, CYL, this.m.wood, 0.05, 0.14, 0.05, 0, -0.08, 0);
        part(rig.handR, CYL, this.m.darkMetal, 0.11, 0.04, 0.11, 0, -0.16, 0);
        const retinue = new Group();
        const paper = new MeshStandardMaterial({ color: PALETTE.paper, emissive: PALETTE.paper, emissiveIntensity: 0.3, roughness: 0.8, side: 2 });
        view.mats.push(paper);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const sheet = part(retinue, BOX, paper, s * 0.8, s * 1.1, 0.01, Math.cos(a) * s * 2.3, Math.sin(i * 2.1) * 0.12, Math.sin(a) * s * 2.3, false);
          sheet.rotation.y = -a;
          sheet.rotation.x = 0.4;
        }
        retinue.position.y = H * 1.28;
        view.root.add(retinue);
        view.retinue = retinue;
        // Нарост: на спине у него вросла картотека — ровными пластами.
        for (let i = 0; i < 4; i++) part(rig.torso, BOX, skin, spec.shoulder * 1.6, 0.05, spec.shoulder * 0.5, 0, T * (0.35 + i * 0.13), -spec.shoulder * 0.8);
        break;
      }
      case 'slim': {
        // Сумка через плечо: по ней видно, куда бежит.
        const bag = s * R.courierBag;
        part(rig.torso, BOX, this.m.fabric, bag * 2.2, bag * 2.2, bag * 1.1, -spec.shoulder * 1.15, T * 0.3, 0);
        part(rig.torso, BOX, this.m.fabric, 0.03, T * 1.1, 0.03, 0, T * 0.6, spec.shoulder * 0.5);
        break;
      }
      default: {
        // Вспухшее плечо: заражение начинается отсюда.
        const lump = s * R.internShoulder;
        part(rig.torso, SPHERE, skin, lump * 2.6, lump * 2.3, lump * 2.4, -spec.shoulder * 1.05, T * 0.85, 0);
        part(rig.torso, SPHERE, skin, lump * 1.4, lump * 1.2, lump * 1.4, -spec.shoulder * 0.6, T * 1.05, -0.05);
      }
    }
    void w;
    void e;
  }

  /**
   * Человек без должности. Подвешенный висит над полом, руки плетьми;
   * опущенный сидит на полу; снятый с должности — на стуле, ссутулившись.
   * Бетона на нём нет: кожа вернулась вместе с назначением, которого нет.
   */
  private buildCivilian(view: View, s: number, how: 'hung' | 'floor' | 'chair', e: Entity): void {
    const H = TUNING.view3d.bodyHeight;
    const shades = [0x3b4048, 0x4a4338, 0x2f3a3f, 0x50545a];
    const suit = this.tint(shades[e % shades.length] ?? 0x3b4048, view, 0.85);
    const skin = this.tint(how === 'hung' ? 0x9c968f : PALETTE.skin, view, 0.6);
    const shoe = this.tint(0x15161a, view, 0.9, 0);
    const seated = how !== 'hung';
    const rig = new Rig(
      { height: H * 0.94, shoulder: s * 0.8, hunch: how === 'chair' ? 0.32 : 0.12, headSink: 0.1, head: 1, bulk: 1, arm: 1, seated },
      { suit, skin, shoe },
    );
    view.body.add(rig.root);
    view.rig = rig;
    view.civ = how;
    if (how === 'chair') {
      const b = view.body;
      part(b, BOX, this.m.darkMetal, s * 2.0, 0.05, s * 1.7, 0, 0.47, -0.05);
      part(b, BOX, this.m.darkMetal, s * 2.0, 0.6, 0.05, 0, 0.8, -s * 0.9);
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) part(b, BOX, this.m.darkMetal, 0.035, 0.45, 0.035, px * s * 0.9, 0.22, pz * s * 0.75);
    }
    if (how === 'hung') {
      // Нить, на которой его держит здание: тонкая, почти невидимая.
      const thread = new MeshBasicMaterial({ color: PALETTE.concrete300, transparent: true, opacity: 0.25, depthWrite: false });
      // Освобождается вместе с узлом, как кант субъекта.
      view.rimMat = thread;
      part(view.body, CYL, thread, 0.012, 3, 0.012, 0, H + 1.5, 0, false);
    }
  }

  /** Мишень аттестации: щит на стойке, кольцо и точка. Её водит комиссия. */
  private buildTarget(view: View, s: number): void {
    const b = view.body;
    const face = new MeshStandardMaterial({ color: PALETTE.concrete100, emissive: PALETTE.concrete100, emissiveIntensity: 0.35, roughness: 0.5 });
    view.mats.push(face);
    const disc = new Group();
    disc.position.y = TUNING.view3d.shotHeight + s * 0.3;
    b.add(disc);
    part(disc, CYL, this.m.darkMetal, s * 2.4, 0.05, s * 2.4, 0, 0, 0, true, Math.PI / 2);
    part(disc, TORUS, face, s * 2.0, s * 2.0, s * 1.2, 0, 0, 0.035, false);
    part(disc, TORUS, face, s * 1.1, s * 1.1, s * 0.8, 0, 0, 0.035, false);
    part(disc, CYL, face, s * 0.45, 0.04, s * 0.45, 0, 0, 0.04, false, Math.PI / 2);
    part(b, BOX, this.m.darkMetal, 0.05, disc.position.y, 0.05, 0, disc.position.y / 2, -0.04);
    part(b, CYL, this.m.darkMetal, s * 1.2, 0.04, s * 1.2, 0, 0.02, 0);
    view.arm = disc;
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
      case 'order': {
        // Лист распоряжения: держит его не стол, а аномалия. Висит в воздухе
        // лицом к залу, текст набран жирными строками.
        const sheet = new Group();
        b.add(sheet);
        const paper = new MeshStandardMaterial({ color: PALETTE.paper, emissive: PALETTE.paper, emissiveIntensity: 0.25, roughness: 0.8, side: 2 });
        view.mats.push(paper);
        part(sheet, BOX, paper, s * 1.6, s * 2.2, 0.012, 0, 0, 0);
        const ink = this.m.darkMetal;
        for (const [y, wd] of [[0.62, 1.1], [0.32, 1.1], [0.02, 1.1], [-0.28, 0.7], [-0.62, 0.45]] as const) {
          part(sheet, BOX, ink, s * wd, s * 0.1, 0.016, -s * (1.1 - wd) * 0.5, s * y, 0, false);
        }
        part(sheet, BOX, ink, s * 1.66, s * 0.06, 0.018, 0, s * 1.08, 0, false);
        // Печать в углу — латунью, а не красным: красное у субъекта.
        part(sheet, CYL, this.brass(), s * 0.42, 0.02, s * 0.42, s * 0.5, -s * 0.7, 0.01, false, Math.PI / 2);
        view.arm = sheet;
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
    if (kind === 'saved') {
      // Личное дело спасённого: папка на конторке. Бумага, а не ящик.
      part(b, BOX, this.m.darkMetal, s * 1.6, 0.04, s * 1.4, 0, 0.72, 0);
      part(b, BOX, this.m.darkMetal, 0.06, 0.72, 0.06, 0, 0.36, 0);
      part(b, CYL, this.m.darkMetal, s * 1.2, 0.03, s * 1.2, 0, 0.015, 0);
      if (!opened) {
        const lid = part(b, BOX, this.tint(0x8a8577, view, 0.85), s * 1.3, 0.025, s * 1.0, 0, 0.76, 0);
        lid.rotation.y = 0.2;
        part(b, BOX, this.m.paper, s * 1.2, 0.012, s * 0.95, 0.02, 0.75, 0.01, false);
        part(b, BOX, this.tint(PALETTE.concrete500, view), s * 0.4, 0.03, s * 0.2, -s * 0.3, 0.775, -s * 0.45, false);
        part(b, BOX, seal, s * 1.32, 0.03, 0.04, 0, 0.78, s * 0.1, false);
      }
      return;
    }
    if (kind === 'board') {
      // Коммутатор: щит с гнёздами и шнурами. Переключён — шнуры перекинуты.
      const h = 1.6;
      const shell = this.tint(0x38483f, view, 0.55, 0.3);
      part(b, BOX, shell, s * 2.4, h, s * 1.0, 0, h / 2, -s * 0.3);
      part(b, BOX, this.m.wood, s * 2.5, 0.06, s * 1.4, 0, 0.82, s * 0.2);
      const jack = this.brass();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          part(b, CYL, jack, 0.05, 0.03, 0.05, -s * 0.9 + c * s * 0.45, 1.0 + r * 0.14, s * 0.21, false, Math.PI / 2);
        }
      }
      const lampMat = new MeshStandardMaterial({ color: PALETTE.yellow, emissive: PALETTE.yellow, emissiveIntensity: opened ? 1.6 : 0.2 });
      view.mats.push(lampMat);
      for (let c = 0; c < 5; c++) part(b, SPHERE, lampMat, 0.05, 0.05, 0.05, -s * 0.9 + c * s * 0.45, 1.6, s * 0.21, false);
      const cord = this.tint(0x15161a, view, 0.7);
      const pairs: [number, number, number, number][] = opened ? [[0, 0, 4, 3], [1, 2, 3, 0], [2, 1, 0, 3]] : [[0, 0, 0, 3], [2, 1, 2, 2], [4, 0, 4, 3]];
      for (const [c0, r0, c1, r1] of pairs) {
        const x0 = -s * 0.9 + c0 * s * 0.45;
        const x1 = -s * 0.9 + c1 * s * 0.45;
        const y0 = 1.0 + r0 * 0.14;
        const y1 = 1.0 + r1 * 0.14;
        const mx = (x0 + x1) / 2;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const seg = part(b, CYL, cord, 0.02, len + 0.25, 0.02, mx, (y0 + y1) / 2 - 0.1, s * 0.27, false);
        seg.rotation.z = Math.atan2(x1 - x0, y1 - y0);
      }
      if (!opened) part(b, BOX, seal, s * 2.44, 0.05, s * 1.04, 0, h + 0.03, -s * 0.3, false);
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
    view.rimMat?.dispose();
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
    if (!Number.isNaN(view.lastX) && f.dt > 0 && moved < 1) {
      view.vx = (x - view.lastX) / f.dt;
      view.vz = (z - view.lastZ) / f.dt;
    }
    view.lastX = x;
    view.lastZ = z;
    // Тела расталкивают лежащие обломки: идущий раскидывает крошку ногами.
    if (this.debris !== null && moved > 0.001 && moved < 1) {
      const sp = Math.hypot(view.vx ?? 0, view.vz ?? 0);
      if (sp > 0.5) this.debris.push(x, z, s * 1.6 + 0.2, sp * 0.8, 0.25);
    }

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

    // Люди без должности: висят или сидят, ни шага, ни ореола.
    if (view.civ !== undefined) {
      this.placeCivilian(e, view, x, z, f, b);
      return;
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
      const amp = still ? 0 : Math.min(1, speed / 55);
      // Инспектор целится: корпус и рука к линии огня, пока горит табличка.
      const insp = w.inspectorC.get(e);
      const aiming = insp !== undefined && (staff.plateFlash > 0 || insp.shotsLeft > 0);
      if (aiming && insp !== undefined) root.rotation.y = Math.atan2(insp.aimX, insp.aimY);
      const stride = Math.max(1e-6, TUNING.render.walkStride * U);
      view.rig?.pose({
        phase: (view.walk / stride) * Math.PI,
        amp,
        time: f.time + e * 0.37,
        aim: aiming,
        reach: staff.silhouette === 'wide',
        still,
      });
      if (view.retinue !== undefined) view.retinue.rotation.y = f.time * TUNING.render.chiefRetinueSpin;
      // Отброс: тело не успевает за ногами и заваливается по ходу удара.
      const kc = w.kickC.get(e);
      if (kc !== undefined) {
        const ks = Math.hypot(kc.vx, kc.vy);
        const lean = Math.min(0.55, ks / 900);
        const yawNow = root.rotation.y;
        const lx = Math.cos(yawNow) * kc.vx - Math.sin(yawNow) * kc.vy;
        const lz = Math.sin(yawNow) * kc.vx + Math.cos(yawNow) * kc.vy;
        view.body.rotation.x = (lz / (ks || 1)) * lean;
        view.body.rotation.z = -(lx / (ks || 1)) * lean;
      } else {
        view.body.rotation.x *= 0.85;
        view.body.rotation.z *= 0.85;
      }
      this.smoke(e, x, z, s, f, b);
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
      const pb = w.body.get(e);
      const speed = pb === undefined ? 0 : Math.hypot(pb.vx, pb.vy);
      const lift = e === held ? (cfg.liftHeight + Math.sin(f.time * cfg.liftBobRate) * cfg.liftBob) * U * 4 : 0;
      // Брошенное летит над полом и кувыркается вокруг оси поперёк хода;
      // выдохлось — падает и встаёт на основание.
      const hop = prop.phase === 'thrown' ? Math.min(0.55, Math.max(0, (speed - 120) / 1200)) : 0;
      view.body.position.y = prop.phase === 'cover' ? s * 0.95 : lift + hop;
      if (prop.kind === 'order' || w.targetC.has(e)) {
        // Распоряжение висит в воздухе и медленно поворачивается; под ним
        // бледное пятно — так видно, где он, даже за спинами.
        const sheet = view.arm;
        if (sheet !== undefined && !w.targetC.has(e)) {
          sheet.position.y = 1.25 + Math.sin(f.time * 1.7 + e) * 0.07;
          sheet.rotation.y = Math.sin(f.time * 0.6 + e * 0.3) * 0.6;
          sheet.rotation.z = Math.sin(f.time * 1.1 + e) * 0.06;
        }
        b.glow.flat(x, z, s * 3.2, s * 3.2, 0.02, PALETTE.concrete100, w.targetC.has(e) ? 0.3 : 0.22);
        if (w.targetC.has(e)) b.svc.ring(x, z, s * 1.9, 0.03, 0.03, PALETTE.concrete100, 0.8, 32);
        view.lastSpeed = speed;
        return;
      }
      if (prop.phase === 'thrown' && pb !== undefined && speed > 1) {
        view.tumble = (view.tumble ?? 0) + speed * U * f.dt * 1.6;
        const yaw = Math.atan2(pb.vx, pb.vy);
        view.root.rotation.y = yaw;
        view.body.rotation.set(view.tumble, 0, 0);
      } else if (prop.phase !== 'cover') {
        // Докатился: доворачивается на ближайшую грань, а не прыгает.
        const t0 = view.tumble ?? 0;
        const snap = Math.round(t0 / (Math.PI / 2)) * (Math.PI / 2);
        view.tumble = t0 + (snap - t0) * 0.25;
        view.body.rotation.x = Math.abs(view.tumble - snap) < 0.01 ? 0 : view.tumble - snap;
        view.body.rotation.y = approachAngle(view.body.rotation.y, 0, 0.1);
        view.body.rotation.z = 0;
      }
      // Удар: скорость брошенного провалилась за кадр — во что-то влетело.
      const was = view.lastSpeed ?? 0;
      if (this.debris !== null && was > TUNING.prop.minImpactSpeed && speed < was * 0.55) {
        const kind = this.pieceKind(view);
        this.debris.burst('chip', 6, x, 0.3, z, 3.2, 0.06, view.tint ?? PALETTE.concrete500);
        this.debris.burst(kind, 3, x, 0.4, z, 2.6, 0.12, view.tint ?? PALETTE.furniture);
        this.debris.push(x, z, 1.2, was * U * 0.4, 0.5);
        this.puffs.push({ x, z, t: f.time, size: s * 2.2, life: 0.8 });
        this.events.push('step');
      }
      view.lastSpeed = speed;
      if (this.debris !== null && prop.phase === 'thrown') this.debris.push(x, z, s * 1.8, speed * U * 0.6, 0.6);
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

  /** Подвешенный, опущенный, снятый: поза человека, а не должности. */
  private placeCivilian(e: Entity, view: View, x: number, z: number, f: FrameInfo, b: Batches): void {
    const rig = view.rig;
    if (rig === undefined) return;
    rig.pose({ phase: 0, amp: 0, time: f.time + e * 0.7, aim: false });
    if (view.civ === 'hung') {
      // Висит: ноги не держат, руки плетьми, голова упала на грудь.
      const lift = Math.max(0.2, TUNING.hung.lift * U * 4.2);
      view.body.position.y = lift + Math.sin(f.time * 0.9 + e) * 0.05;
      view.root.rotation.y += 0.0025;
      rig.head.rotation.x = 0.55;
      rig.hipL.rotation.x = 0.08;
      rig.hipR.rotation.x = -0.04;
      rig.kneeL.rotation.x = 0.18;
      rig.kneeR.rotation.x = 0.1;
      rig.shoulderL.rotation.z = -0.04;
      rig.shoulderR.rotation.z = 0.04;
      // С него стекает пыль: медленно, по неподвижному шуму.
      const motes = Math.max(0, Math.round(TUNING.hung.motes)) + 2;
      for (let i = 0; i < motes; i++) {
        const ph = (f.time * 0.35 + hash01(e * 17 + i)) % 1;
        const ox = (hash01(e * 5 + i * 3) - 0.5) * 0.5;
        const oz = (hash01(e * 11 + i * 7) - 0.5) * 0.4;
        const y = lift + 0.1 - ph * (lift + 0.1);
        b.glow.upright(x + ox, y, z + oz, 0.018, 0.018, PALETTE.concrete300, 0.7 * (1 - ph));
      }
      return;
    }
    if (view.civ === 'floor') {
      // Опустили: сидит на полу, ноги вперёд.
      view.body.position.y = -0.36;
      rig.kneeL.rotation.x = 0.25;
      rig.kneeR.rotation.x = 0.4;
      rig.head.rotation.x = 0.3;
      return;
    }
    // Снят с должности: сидит, опустив голову, руки на коленях.
    rig.head.rotation.x = 0.4;
    rig.shoulderL.rotation.x = -0.45;
    rig.shoulderR.rotation.x = -0.45;
  }

  private placePlayer(w: World, view: View, x: number, z: number, s: number, f: FrameInfo, b: Batches, blink: boolean, flash: boolean): void {
    const player = w.playerC.get(w.player);
    const bodyC = w.body.get(w.player);
    if (player === undefined) return;
    const root = view.root;
    root.visible = !blink;
    // Срыв в пустоту: тело уходит вниз, кувыркается и уменьшается.
    if (player.fallTimer > 0) {
      const k = 1 - Math.max(0, Math.min(1, player.fallTimer / Math.max(1e-6, TUNING.fall.time)));
      root.position.y = -k * k * 9;
      root.scale.setScalar(Math.max(0.05, 1 - k * TUNING.fall.shrink));
      view.body.rotation.x = k * 2.4;
      view.rig?.pose({ phase: 0, amp: 0, time: f.time, aim: false, dash: true });
      if (view.rimMat !== undefined) view.rimMat.visible = false;
      for (const g of view.ghosts ?? []) g.visible = false;
      return;
    }
    root.position.y = 0;
    root.scale.setScalar(1);
    view.body.rotation.x = 0;
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
    // Ноги идут по ходу, плечи держат прицел. Назад — шагом назад, а не
    // разворотом: таз поворачивается не больше чем на прямой угол.
    let legYaw = 0;
    let dir = 1;
    if (speed > cfg.walkMinSpeed && !dash) {
      let rel = Math.atan2(vx, vz) - yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) > Math.PI / 2) {
        rel += rel > 0 ? -Math.PI : Math.PI;
        dir = -1;
      }
      legYaw = rel;
    }
    view.legYaw = (view.legYaw ?? 0) + (legYaw - (view.legYaw ?? 0)) * 0.25;
    view.rig?.pose({ phase: phase * dir, amp, time: f.time, aim: true, dash, legYaw: view.legYaw });
    // Шаг: каждая половина цикла — нога на полу. Звук и пылинка из-под неё.
    const stepIdx = Math.floor(view.walk / stride);
    if (!dash && amp > 0.35 && stepIdx !== this.lastStep) {
      this.events.push(f.soft ? 'step_soft' : 'step');
      if (!f.soft) this.puffs.push({ x, z, t: f.time, size: 0.25, life: 0.5 });
    }
    this.lastStep = stepIdx;
    // Рывок поднимает пыль полосой за собой.
    if (dash && f.time - this.lastPuff > 0.03) {
      this.lastPuff = f.time;
      this.puffs.push({ x: x + (Math.random() - 0.5) * 0.2, z: z + (Math.random() - 0.5) * 0.2, t: f.time, size: 0.5, life: 0.9 });
    }
    if (view.rimMat !== undefined) view.rimMat.visible = !f.hiss;

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

    // Знаки над штатом. Снятым с должности табличек не положено.
    for (const [e, staff] of w.staffC) {
      if (staff.retired) continue;
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

  /** Пыль: растёт и тает. Старое выбрасывается. */
  private dust(f: FrameInfo, b: Batches): void {
    let keep = 0;
    for (const p of this.puffs) {
      const age = f.time - p.t;
      if (age < 0 || age > p.life) continue;
      this.puffs[keep++] = p;
      const k = age / p.life;
      const r = p.size * (0.6 + k * 1.6);
      b.puff.flat(p.x, p.z, r, r, 0.04 + k * 0.2, PALETTE.concrete300, 0.55 * (1 - k) * (1 - k));
    }
    this.puffs.length = keep;
  }

  // --- Физика кадра: распад, рассыпанное, дым --------------------------------

  /** Вид обломков, на которые рассыпается предмет. */
  private pieceKind(view: View): DebrisKind {
    const kind = view.key.split(':')[1] ?? '';
    if (kind === 'order') return 'paper';
    if (kind === 'rubble') return 'chunk';
    if (kind === 'cabinet' || kind === 'faxstand' || kind === 'tank' || kind === 'typewriter') return 'metal';
    return 'splinter';
  }

  /**
   * Сущность ушла из мира не со сменой помещения — значит, её не стало.
   * Сотрудник распадается кусками по суставам, предмет — щепой и
   * железом, и всё это падает, катится и остаётся лежать.
   */
  private gone(w: World, e: Entity, view: View): void {
    const d = this.debris;
    if (d === null || Number.isNaN(view.lastX)) return;
    const kind = view.key.split(':')[0];
    const x = view.lastX;
    const z = view.lastZ;
    if (kind === 'staff') {
      this.shatter(view, 'chunk', 2.2);
      d.burst('chip', 26, x, 0.9, z, 3.4, 0.07, view.tint ?? PALETTE.concrete500);
      d.burst('paper', 6, x, 1.1, z, 2.2, 0.22, PALETTE.paper);
      this.puffs.push({ x, z, t: this.clock, size: 1.4, life: 1.4 });
      this.puffs.push({ x, z, t: this.clock + 0.08, size: 1.0, life: 1.1 });
      d.push(x, z, 2.2, 3.5, 0.6);
    } else if (kind === 'target') {
      // Мишень сбита: щит разлетается железом.
      this.shatter(view, 'metal', 1.4);
      d.burst('spark', 14, x, TUNING.view3d.shotHeight, z, 3.0, 0.03, 0xfff1d0);
    } else if (kind === 'prop') {
      const piece = this.pieceKind(view);
      this.shatter(view, piece, 1.6);
      d.burst(piece, 10, x, 0.5, z, 2.8, 0.1, view.tint ?? PALETTE.furniture);
      d.burst('chip', 10, x, 0.4, z, 2.4, 0.05, PALETTE.concrete500);
      if (view.key.includes('cardbox')) d.burst('paper', 24, x, 0.6, z, 2.6, 0.2, PALETTE.paper);
      this.puffs.push({ x, z, t: this.clock, size: 1.1, life: 1.0 });
    }
    void w;
    void e;
  }

  /**
   * Разобрать узел на части: каждая деталь фигуры становится обломком
   * своего размера и цвета и вылетает из того места, где была.
   */
  private shatter(view: View, piece: DebrisKind, power: number): void {
    const d = this.debris;
    if (d === null) return;
    view.root.updateMatrixWorld(true);
    const cx = view.lastX;
    const cz = view.lastZ;
    const pos = new Vector3();
    const scl = new Vector3();
    let n = 0;
    view.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh !== true || n >= 40) return;
      const mat = mesh.material as MeshStandardMaterial;
      if (view.rimMat !== undefined && mat === (view.rimMat as unknown as MeshStandardMaterial)) return;
      if (mat.transparent === true) return;
      mesh.getWorldPosition(pos);
      mesh.getWorldScale(scl);
      const geo = mesh.geometry;
      if (geo.boundingBox === null) geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const gx = bb === null ? 1 : bb.max.x - bb.min.x;
      const gy = bb === null ? 1 : bb.max.y - bb.min.y;
      const gz = bb === null ? 1 : bb.max.z - bb.min.z;
      const clamp = (v: number): number => Math.max(0.035, Math.min(0.55, v));
      const kind: DebrisKind = mat.metalness >= 0.5 ? 'metal' : piece;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const out = power * (0.4 + Math.random() * 0.6);
      d.spawn(
        kind,
        pos.x,
        Math.max(0.05, pos.y),
        pos.z,
        (dx / len) * out + (view.vx ?? 0) * 0.5,
        1.2 + Math.random() * power,
        (dz / len) * out + (view.vz ?? 0) * 0.5,
        clamp(gx * scl.x),
        clamp(gy * scl.y),
        clamp(gz * scl.z),
        mat.color?.getHex() ?? 0x888888,
        10,
      );
      n += 1;
    });
  }

  /** Смена вида: опрокинули, вскрыли, положили набок. Высыпаем содержимое. */
  private transition(w: World, e: Entity, view: View, next: string): void {
    const d = this.debris;
    if (d === null || Number.isNaN(view.lastX)) return;
    const [a, kind, was] = view.key.split(':');
    const now = next.split(':')[2];
    const x = view.lastX;
    const z = view.lastZ;
    if (a === 'fix' && was === 'false' && now === 'true') {
      const fx = w.fixtureC.get(e);
      const dx = fx?.spillX ?? 0;
      const dz = fx?.spillY ?? 0;
      if (kind === 'cooler') d.burst('drop', 26, x, 1.0, z, 2.6, 0.07, 0x9fb4c0, dx, dz);
      else if (kind === 'ficus') {
        d.burst('chip', 22, x, 0.4, z, 2.0, 0.06, 0x3a2a1c, dx, dz);
        d.burst('paper', 8, x, 0.8, z, 1.8, 0.14, PALETTE.leaf, dx, dz);
      } else if (kind === 'rack') d.burst('paper', 4, x, 1.4, z, 1.6, 0.4, 0x6b665a, dx, dz);
      else d.burst('paper', 14, x, 0.7, z, 2.4, 0.2, PALETTE.paper, dx, dz);
      this.puffs.push({ x, z, t: this.clock, size: 0.9, life: 0.9 });
    } else if (a === 'stash' && was === 'false' && now === 'true') {
      d.burst('paper', 12, x, 1.0, z, 2.2, 0.2, PALETTE.paper, 0, 0, 1.4);
    } else if (a === 'prop' && was === 'false' && now === 'true') {
      this.puffs.push({ x, z, t: this.clock, size: 1.2, life: 0.8 });
      d.burst('chip', 8, x, 0.1, z, 1.6, 0.05, PALETTE.concrete500);
    } else if (a === 'counter' && was === 'false' && now === 'true') {
      d.burst('paper', 5, x, 1.1, z, 1.4, 0.18, PALETTE.paper);
    } else if (a === 'staff' && next === 'retired') {
      // Снят с должности: таблички падают с груди, бетон осыпается с кожи.
      d.burst('paper', 4, x, 1.2, z, 1.4, 0.16, PALETTE.paper);
      d.burst('chip', 30, x, 1.0, z, 2.0, 0.06, view.tint ?? PALETTE.concrete500);
      this.puffs.push({ x, z, t: this.clock, size: 1.3, life: 1.6 });
    } else if (a === 'fix' && kind === 'hung' && view.key.split(':')[3] === 'true' && next.split(':')[3] === 'false') {
      // Опустили: сел на пол, из-под него — пыль.
      this.puffs.push({ x, z, t: this.clock, size: 1.4, life: 1.4 });
      d.burst('chip', 10, x, 0.3, z, 1.2, 0.05, PALETTE.concrete300);
    }
  }

  /**
   * Дым заражения: бетонная взвесь кружит вокруг сотрудника. В плоском
   * виде это были незамкнутые контуры, здесь — мягкие клубы.
   */
  private smoke(e: Entity, x: number, z: number, s: number, f: FrameInfo, b: Batches): void {
    const cfg = TUNING.fx;
    const puffs = Math.max(0, Math.round(cfg.smokePuffs));
    if (puffs === 0 || cfg.smokeAlpha <= 0) return;
    for (let i = 0; i < puffs; i++) {
      const seed = e * 7 + i * 13;
      const spin = f.time * cfg.smokeSpin * (i % 2 === 0 ? 1 : -1) + seed;
      const r = s + cfg.smokeRadius * U + Math.sin(f.time + seed) * cfg.smokeSpread * U;
      const size = 0.28 + 0.1 * Math.sin(f.time * 1.3 + seed);
      b.puff.flat(x + Math.cos(spin) * r, z + Math.sin(spin) * r, size, size, 0.35 + i * 0.3, PALETTE.concrete500, cfg.smokeAlpha * 0.9 * (1 - i / (puffs + 1)));
    }
  }

  // --- Снаряды ---------------------------------------------------------------

  private bullets(w: World, f: FrameInfo, b: Batches): void {
    const seen = new Map<Entity, { x: number; z: number; vx: number; vz: number; life: number; glow: boolean; card: boolean }>();
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
      const bc = w.bulletC.get(e);
      const bb = w.body.get(e);
      seen.set(e, { x, z, vx: (bb?.vx ?? 0) * U, vz: (bb?.vy ?? 0) * U, life: bc?.life ?? 0, glow, card: draw.shape === 'card' });
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
    // Исчезла раньше срока — во что-то попала: бетон крошится, бумага рвётся.
    if (this.debris !== null && !this.quiet) {
      for (const [e, p] of this.flying) {
        if (seen.has(e) || p.life <= STEP * 1.5) continue;
        const ix = p.x + p.vx * STEP;
        const iz = p.z + p.vz * STEP;
        const wall = isSolidPoint(w.map, ix / U, iz / U);
        const h = TUNING.view3d.shotHeight;
        const back = Math.hypot(p.vx, p.vz) || 1;
        const rx = (-p.vx / back) * 1.5;
        const rz = (-p.vz / back) * 1.5;
        if (wall) this.debris.burst('chip', 5, ix, h, iz, 2.4, 0.04, 0x8a8d91, rx, rz);
        if (p.glow) this.debris.burst('spark', 7, ix, h, iz, 4.5, 0.035, 0xff6a3a, rx, rz, 0.6);
        else if (p.card) this.debris.burst('paper', 3, ix, h, iz, 1.6, 0.09, PALETTE.paper, rx * 0.5, rz * 0.5, 0.5);
        else this.debris.burst('spark', 4, ix, h, iz, 3, 0.03, 0xfff1d0, rx, rz, 0.6);
      }
    }
    this.flying = seen;
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
