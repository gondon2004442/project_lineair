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

// --- Вестибюль -------------------------------------------------------------

/**
 * Терраццо: светлый камень с крошкой, крупные плиты 2×2 клетки. Пол
 * вестибюля натёрт до блеска — в нём отражаются окна и люди.
 */
export function terrazzo(): PbrSet {
  const size = 512;
  const slab = size / 2;
  return build(size, 1.2, (x, y) => {
    const cloud = fbm(x, y, size, 3, 4, 201);
    const chip = hash(Math.floor(x / 3), Math.floor(y / 3), 203);
    const chip2 = hash(Math.floor(x / 5), Math.floor(y / 5), 207);
    const wear = fbm(x, y, size, 5, 3, 209);
    const gx = x % slab;
    const gy = y % slab;
    const seam = Math.max(groove(gx, 1.3), groove(gx - slab, 1.3), groove(gy, 1.3), groove(gy - slab, 1.3));
    const tone = (hash(Math.floor(x / slab), Math.floor(y / slab), 211) - 0.5) * 0.04;
    let r = 168;
    let g = 171;
    let b = 172;
    // Крошка: тёмная, светлая и редкая тёплая.
    if (chip > 0.93) {
      r = 92; g = 96; b = 101;
    } else if (chip > 0.86) {
      r = 228; g = 229; b = 228;
    } else if (chip2 > 0.965) {
      r = 168; g = 150; b = 128;
    }
    const k = (0.94 + (cloud - 0.5) * 0.08 + tone) * (1 - seam * 0.55);
    return {
      h: 0.6 - seam * 0.5 + (chip > 0.93 ? 0.03 : 0),
      r: r * k,
      g: g * k,
      b: b * k,
      rough: 0.16 + wear * 0.16 + seam * 0.5,
    };
  });
}

/** Штукатурка: тёплая белая с едва заметной неровностью валика. */
export function plaster(): PbrSet {
  const size = 512;
  return build(size, 1.6, (x, y) => {
    const roll = fbm(x, y * 0.4, size, 8, 3, 221);
    const fine = fbm(x, y, size, 64, 2, 223);
    const stain = fbm(x, y, size, 3, 3, 227);
    const k = 0.95 + (roll - 0.5) * 0.06 + (fine - 0.5) * 0.04 - (stain > 0.68 ? (stain - 0.68) * 0.25 : 0);
    return { h: 0.5 + roll * 0.1 + fine * 0.15, r: 214 * k, g: 211 * k, b: 204 * k, rough: 0.88 };
  });
}

/** Полированный гранит: цоколь, столешницы, ступени. */
export function granite(): PbrSet {
  const size = 256;
  return build(size, 0.6, (x, y) => {
    const grain = hash(Math.floor(x / 2), Math.floor(y / 2), 231);
    const cloud = fbm(x, y, size, 4, 4, 233);
    let v = 40 + cloud * 18;
    if (grain > 0.9) v += 45;
    else if (grain < 0.08) v -= 14;
    return { h: 0.5, r: v, g: v * 1.02, b: v * 1.06, rough: 0.14 + cloud * 0.08 };
  });
}

/** Крашеный металл: шкафчики и батареи. Краска с потёртостями. */
export function paintedMetal(base: number): PbrSet {
  const size = 256;
  const [br, bg, bb] = rgbOf(base);
  return build(size, 0.9, (x, y) => {
    const orange = fbm(x, y, size, 32, 2, 241);
    const scratch = fbm(x * 0.2, y * 6, size, 8, 3, 243);
    const chip = fbm(x, y, size, 12, 3, 247);
    const bare = chip > 0.74 ? 1 : 0;
    const k = 0.93 + orange * 0.08 + (scratch > 0.7 ? 0.06 : 0);
    return {
      h: 0.5 + orange * 0.06 - bare * 0.2,
      r: bare ? 120 : br * k,
      g: bare ? 124 : bg * k,
      b: bare ? 128 : bb * k,
      rough: bare ? 0.35 : 0.48 + orange * 0.12,
    };
  });
}

/** Рисованная текстура: canvas со своим рисунком. */
export function painted(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2D-контекст недоступен');
  draw(ctx);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Циферблат служебных часов: белый, чёрные риски, без цифр. */
export function clockFace(): CanvasTexture {
  return painted(256, 256, (ctx) => {
    ctx.fillStyle = '#e9e7e1';
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1c1d1f';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const long = i % 5 === 0;
      ctx.lineWidth = long ? 7 : 2;
      const r0 = long ? 92 : 104;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
      ctx.lineTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114);
      ctx.stroke();
    }
  });
}

/** Лист служебной бумаги: шапка, строки машинописи, печать. */
export function documentSheet(seed: number): CanvasTexture {
  return painted(128, 176, (ctx) => {
    ctx.fillStyle = '#dcdcd6';
    ctx.fillRect(0, 0, 128, 176);
    ctx.fillStyle = '#2a2c2f';
    ctx.fillRect(12, 12, 70 + (seed % 3) * 10, 8);
    for (let i = 0; i < 14; i++) {
      const w = 60 + hash(i, seed, 251) * 44;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(12, 34 + i * 9, w, 3);
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#3d4552';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(92, 150, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

/** Экран терминала: тёмное стекло, зелёные строки, рамка развёртки. */
export function terminalScreen(): CanvasTexture {
  const t = painted(256, 192, (ctx) => {
    ctx.fillStyle = '#071008';
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = '#7dff9a';
    for (let i = 0; i < 16; i++) {
      const w = 40 + hash(i, 3, 261) * 170;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(14, 12 + i * 10, w, 5);
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < 192; y += 3) ctx.fillRect(0, y, 256, 1);
    ctx.globalAlpha = 1;
  });
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}

/** Плакат: служебная графика без слов — плашки, полосы, круг. */
export function poster(seed: number): CanvasTexture {
  return painted(128, 180, (ctx) => {
    ctx.fillStyle = '#c9c7bf';
    ctx.fillRect(0, 0, 128, 180);
    ctx.fillStyle = '#25272a';
    ctx.fillRect(10, 10, 108, 54);
    ctx.fillStyle = seed % 2 === 0 ? '#e8b923' : '#8a8f96';
    ctx.beginPath();
    ctx.arc(64, 108, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#25272a';
    for (let i = 0; i < 4; i++) ctx.fillRect(14, 146 + i * 7, 60 + hash(i, seed, 271) * 40, 3);
  });
}

// --- Уровни ------------------------------------------------------------------

/** Линолеум картотеки: тёмный, с мелким крапом и рулонными швами. */
export function linoleum(base: number): PbrSet {
  const size = 512;
  const [br, bg, bb] = rgbOf(base);
  const strip = size / 2;
  return build(size, 0.8, (x, y) => {
    const speck = hash(Math.floor(x / 2), Math.floor(y / 2), 301);
    const cloud = fbm(x, y, size, 4, 4, 303);
    const scuff = fbm(x * 3, y * 0.5, size, 16, 2, 307);
    const seam = Math.max(groove(x % strip, 1), groove((x % strip) - strip, 1));
    let k = 0.92 + (cloud - 0.5) * 0.12 + (speck > 0.93 ? 0.1 : speck < 0.05 ? -0.08 : 0);
    k *= 1 - seam * 0.4;
    return { h: 0.5 - seam * 0.4, r: br * k, g: bg * k, b: bb * k, rough: 0.28 + scuff * 0.25 + seam * 0.3 };
  });
}

/** Белый бетон натурной части: почти без фактуры, крупные плиты. */
export function whiteConcrete(): PbrSet {
  const size = 512;
  const slab = size / 2;
  return build(size, 0.8, (x, y) => {
    const cloud = fbm(x, y, size, 3, 4, 311);
    const pores = fbm(x, y, size, 48, 2, 313);
    const seam = Math.max(groove(x % slab, 1), groove((x % slab) - slab, 1), groove(y % slab, 1), groove((y % slab) - slab, 1));
    const k = (0.97 + (cloud - 0.5) * 0.05 - (pores > 0.8 ? 0.04 : 0)) * (1 - seam * 0.25);
    return { h: 0.5 + pores * 0.05 - seam * 0.3, r: 236 * k, g: 236 * k, b: 233 * k, rough: 0.7 + pores * 0.1 };
  });
}

/** Бетон бойлерной: тёмный, в масляных пятнах и ржавых потёках. */
export function oilyConcrete(): PbrSet {
  const size = 512;
  const slab = size / 2;
  return build(size, 2.4, (x, y) => {
    const cloud = fbm(x, y, size, 4, 5, 321);
    const oil = fbm(x, y, size, 3, 4, 323);
    const grit = hash(x, y, 327);
    const rust = fbm(x, y, size, 6, 3, 329);
    const seam = Math.max(groove(x % slab, 2), groove((x % slab) - slab, 2), groove(y % slab, 2), groove((y % slab) - slab, 2));
    let r = 92;
    let g = 92;
    let b = 90;
    const k = 0.82 + cloud * 0.3 + (grit - 0.5) * 0.08 - seam * 0.3;
    r *= k;
    g *= k;
    b *= k;
    const wet = oil > 0.62 ? Math.min(1, (oil - 0.62) * 4) : 0;
    r *= 1 - wet * 0.55;
    g *= 1 - wet * 0.55;
    b *= 1 - wet * 0.5;
    if (rust > 0.72) {
      r += 30 * (rust - 0.72) * 4;
      g += 10 * (rust - 0.72) * 4;
    }
    return { h: 0.55 + cloud * 0.2 - seam * 0.5 + grit * 0.05, r, g, b, rough: 0.85 - wet * 0.6 };
  });
}

/** Портрет: масляный парадный бюст на тёмном фоне. Лица нет — только форма. */
export function portraitTex(seed: number): CanvasTexture {
  return painted(128, 160, (ctx) => {
    const bg = ['#2c2a24', '#24292b', '#2e2620'][seed % 3] ?? '#2c2a24';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 128, 160);
    const g = ctx.createRadialGradient(64, 60, 4, 64, 70, 90);
    g.addColorStop(0, 'rgba(255,240,210,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#17181a';
    ctx.beginPath();
    ctx.ellipse(64, 150, 52, 46, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = ['#a88f78', '#9c8a7c', '#b09a86'][seed % 3] ?? '#a88f78';
    ctx.beginPath();
    ctx.ellipse(64, 64, 20, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.ellipse(64, 46, 21, 12, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#d8d3c8';
    ctx.beginPath();
    ctx.moveTo(52, 104);
    ctx.lineTo(64, 122);
    ctx.lineTo(76, 104);
    ctx.fill();
  });
}

/** Сетка-рабица: прозрачная текстура для клеток бойлерной. */
export function meshTex(): CanvasTexture {
  const t = painted(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(190,195,200,1)';
    ctx.lineWidth = 2;
    for (let i = -64; i < 128; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 64, 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 64, 0);
      ctx.lineTo(i, 64);
      ctx.stroke();
    }
  });
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}
