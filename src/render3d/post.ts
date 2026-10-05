/**
 * Проходы после сцены: затенение углов, свечение, тональная кривая и
 * последний кадр — аберрация с волнами, красное состояние, виньетка и
 * зерно. Последний проход работает уже в sRGB, как фильтры плоского вида,
 * поэтому рампа красного та же, что в палитре.
 */
import { Color, HalfFloatType, Vector2, Vector4, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { WebGLRenderTarget } from 'three';

const FINAL = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 },
    uWarpA: { value: new Vector4(0.5, 0.5, 0, 0) },
    uWarpB: { value: new Vector4(0.5, 0.5, 0, 0) },
    uWarpWidth: { value: new Vector2(0.1, 0.1) },
    uAspect: { value: 1 },
    uHiss: { value: 0 },
    uGamma: { value: 1 },
    uDeep: { value: new Color() },
    uHot: { value: new Color() },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.04 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new Color() },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAmount;
uniform vec4 uWarpA;
uniform vec4 uWarpB;
uniform vec2 uWarpWidth;
uniform float uAspect;
uniform float uHiss;
uniform float uGamma;
uniform vec3 uDeep;
uniform vec3 uHot;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vUv;

vec2 ripple(vec2 uv, vec4 warp, float width) {
  if (warp.w <= 0.0001) return vec2(0.0);
  vec2 d = (uv - warp.xy) * vec2(uAspect, 1.0);
  float r = length(d);
  if (r <= 0.0001) return vec2(0.0);
  float band = exp(-pow((r - warp.z) / max(width, 0.0001), 2.0));
  return normalize(d) * band * warp.w / vec2(uAspect, 1.0);
}

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 push = ripple(vUv, uWarpA, uWarpWidth.x) + ripple(vUv, uWarpB, uWarpWidth.y);
  vec2 uv = vUv + push;
  vec2 centred = uv - 0.5;
  vec2 offset = centred * dot(centred, centred) * uAmount * 0.1 + push * 0.2;
  vec4 base = texture2D(tDiffuse, uv);
  float red = texture2D(tDiffuse, uv + offset).r;
  float blue = texture2D(tDiffuse, uv - offset).b;
  vec3 color = vec3(red, base.g, blue);

  // Красное состояние: цвет уничтожается, остаётся светлота на рампе.
  float L = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 hiss = mix(uDeep, uHot, pow(clamp(L, 0.0, 1.0), uGamma));
  color = mix(color, hiss, uHiss);

  float vig = 1.0 - uVignette * smoothstep(0.3, 0.95, length(centred * vec2(uAspect * 0.75, 1.0)) * 1.2);
  color *= vig;

  float n = rand(vUv * vec2(1931.0, 1117.0) + fract(uTime * 7.0) * 113.0) - 0.5;
  color += n * uGrain;

  color = mix(color, uFlashColor, uFlash);
  gl_FragColor = vec4(color, 1.0);
}
`,
};

export interface Post {
  composer: EffectComposer;
  ao: GTAOPass;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  setSize(w: number, h: number): void;
}

/**
 * hidden — то, чего не должно быть в буфере затенения углов: лучи, ореолы,
 * пятна. Иначе воздух отбрасывал бы затенение на пол.
 */
export function createPost(renderer: WebGLRenderer, main: Scene, camera: Camera, hidden: Object3D[]): Post {
  const size = renderer.getDrawingBufferSize(new Vector2());
  const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(main, camera));
  const ao = new GTAOPass(main, camera, size.x, size.y);
  ao.blendIntensity = 1;
  const aoRender = ao.render.bind(ao);
  ao.render = (r, write, read, delta, mask) => {
    const was = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;
    aoRender(r, write, read, delta, mask);
    hidden.forEach((o, i) => {
      o.visible = was[i] ?? true;
    });
  };
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.7, 0.5, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FINAL);
  composer.addPass(final);

  return {
    composer,
    ao,
    bloom,
    final,
    setSize(w, h) {
      composer.setSize(w, h);
    },
  };
}
