/**
 * Объёмный луч: столб света в пыльном воздухе. Это не настоящий объём,
 * а оболочка конуса с прозрачностью от края к оси и от верха к низу —
 * дёшево, и с видом сверху читается как воздух, в котором что-то висит.
 */
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalView;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vNormalView = normalize(normalMatrix * normal);
  vViewDir = normalize(-view.xyz);
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalView;
varying vec3 vViewDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  // Край оболочки — там, где мы смотрим вскользь: туда свет тает.
  float facing = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float edge = pow(facing, 1.6);
  // Сверху плотнее, у пола растворяется: свет рассеялся по дороге.
  float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  float drift = noise(vWorld * 1.3 + vec3(0.0, -uTime * 0.25, uTime * 0.1));
  float dust = 0.65 + 0.7 * drift;
  float a = uIntensity * edge * along * dust;
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

export function beamMaterial(color: number, intensity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uIntensity: { value: intensity },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  });
}
