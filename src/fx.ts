/**
 * Визуальный проход. Всё здесь — только рендер.
 *
 * Собственный PRNG: симуляция своим не делится, иначе визуал съел бы
 * её случайность и один seed перестал бы давать один и тот же забег.
 * Ни одна функция отсюда мир не меняет.
 */
import { Filter, GlProgram, Graphics } from 'pixi.js';
import type { World } from './ecs';
import { PALETTE } from './palette';
import { makeRng } from './rng';
import { ROOM_HEIGHT, ROOM_WIDTH, TUNING } from './tuning';

// --- Пыль ------------------------------------------------------------------

interface Mote {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export interface Dust {
  update(dt: number): void;
  draw(g: Graphics): void;
}

export function createDust(): Dust {
  const rng = makeRng(0x0f1e2d3c);
  const motes: Mote[] = [];
  const count = Math.max(0, Math.round(TUNING.fx.dustCount));
  for (let i = 0; i < count; i++) {
    motes.push({
      x: rng.range(0, ROOM_WIDTH),
      y: rng.range(0, ROOM_HEIGHT),
      phase: rng.angle(),
      speed: rng.range(0.4, 1.4),
    });
  }

  let time = 0;
  return {
    update(dt) {
      time += dt;
      const fall = TUNING.fx.dustSpeed * dt;
      for (const mote of motes) {
        mote.y += fall * mote.speed;
        mote.x += Math.sin(time * TUNING.fx.dustDrift + mote.phase) * fall * 0.5;
        if (mote.y > ROOM_HEIGHT) mote.y -= ROOM_HEIGHT;
        if (mote.x > ROOM_WIDTH) mote.x -= ROOM_WIDTH;
        if (mote.x < 0) mote.x += ROOM_WIDTH;
      }
    },
    draw(g) {
      const size = TUNING.fx.dustSize;
      for (const mote of motes) {
        g.rect(mote.x, mote.y, size, size);
      }
      g.fill({ color: PALETTE.concrete300, alpha: TUNING.fx.dustAlpha });
    },
  };
}

// --- Векторный дым вокруг заражённых ---------------------------------------

/**
 * Клубы — незамкнутые многоугольники, вращающиеся вокруг тела.
 * Форма выводится из номера сущности, поэтому у каждого свой рисунок.
 */
export function drawSmoke(g: Graphics, w: World, time: number): void {
  const cfg = TUNING.fx;
  const puffs = Math.max(0, Math.round(cfg.smokePuffs));
  if (puffs === 0 || cfg.smokeAlpha <= 0) return;

  for (const [e] of w.staffC) {
    const t = w.transform.get(e);
    const draw = w.drawC.get(e);
    if (t === undefined || draw === undefined) continue;

    for (let i = 0; i < puffs; i++) {
      const seed = e * 7 + i * 13;
      const spin = time * cfg.smokeSpin * (i % 2 === 0 ? 1 : -1) + seed;
      const radius = draw.size + cfg.smokeRadius + Math.sin(time + seed) * cfg.smokeSpread;
      const points: number[] = [];
      const corners = 5;
      for (let k = 0; k < corners; k++) {
        const angle = spin + (k / corners) * Math.PI * 2;
        const wobble = 1 + Math.sin(angle * 3 + seed) * 0.18;
        points.push(t.x + Math.cos(angle) * radius * wobble, t.y + Math.sin(angle) * radius * wobble);
      }
      g.poly(points, false).stroke({
        width: cfg.smokeWidth,
        // Дым заражения — бетонная взвесь, а не кровь. Красный занят субъектом.
        color: PALETTE.concrete500,
        alpha: cfg.smokeAlpha * (1 - i / (puffs + 1)),
      });
    }
  }
}

// --- Хроматическая аберрация ------------------------------------------------

const ABERRATION_VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const ABERRATION_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;
// Два источника искажения: кольцо бланка и точка телекинеза. Каждый —
// это кольцевая волна: смещение максимально на своём радиусе и спадает
// в обе стороны, поэтому картинка тянется вслед за фронтом, а не плывёт
// целиком.
uniform vec4 uWarpA;   // xy — центр в uv, z — радиус, w — сила
uniform vec4 uWarpB;
uniform vec2 uWarpWidth;
uniform float uAspect;

vec2 ripple(vec2 uv, vec4 warp, float width) {
    if (warp.w <= 0.0001) return vec2(0.0);
    vec2 d = (uv - warp.xy) * vec2(uAspect, 1.0);
    float r = length(d);
    if (r <= 0.0001) return vec2(0.0);
    float band = exp(-pow((r - warp.z) / max(width, 0.0001), 2.0));
    return normalize(d) * band * warp.w / vec2(uAspect, 1.0);
}

void main(void) {
    vec2 push = ripple(vTextureCoord, uWarpA, uWarpWidth.x)
              + ripple(vTextureCoord, uWarpB, uWarpWidth.y);
    vec2 uv = vTextureCoord + push;

    vec2 centred = uv - 0.5;
    // В центре ноль, к краям растёт квадратично: рамка кадра «расходится».
    // Плюс местная добавка от волны — там, где пространство тянет, цвет
    // расходится сильнее всего.
    vec2 offset = centred * dot(centred, centred) * uAmount * 0.1 + push * 0.5;
    vec4 base = texture(uTexture, uv);
    float red = texture(uTexture, uv + offset).r;
    float blue = texture(uTexture, uv - offset).b;
    finalColor = vec4(red, base.g, blue, base.a);
}
`;

export interface WarpSource {
  /** Центр в координатах экрана, 0..1. */
  x: number;
  y: number;
  /** Радиус фронта в долях высоты экрана. */
  radius: number;
  /** Сила смещения. */
  power: number;
  /** Ширина фронта. */
  width: number;
}

export interface Aberration {
  filter: Filter;
  setAmount(amount: number): void;
  /** Две волны за кадр: кольцо бланка и точка телекинеза. */
  setWarp(a: WarpSource | null, b: WarpSource | null, aspect: number): void;
}

const OFF: WarpSource = { x: 0.5, y: 0.5, radius: 0, power: 0, width: 0.1 };

export function createAberration(): Aberration {
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: ABERRATION_VERTEX,
      fragment: ABERRATION_FRAGMENT,
      name: 'aberration',
    }),
    resources: {
      aberrationUniforms: {
        uAmount: { value: TUNING.fx.aberration, type: 'f32' },
        uWarpA: { value: new Float32Array([0.5, 0.5, 0, 0]), type: 'vec4<f32>' },
        uWarpB: { value: new Float32Array([0.5, 0.5, 0, 0]), type: 'vec4<f32>' },
        uWarpWidth: { value: new Float32Array([0.1, 0.1]), type: 'vec2<f32>' },
        uAspect: { value: 1, type: 'f32' },
      },
    },
  });

  const uniforms = (): Record<string, unknown> | null => {
    const group = filter.resources['aberrationUniforms'];
    if (group === undefined || !('uniforms' in group)) return null;
    return group.uniforms as Record<string, unknown>;
  };

  return {
    filter,
    setAmount(amount) {
      const u = uniforms();
      if (u !== null) u['uAmount'] = amount;
    },
    setWarp(a, b, aspect) {
      const u = uniforms();
      if (u === null) return;
      const sa = a ?? OFF;
      const sb = b ?? OFF;
      (u['uWarpA'] as Float32Array).set([sa.x, sa.y, sa.radius, sa.power]);
      (u['uWarpB'] as Float32Array).set([sb.x, sb.y, sb.radius, sb.power]);
      (u['uWarpWidth'] as Float32Array).set([sa.width, sb.width]);
      u['uAspect'] = aspect;
    },
  };
}
