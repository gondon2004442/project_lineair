/**
 * ОБЛОМКИ. Физика кадра: всё, что отлетает, падает и остаётся лежать.
 *
 * Это не симуляция и в детерминизм не входит: бетонная крошка, осколки
 * стекла, клочья бумаги, куски заражённых тел живут только в картинке.
 * Зато живут по-настоящему: тяжесть, отскок от пола, трение, удар о
 * стены и мебель, вращение, которое гаснет при касании. Лежащее можно
 * растолкать ногами и сдуть волной бланка.
 *
 * Хранение — плоские массивы на фиксированное число тел. Отрисовка —
 * по одному InstancedMesh на вид обломка: тысяча кусков — восемь вызовов.
 */
import {
  BoxGeometry,
  Color,
  DodecahedronGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { PALETTE } from '../palette';
import { TILE_WALL, TILE_WEAK, type TileMap } from '../room';

/** Вид обломка: форма, материал и то, как он летит. */
export type DebrisKind = 'chunk' | 'chip' | 'glass' | 'paper' | 'splinter' | 'metal' | 'spark' | 'drop';

interface KindSpec {
  geo: BufferGeometry;
  mat: Material;
  /** Сопротивление воздуха: бумага планирует, бетон падает камнем. */
  drag: number;
  /** Упругость отскока. */
  bounce: number;
  /** Трение о пол. */
  friction: number;
  /** Порхает: бумага качается в падении. */
  flutter: boolean;
  /** Сколько лежит, прежде чем исчезнуть. Бесконечно — до смены помещения. */
  life: number;
  cast: boolean;
}

const CAP = 1600;
const GRAVITY = -16;

export interface DebrisWorld {
  map: TileMap | null;
  /** Высота твёрдого в клетке: стена, мебель, ничего. */
  height(cx: number, cz: number): number;
}

export class Debris {
  readonly group = new Group();
  // Плоские массивы: позиция, скорость, ориентация, угловая скорость.
  private readonly px = new Float32Array(CAP);
  private readonly py = new Float32Array(CAP);
  private readonly pz = new Float32Array(CAP);
  private readonly vx = new Float32Array(CAP);
  private readonly vy = new Float32Array(CAP);
  private readonly vz = new Float32Array(CAP);
  private readonly qx = new Float32Array(CAP);
  private readonly qy = new Float32Array(CAP);
  private readonly qz = new Float32Array(CAP);
  private readonly qw = new Float32Array(CAP);
  private readonly wx = new Float32Array(CAP);
  private readonly wy = new Float32Array(CAP);
  private readonly wz = new Float32Array(CAP);
  private readonly sx = new Float32Array(CAP);
  private readonly sy = new Float32Array(CAP);
  private readonly sz = new Float32Array(CAP);
  private readonly age = new Float32Array(CAP);
  private readonly sleep = new Uint8Array(CAP);
  private readonly kind = new Uint8Array(CAP);
  private readonly alive = new Uint8Array(CAP);
  private readonly col = new Float32Array(CAP * 3);
  private next = 0;
  private count = 0;
  private readonly kinds: KindSpec[];
  private readonly names: DebrisKind[] = ['chunk', 'chip', 'glass', 'paper', 'splinter', 'metal', 'spark', 'drop'];
  private readonly meshes: InstancedMesh[] = [];
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly dq = new Quaternion();
  private readonly v3 = new Vector3();
  private readonly s3 = new Vector3();
  private readonly c = new Color();
  world: DebrisWorld = { map: null, height: () => 0 };

  constructor(paper: Material) {
    const rock = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    const glass = new MeshPhysicalMaterial({
      color: PALETTE.glass,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 2.2,
      side: DoubleSide,
    });
    const wood = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const metal = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.8 });
    const spark = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.5 });
    const drop = new MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.02, transparent: true, opacity: 0.6 });
    const chunk = new DodecahedronGeometry(0.5, 0);
    const box = new BoxGeometry(1, 1, 1);
    const sheet = new BoxGeometry(1, 0.02, 1);
    this.kinds = [
      { geo: chunk, mat: rock, drag: 0.15, bounce: 0.28, friction: 0.55, flutter: false, life: Infinity, cast: true },
      { geo: chunk, mat: rock, drag: 0.2, bounce: 0.35, friction: 0.5, flutter: false, life: Infinity, cast: false },
      { geo: sheet, mat: glass, drag: 0.4, bounce: 0.2, friction: 0.7, flutter: false, life: Infinity, cast: false },
      { geo: sheet, mat: paper, drag: 3.2, bounce: 0.05, friction: 0.9, flutter: true, life: Infinity, cast: true },
      { geo: box, mat: wood, drag: 0.25, bounce: 0.3, friction: 0.6, flutter: false, life: Infinity, cast: true },
      { geo: box, mat: metal, drag: 0.2, bounce: 0.4, friction: 0.45, flutter: false, life: Infinity, cast: true },
      { geo: box, mat: spark, drag: 1.0, bounce: 0.5, friction: 0.3, flutter: false, life: 0.45, cast: false },
      { geo: chunk, mat: drop, drag: 0.6, bounce: 0.0, friction: 1, flutter: false, life: 1.2, cast: false },
    ];
    for (const k of this.kinds) {
      const mesh = new InstancedMesh(k.geo, k.mat, CAP);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, new Color(1, 1, 1));
      mesh.count = 0;
      mesh.castShadow = k.cast;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Новое помещение: всё, что лежало, остаётся в старом. */
  clear(): void {
    this.alive.fill(0);
    this.count = 0;
    this.next = 0;
  }

  /**
   * Выпустить обломок. Ориентация случайная, угловая скорость — по
   * силе удара. Кончилось место — переиспользуется самый старый.
   */
  spawn(
    kind: DebrisKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    spin = 8,
  ): void {
    let i = -1;
    for (let k = 0; k < CAP; k++) {
      const j = (this.next + k) % CAP;
      if (this.alive[j] === 0) {
        i = j;
        break;
      }
    }
    if (i < 0) i = this.next;
    this.next = (i + 1) % CAP;
    if (this.alive[i] === 0) this.count += 1;
    this.alive[i] = 1;
    this.kind[i] = this.names.indexOf(kind);
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.q.setFromAxisAngle(this.v3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), Math.random() * Math.PI * 2);
    this.qx[i] = this.q.x;
    this.qy[i] = this.q.y;
    this.qz[i] = this.q.z;
    this.qw[i] = this.q.w;
    this.wx[i] = (Math.random() - 0.5) * spin;
    this.wy[i] = (Math.random() - 0.5) * spin;
    this.wz[i] = (Math.random() - 0.5) * spin;
    this.sx[i] = sx;
    this.sy[i] = sy;
    this.sz[i] = sz;
    this.age[i] = 0;
    this.sleep[i] = 0;
    this.c.setHex(color);
    this.col[i * 3] = this.c.r;
    this.col[i * 3 + 1] = this.c.g;
    this.col[i * 3 + 2] = this.c.b;
  }

  /** Сноп обломков из точки: веер скоростей вверх и в стороны. */
  burst(kind: DebrisKind, n: number, x: number, y: number, z: number, speed: number, size: number, color: number, dirX = 0, dirZ = 0, up = 1): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const sz = size * (0.5 + Math.random() * 0.8);
      const flat = kind === 'paper' || kind === 'glass';
      this.spawn(
        kind,
        x + (Math.random() - 0.5) * 0.15,
        y + Math.random() * 0.1,
        z + (Math.random() - 0.5) * 0.15,
        Math.cos(a) * s * 0.6 + dirX * speed,
        (0.4 + Math.random() * 0.8) * speed * up,
        Math.sin(a) * s * 0.6 + dirZ * speed,
        flat ? sz * (1 + Math.random()) : sz,
        flat ? 1 : sz * (0.6 + Math.random() * 0.6),
        flat ? sz * (0.7 + Math.random()) : sz * (0.6 + Math.random() * 0.8),
        color,
        kind === 'paper' ? 5 : 12,
      );
    }
  }

  /**
   * Толкнуть всё рядом с точкой: шаги, тела, волна. Лежащее просыпается.
   * strength — скорость у центра, спадает к краю радиуса.
   */
  push(x: number, z: number, radius: number, strength: number, lift = 0.3): void {
    const r2 = radius * radius;
    for (let i = 0; i < CAP; i++) {
      if (this.alive[i] === 0) continue;
      const dx = this.px[i]! - x;
      const dz = this.pz[i]! - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const k = (1 - d / radius) * strength;
      this.vx[i]! += (dx / d) * k;
      this.vz[i]! += (dz / d) * k;
      this.vy[i]! += k * lift;
      this.wx[i]! += (Math.random() - 0.5) * k * 2;
      this.wz[i]! += (Math.random() - 0.5) * k * 2;
      this.sleep[i] = 0;
    }
  }

  /** Шаг физики и выкладка в инстансы. */
  update(dt: number, time: number): void {
    const step = Math.min(dt, 1 / 30);
    const sub = 2;
    const h = step / sub;
    for (let s = 0; s < sub; s++) this.integrate(h, time);
    this.draw();
  }

  private integrate(h: number, time: number): void {
    const map = this.world.map;
    for (let i = 0; i < CAP; i++) {
      if (this.alive[i] === 0) continue;
      const k = this.kinds[this.kind[i]!]!;
      this.age[i]! += h;
      if (this.age[i]! > k.life) {
        this.alive[i] = 0;
        this.count -= 1;
        continue;
      }
      if (this.sleep[i] === 1) continue;
      // Сопротивление воздуха и тяжесть.
      const drag = Math.exp(-k.drag * h);
      this.vx[i]! *= drag;
      this.vz[i]! *= drag;
      this.vy[i] = this.vy[i]! * (k.flutter ? Math.exp(-k.drag * 1.6 * h) : 1) + GRAVITY * h * (k.flutter ? 0.18 : 1);
      if (k.flutter) {
        // Лист качается в падении из стороны в сторону.
        const ph = time * 6 + i;
        this.vx[i]! += Math.cos(ph) * 1.6 * h;
        this.vz[i]! += Math.sin(ph * 0.7) * 1.6 * h;
      }
      let x = this.px[i]! + this.vx[i]! * h;
      let y = this.py[i]! + this.vy[i]! * h;
      let z = this.pz[i]! + this.vz[i]! * h;
      const r = Math.max(this.sy[i]!, Math.min(this.sx[i]!, this.sz[i]!)) * 0.5;

      // Стены и мебель: клетка выше обломка — его выталкивает назад.
      if (map !== null) {
        const cx = Math.floor(x);
        const cz = Math.floor(z);
        const top = this.world.height(cx, cz);
        if (top > 0 && y < top) {
          const ox = Math.floor(this.px[i]!);
          const oz = Math.floor(this.pz[i]!);
          if (this.py[i]! >= top - 0.02 && y < top) {
            // Сверху на крышку: ложится на неё.
            y = top + r;
            this.vy[i] = -this.vy[i]! * k.bounce;
          } else {
            if (ox !== cx) {
              x = this.px[i]!;
              this.vx[i] = -this.vx[i]! * k.bounce;
            }
            if (oz !== cz) {
              z = this.pz[i]!;
              this.vz[i] = -this.vz[i]! * k.bounce;
            }
            if (ox === cx && oz === cz) {
              // Родился внутри: выдавить вверх.
              y = top + r;
              this.vy[i] = Math.abs(this.vy[i]!) * 0.2;
            }
          }
        }
      }

      // Пол: отскок, трение, гаснущее вращение.
      const floor = this.world.height(Math.floor(x), Math.floor(z));
      const ground = floor > 0 && y >= floor - 0.05 ? floor : 0;
      if (y - r < ground) {
        y = ground + r;
        if (this.vy[i]! < 0) this.vy[i] = -this.vy[i]! * k.bounce;
        const f = Math.exp(-k.friction * 12 * h);
        this.vx[i]! *= f;
        this.vz[i]! *= f;
        this.wx[i]! *= f;
        this.wy[i]! *= f;
        this.wz[i]! *= f;
        // Лёг плашмя: кладём ориентацию на пол, чтобы не стоял на ребре.
        if (Math.abs(this.vy[i]!) < 0.4 && Math.hypot(this.vx[i]!, this.vz[i]!) < 0.08) {
          this.sleep[i] = 1;
          this.vx[i] = 0;
          this.vy[i] = 0;
          this.vz[i] = 0;
          if (k.flutter || this.names[this.kind[i]!] === 'glass') this.flatten(i);
        }
      }
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;

      // Поворот на угловую скорость за шаг.
      const wx = this.wx[i]!;
      const wy = this.wy[i]!;
      const wz = this.wz[i]!;
      const ang = Math.hypot(wx, wy, wz) * h;
      if (ang > 1e-5) {
        this.dq.setFromAxisAngle(this.v3.set(wx, wy, wz).normalize(), ang);
        this.q.set(this.qx[i]!, this.qy[i]!, this.qz[i]!, this.qw[i]!).premultiply(this.dq).normalize();
        this.qx[i] = this.q.x;
        this.qy[i] = this.q.y;
        this.qz[i] = this.q.z;
        this.qw[i] = this.q.w;
      }
    }
  }

  /** Лист и осколок ложатся плашмя: оставляем только поворот вокруг вертикали. */
  private flatten(i: number): void {
    this.q.set(this.qx[i]!, this.qy[i]!, this.qz[i]!, this.qw[i]!);
    const yaw = Math.atan2(2 * (this.q.w * this.q.y + this.q.x * this.q.z), 1 - 2 * (this.q.y * this.q.y + this.q.x * this.q.x));
    this.q.setFromAxisAngle(this.v3.set(0, 1, 0), yaw);
    this.qx[i] = this.q.x;
    this.qy[i] = this.q.y;
    this.qz[i] = this.q.z;
    this.qw[i] = this.q.w;
  }

  private draw(): void {
    const counts = new Array<number>(this.meshes.length).fill(0);
    for (let i = 0; i < CAP; i++) {
      if (this.alive[i] === 0) continue;
      const ki = this.kind[i]!;
      const mesh = this.meshes[ki];
      if (mesh === undefined) continue;
      const k = this.kinds[ki]!;
      const n = counts[ki]!;
      counts[ki] = n + 1;
      // Искра и капля гаснут к концу жизни: сжимаются.
      const fade = Number.isFinite(k.life) ? Math.max(0.05, 1 - this.age[i]! / k.life) : 1;
      this.q.set(this.qx[i]!, this.qy[i]!, this.qz[i]!, this.qw[i]!);
      this.v3.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      this.s3.set(this.sx[i]! * fade, this.sy[i]! * fade, this.sz[i]! * fade);
      this.m4.compose(this.v3, this.q, this.s3);
      mesh.setMatrixAt(n, this.m4);
      this.c.setRGB(this.col[i * 3]!, this.col[i * 3 + 1]!, this.col[i * 3 + 2]!);
      mesh.setColorAt(n, this.c);
    }
    this.meshes.forEach((mesh, ki) => {
      mesh.count = counts[ki]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    });
  }

  /** Сколько живых: для профайлера и стенда. */
  get size(): number {
    return this.count;
  }
}

/** Высоты по клеткам карты: стена в рост, мебель по пояс, перегородка — стекло. */
export function heightsFor(map: TileMap, wallH: number, innerH: number, southH: number): (cx: number, cz: number) => number {
  return (cx, cz) => {
    if (cx < 0 || cz < 0 || cx >= map.cols || cz >= map.rows) return wallH;
    const t = map.tiles[cz * map.cols + cx];
    if (t === TILE_WALL) {
      if (cz >= map.rows - 1) return southH;
      const border = cx < 1 || cz < 1 || cx >= map.cols - 1;
      return border ? wallH : innerH;
    }
    if (t === TILE_WEAK) return 0;
    return 0;
  };
}
