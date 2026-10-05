/**
 * Процедурные материалы. Ни одного файла с картинкой: всё считается на
 * старте из шума, чтобы сборка оставалась такой же лёгкой, как была.
 *
 * Каждый материал — тройка карт: цвет, рельеф (карта нормалей из
 * высоты) и шероховатость. Цвет держится у палитры по светлоте, а
 * фактура добавляет то, чего не было у плоских заливок: поры бетона,
 * швы опалубки, потёки, ворс ковролина, волокно ореха.
 */
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

export interface PbrSet {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

// --- Шум ------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Плиточный value-шум: повторяется с периодом period клеток. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Фрактальный шум, плиточный по размеру текстуры. */
function fbm(px: number, py: number, size: number, base: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = base;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise((px / size) * period, (py / size) * period, period, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

// --- Сборка карт ------------------------------------------------------------

interface Sample {
  /** Высота рельефа, 0..1. */
  h: number;
  /** Цвет в sRGB, 0..255. */
  r: number;
  g: number;
  b: number;
  /** Шероховатость, 0..1. */
  rough: number;
}

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2D-контекст недоступен');
  return { c, ctx, img: ctx.createImageData(size, size) };
}

function wrap(t: CanvasTexture, color: boolean): CanvasTexture {
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  if (color) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function build(size: number, bump: number, sample: (x: number, y: number) => Sample): PbrSet {
  const height = new Float32Array(size * size);
  const col = canvas(size);
  const rough = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = sample(x, y);
      const i = y * size + x;
      height[i] = s.h;
      const o = i * 4;
      col.img.data[o] = clamp255(s.r);
      col.img.data[o + 1] = clamp255(s.g);
      col.img.data[o + 2] = clamp255(s.b);
      col.img.data[o + 3] = 255;
      const r = clamp255(s.rough * 255);
      rough.img.data[o] = r;
      rough.img.data[o + 1] = r;
      rough.img.data[o + 2] = r;
      rough.img.data[o + 3] = 255;
    }
  }
  col.ctx.putImageData(col.img, 0, 0);
  rough.ctx.putImageData(rough.img, 0, 0);

  // Нормали из высоты: разность соседей с переходом через край.
  const nor = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)] ?? 0;
      const r = height[y * size + ((x + 1) % size)] ?? 0;
      const u = height[((y - 1 + size) % size) * size + x] ?? 0;
      const d = height[((y + 1) % size) * size + x] ?? 0;
      let nx = (l - r) * bump;
      let ny = (d - u) * bump;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * size + x) * 4;
      nor.img.data[o] = (nx * 0.5 + 0.5) * 255;
      nor.img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      nor.img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      nor.img.data[o + 3] = 255;
    }
  }
  nor.ctx.putImageData(nor.img, 0, 0);

  return {
    map: wrap(new CanvasTexture(col.c), true),
    normalMap: wrap(new CanvasTexture(nor.c), false),
    roughnessMap: wrap(new CanvasTexture(rough.c), false),
  };
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Мягкая ступенька: 1 внутри шва ширины w, спадает к краям. */
function groove(d: number, w: number): number {
  const t = Math.abs(d) / w;
  return t >= 1 ? 0 : 1 - t * t;
}

// --- Материалы --------------------------------------------------------------

/**
 * Монолитный бетон стен. Опалубка: щиты 1×0.5 текстуры с утопленным швом
 * и стяжками в углах — главная примета брутализма. Сверху вниз идут
 * потёки: стену заливали давно, и вода по ней стекала.
 */
export function concreteWall(base: number): PbrSet {
  const size = 512;
  const [br, bg, bb] = rgbOf(base);
  const panelW = size / 2;
  const panelH = size / 4;
  return build(size, 3.2, (x, y) => {
    const pores = fbm(x, y, size, 32, 3, 11);
    const cloud = fbm(x, y, size, 4, 4, 23);
    // Потёки: шум, растянутый по вертикали.
    const streak = fbm(x * 6, y * 0.35, size, 8, 3, 37);
    const gx = x % panelW;
    const gy = y % panelH;
    const seam = Math.max(groove(gx, 2.2), groove(gx - panelW, 2.2), groove(gy, 2.2), groove(gy - panelH, 2.2));
    // Стяжки: круглые утопленные отверстия в четырёх точках щита.
    let tie = 0;
    for (const tx of [panelW * 0.2, panelW * 0.8]) {
      for (const ty of [panelH * 0.25, panelH * 0.75]) {
        const d = Math.hypot(gx - tx, gy - ty);
        tie = Math.max(tie, d < 6 ? 1 - (d / 6) ** 2 : 0);
      }
    }
    const pit = pores > 0.78 ? (pores - 0.78) * 3 : 0;
    const h = 0.55 + cloud * 0.25 + pores * 0.08 - seam * 0.45 - tie * 0.6 - pit * 0.3;
    const shade = 0.82 + cloud * 0.32 - (streak > 0.6 ? (streak - 0.6) * 0.9 : 0) - seam * 0.25 - tie * 0.35 - pit * 0.2;
    return {
      h,
      r: br * shade,
      g: bg * shade,
      b: bb * shade * 1.01,
      rough: 0.82 + pores * 0.1 - cloud * 0.08 + seam * 0.1,
    };
  });
}

/**
 * Пол бетонного сектора: шлифованный бетон крупными плитами. Он
 * блестит — по нему видно, где лампа и откуда идёт луч.
 */
export function polishedFloor(base: number, seamColor: number): PbrSet {
  const size = 512;
  const [br, bg, bb] = rgbOf(base);
  const [sr, sg, sb] = rgbOf(seamColor);
  // Текстура покрывает 4×4 клетки, плита — клетка.
  const slab = size / 4;
  return build(size, 2.2, (x, y) => {
    const cloud = fbm(x, y, size, 3, 5, 51);
    const fleck = fbm(x, y, size, 64, 2, 53);
    const wear = fbm(x, y, size, 6, 3, 59);
    const gx = x % slab;
    const gy = y % slab;
    const seam = Math.max(groove(gx, 1.6), groove(gx - slab, 1.6), groove(gy, 1.6), groove(gy - slab, 1.6));
    // Каждая плита чуть своего тона: заливали в разные дни.
    const tone = (hash(Math.floor(x / slab), Math.floor(y / slab), 61) - 0.5) * 0.07;
    const shade = 0.9 + (cloud - 0.5) * 0.12 + tone + (fleck > 0.78 ? 0.06 : 0) - (fleck < 0.2 ? 0.05 : 0);
    const k = 1 - seam;
    return {
      h: 0.6 + cloud * 0.08 - seam * 0.5,
      r: br * shade * k + sr * seam,
      g: bg * shade * k + sg * seam,
      b: bb * shade * k + sb * seam,
      rough: 0.3 + wear * 0.14 + seam * 0.45,
    };
  });
}

/** Ковролин офисного сектора: плитки с ворсом, у каждой свой наклон ворса. */
export function carpet(base: number, seamColor: number): PbrSet {
  const size = 512;
  const [br, bg, bb] = rgbOf(base);
  const [sr, sg, sb] = rgbOf(seamColor);
  const tile = size / 4;
  return build(size, 1.6, (x, y) => {
    const tx = Math.floor(x / tile);
    const ty = Math.floor(y / tile);
    const turned = (tx + ty) % 2 === 0;
    const nap = turned ? fbm(x * 3, y * 0.6, size, 32, 2, 71) : fbm(x * 0.6, y * 3, size, 32, 2, 73);
    const fibre = hash(x, y, 79);
    const dirt = fbm(x, y, size, 4, 4, 83);
    const gx = x % tile;
    const gy = y % tile;
    const seam = Math.max(groove(gx, 1.2), groove(gx - tile, 1.2), groove(gy, 1.2), groove(gy - tile, 1.2));
    const shade = 0.82 + nap * 0.22 + fibre * 0.08 - dirt * 0.12 + (turned ? 0.03 : -0.03);
    const k = 1 - seam;
    return {
      h: 0.5 + nap * 0.2 + fibre * 0.15 - seam * 0.4,
      r: br * shade * k + sr * seam,
      g: bg * shade * k + sg * seam,
      b: bb * shade * k + sb * seam,
      rough: 0.95,
    };
  });
}

/** Ореховая обшивка: вертикальные доски с волокном. */
export function walnut(base: number): PbrSet {
  const size = 512;
  const [br, bg, bb] = rgbOf(base);
  const board = size / 6;
  return build(size, 1.4, (x, y) => {
    const bi = Math.floor(x / board);
    const off = hash(bi, 0, 91) * 400;
    const warp = fbm(x, y + off, size, 4, 3, 93) * 30;
    const grain = Math.sin((x + warp) * 0.55 + hash(bi, 1, 97) * 6) * 0.5 + 0.5;
    const fine = fbm(x * 4, y * 0.25 + off, size, 16, 2, 101);
    const gx = x % board;
    const seam = Math.max(groove(gx, 1.4), groove(gx - board, 1.4));
    const shade = 0.75 + grain * 0.22 + fine * 0.18 + (hash(bi, 2, 103) - 0.5) * 0.12 - seam * 0.5;
    return {
      h: 0.5 + grain * 0.06 + fine * 0.05 - seam * 0.5,
      r: br * shade,
      g: bg * shade,
      b: bb * shade,
      rough: 0.48 + fine * 0.18 + seam * 0.3,
    };
  });
}

/** Шлифованный металл: тонкие штрихи вдоль одной оси. */
export function brushedMetal(base: number): PbrSet {
  const size = 256;
  const [br, bg, bb] = rgbOf(base);
  return build(size, 0.8, (x, y) => {
    const streak = fbm(x * 0.08, y * 8, size, 8, 3, 111);
    const spot = fbm(x, y, size, 4, 3, 113);
    const shade = 0.9 + streak * 0.16 - spot * 0.08;
    return {
      h: 0.5 + streak * 0.1,
      r: br * shade,
      g: bg * shade,
      b: bb * shade,
      rough: 0.32 + streak * 0.18 + spot * 0.15,
    };
  });
}

/** Бетон тел: заражение — это кожа, превращённая в камень. */
export function fleshConcrete(): PbrSet {
  const size = 256;
  return build(size, 4, (x, y) => {
    const crack = fbm(x, y, size, 8, 4, 131);
    const pores = fbm(x, y, size, 32, 2, 137);
    const vein = Math.abs(crack - 0.5) < 0.025 ? 1 : 0;
    const shade = 200 + pores * 40 - vein * 90;
    return { h: 0.5 + pores * 0.25 - vein * 0.6, r: shade, g: shade, b: shade, rough: 0.9 };
  });
}

/** Ткань костюма субъекта: плотное плетение. */
export function fabric(): PbrSet {
  const size = 128;
  return build(size, 1.2, (x, y) => {
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
    const fold = fbm(x, y, size, 4, 3, 151);
    const shade = 210 + weave * 30 + fold * 15;
    return { h: 0.5 + weave * 0.2 + fold * 0.2, r: shade, g: shade, b: shade, rough: 0.72 + weave * 0.1 };
  });
}

/** Круглое пятно света: ореолы, лужи ламп, свечение снарядов. */
export function glowSprite(): Texture {
  const size = 128;
  const { c, ctx } = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new CanvasTexture(c);
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Служебная штриховка запертого проёма: жёлтое с чёрным под 45°. */
export function hazard(yellow: number, black: number): Texture {
  const size = 128;
  const { c, ctx } = canvas(size);
  const y = rgbOf(yellow);
  const b = rgbOf(black);
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const band = Math.floor((px + py) / 16) % 2 === 0;
      const dirt = fbm(px, py, size, 8, 3, 171) * 0.25;
      const src = band ? y : b;
      const o = (py * size + px) * 4;
      img.data[o] = src[0] * (0.85 - dirt * 0.6);
      img.data[o + 1] = src[1] * (0.85 - dirt * 0.6);
      img.data[o + 2] = src[2] * (0.85 - dirt * 0.6);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrap(new CanvasTexture(c), true);
}
