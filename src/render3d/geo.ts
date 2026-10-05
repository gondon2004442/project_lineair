/**
 * Сборщик статичной геометрии помещения. Грани складываются в один буфер
 * на материал, поэтому стена из сотни клеток — один вызов отрисовки.
 *
 * Развёртка мировая: координата на текстуре берётся из положения грани в
 * мире, а не из номера клетки. Отсюда непрерывный бетон без швов на
 * стыках клеток — швы опалубки идут своим шагом, как у настоящей стены.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';

export type V3 = readonly [number, number, number];

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  /** Сколько клеток мира укладывается в одно повторение текстуры. */
  constructor(private readonly texSpan = 4) {}

  get empty(): boolean {
    return this.idx.length === 0;
  }

  /**
   * Четырёхугольник o, o+u, o+u+v, o+v. Обход выбирается так, чтобы
   * лицо смотрело по n — путать порядок вершин руками не придётся.
   */
  quad(o: V3, u: V3, v: V3, n: V3): void {
    const cx = u[1] * v[2] - u[2] * v[1];
    const cy = u[2] * v[0] - u[0] * v[2];
    const cz = u[0] * v[1] - u[1] * v[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const p = [
      o,
      [o[0] + u[0], o[1] + u[1], o[2] + u[2]],
      [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]],
      [o[0] + v[0], o[1] + v[1], o[2] + v[2]],
    ] as const;
    const base = this.pos.length / 3;
    for (const q of p) {
      this.pos.push(q[0], q[1], q[2]);
      this.nor.push(n[0], n[1], n[2]);
      const [s, t] = this.worldUv(q, n);
      this.uv.push(s, t);
    }
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Коробка от min до max. faces — битовая маска граней, см. FACE. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, faces: number = FACE.ALL): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    if (faces & FACE.PY) this.quad([x0, y1, z0], [dx, 0, 0], [0, 0, dz], [0, 1, 0]);
    if (faces & FACE.NY) this.quad([x0, y0, z0], [dx, 0, 0], [0, 0, dz], [0, -1, 0]);
    if (faces & FACE.PX) this.quad([x1, y0, z0], [0, 0, dz], [0, dy, 0], [1, 0, 0]);
    if (faces & FACE.NX) this.quad([x0, y0, z0], [0, 0, dz], [0, dy, 0], [-1, 0, 0]);
    if (faces & FACE.PZ) this.quad([x0, y0, z1], [dx, 0, 0], [0, dy, 0], [0, 0, 1]);
    if (faces & FACE.NZ) this.quad([x0, y0, z0], [dx, 0, 0], [0, dy, 0], [0, 0, -1]);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }

  private worldUv(p: V3, n: V3): [number, number] {
    const s = this.texSpan;
    if (Math.abs(n[1]) > 0.5) return [p[0] / s, p[2] / s];
    if (Math.abs(n[0]) > 0.5) return [p[2] / s, p[1] / s];
    return [p[0] / s, p[1] / s];
  }
}

export const FACE = {
  PX: 1,
  NX: 2,
  PY: 4,
  NY: 8,
  PZ: 16,
  NZ: 32,
  ALL: 63,
} as const;
