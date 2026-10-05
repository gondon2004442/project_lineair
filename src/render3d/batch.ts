/**
 * Пачка четырёхугольников, собираемая заново каждый кадр. Ею рисуется
 * всё мелкое и служебное: телеграфы, рамки, кольца, таблички, пятна на
 * полу. Один буфер — один вызов отрисовки, сколько бы штрихов ни было.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  type Material,
  Vector3,
} from 'three';

const tmp = new Color();

export class QuadBatch {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly uv: Float32Array;
  private readonly geo: BufferGeometry;
  private count = 0;
  /** Базис «лицом к камере»: таблички и знаки над головами. */
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);

  constructor(private readonly capacity: number, material: Material) {
    this.pos = new Float32Array(capacity * 12);
    this.col = new Float32Array(capacity * 16);
    this.uv = new Float32Array(capacity * 8);
    const idx = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
    }
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('uv', new BufferAttribute(this.uv, 2).setUsage(DynamicDrawUsage));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
  }

  begin(): void {
    this.count = 0;
  }

  end(): void {
    this.geo.setDrawRange(0, this.count * 6);
    for (const name of ['position', 'color', 'uv']) {
      const attr = this.geo.getAttribute(name) as BufferAttribute;
      attr.needsUpdate = true;
    }
  }

  /** Произвольный четырёхугольник: четыре угла по обходу. */
  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    color: number,
    alpha: number,
  ): void {
    if (this.count >= this.capacity || alpha <= 0) return;
    const i = this.count++;
    this.pos.set([ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz], i * 12);
    // Палитра записана в sRGB; в буфер идёт линейный цвет, как ждёт шейдер.
    tmp.setHex(color);
    for (let k = 0; k < 4; k++) this.col.set([tmp.r, tmp.g, tmp.b, alpha], i * 16 + k * 4);
    this.uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
  }

  /** Прямоугольник на горизонтальной плоскости y по центру и полуразмерам. */
  flat(x: number, z: number, hx: number, hz: number, y: number, color: number, alpha = 1): void {
    this.quad(x - hx, y, z - hz, x + hx, y, z - hz, x + hx, y, z + hz, x - hx, y, z + hz, color, alpha);
  }

  /** Отрезок шириной width на высоте y. */
  line(x0: number, z0: number, x1: number, z1: number, width: number, y: number, color: number, alpha = 1): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const nx = (-dz / len) * width * 0.5;
    const nz = (dx / len) * width * 0.5;
    this.quad(x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x0 - nx, y, z0 - nz, color, alpha);
  }

  /** Рамка вокруг прямоугольника, линия идёт внутрь от края. */
  frame(x: number, z: number, hx: number, hz: number, width: number, y: number, color: number, alpha = 1): void {
    this.line(x - hx, z - hz + width / 2, x + hx, z - hz + width / 2, width, y, color, alpha);
    this.line(x - hx, z + hz - width / 2, x + hx, z + hz - width / 2, width, y, color, alpha);
    this.line(x - hx + width / 2, z - hz + width, x - hx + width / 2, z + hz - width, width, y, color, alpha);
    this.line(x + hx - width / 2, z - hz + width, x + hx - width / 2, z + hz - width, width, y, color, alpha);
  }

  /** Кольцо радиуса r. */
  ring(x: number, z: number, r: number, width: number, y: number, color: number, alpha = 1, segments = 48): void {
    if (r <= 0) return;
    const r0 = Math.max(0, r - width / 2);
    const r1 = r + width / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      this.quad(
        x + c0 * r0, y, z + s0 * r0,
        x + c1 * r0, y, z + s1 * r0,
        x + c1 * r1, y, z + s1 * r1,
        x + c0 * r1, y, z + s0 * r1,
        color,
        alpha,
      );
    }
  }

  /** Прямоугольник лицом к камере: центр в мире, полуразмеры в мировых единицах. */
  upright(x: number, y: number, z: number, hw: number, hh: number, color: number, alpha = 1): void {
    const r = this.right;
    const u = this.up;
    this.quad(
      x - r.x * hw - u.x * hh, y - r.y * hw - u.y * hh, z - r.z * hw - u.z * hh,
      x + r.x * hw - u.x * hh, y + r.y * hw - u.y * hh, z + r.z * hw - u.z * hh,
      x + r.x * hw + u.x * hh, y + r.y * hw + u.y * hh, z + r.z * hw + u.z * hh,
      x - r.x * hw + u.x * hh, y - r.y * hw + u.y * hh, z - r.z * hw + u.z * hh,
      color,
      alpha,
    );
  }
}
