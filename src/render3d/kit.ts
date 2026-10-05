/**
 * Набор для обстановки. Детали складываются по материалам и в конце
 * сливаются в один меш на материал: вестибюль из тысячи коробок —
 * два десятка вызовов отрисовки.
 *
 * Развёртка у каждой детали мировая, как у стен: текстура не тянется по
 * длинной столешнице и не сжимается на узкой планке.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const SPHERE = new SphereGeometry(0.5, 16, 12);

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const s = new Vector3();

export class Kit {
  private readonly buckets = new Map<Material, BufferGeometry[]>();
  private readonly noShadow = new Set<Material>();

  constructor(private readonly texSpan = 2) {}

  /** Деталь: заготовка, масштаб, поворот (рад) и положение центра. */
  add(geo: BufferGeometry, mat: Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): void {
    const g = geo.clone();
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    p.set(x, y, z);
    s.set(sx, sy, sz);
    m4.compose(p, q, s);
    g.applyMatrix4(m4);
    this.worldUv(g);
    let list = this.buckets.get(mat);
    if (list === undefined) {
      list = [];
      this.buckets.set(mat, list);
    }
    list.push(g);
  }

  /** Коробка от угла до угла. */
  box(mat: Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ry = 0): void {
    this.add(BOX, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0, ry);
  }

  /** Цилиндр стоя: центр основания, радиус, высота. */
  cyl(mat: Material, x: number, y0: number, z: number, r: number, h: number, rx = 0, rz = 0): void {
    this.add(CYL, mat, x, y0 + h / 2, z, r * 2, h, r * 2, rx, 0, rz);
  }

  /** Труба между двумя точками. */
  tube(mat: Material, a: Vector3, b: Vector3, r: number): void {
    const len = a.distanceTo(b);
    if (len < 1e-5) return;
    const dir = b.clone().sub(a).normalize();
    q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    e.setFromQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.add(CYL, mat, mid.x, mid.y, mid.z, r * 2, len, r * 2, e.x, e.y, e.z);
  }

  sphere(mat: Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.add(SPHERE, mat, x, y, z, sx, sy, sz);
  }

  /** Материал, который тени не отбрасывает: стекло, свет, краска. */
  flat(mat: Material): Material {
    this.noShadow.add(mat);
    return mat;
  }

  /** Слить и выложить в группу. Возвращает меши, чтобы их можно было освободить. */
  build(group: Group): Mesh[] {
    const out: Mesh[] = [];
    for (const [mat, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (merged === null) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, mat);
      const cast = !this.noShadow.has(mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }

  private worldUv(g: BufferGeometry): void {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    if (pos === undefined || nor === undefined || uv === undefined) return;
    const span = this.texSpan;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nor.getX(i));
      const ny = Math.abs(nor.getY(i));
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (ny >= nx && ny >= Math.abs(nor.getZ(i))) uv.setXY(i, x / span, z / span);
      else if (nx >= Math.abs(nor.getZ(i))) uv.setXY(i, z / span, y / span);
      else uv.setXY(i, x / span, y / span);
    }
    uv.needsUpdate = true;
  }
}
