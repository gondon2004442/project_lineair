/**
 * Отражение в полу. Натёртый камень вестибюля и шлифованный бетон
 * отражают окна, светильники и людей — без этого пол читается краской.
 *
 * Зеркальная камера снимает сцену из-под пола в половинном разрешении;
 * пол берёт снимок по своей экранной проекции, размывает по своей
 * шероховатости (уровни мипмапов) и добавляет с френелем: вскользь
 * отражение сильнее, сверху — слабее.
 */
import {
  HalfFloatType,
  LinearMipmapLinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { Materials } from './materials';

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class Reflection {
  private readonly rt: WebGLRenderTarget;
  private readonly cam = new PerspectiveCamera();
  private readonly uniforms = {
    tReflect: { value: null as unknown },
    uTexMatrix: { value: new Matrix4() },
    uStrength: { value: 0 },
  };
  private floors: Mesh[] = [];
  private readonly patched = new WeakSet<Material>();
  private readonly size = new Vector2();
  private readonly clip = [new Plane(new Vector3(0, 1, 0), 0)];

  constructor(private readonly gl: WebGLRenderer, m: Materials) {
    this.rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType });
    this.rt.texture.generateMipmaps = true;
    this.rt.texture.minFilter = LinearMipmapLinearFilter;
    this.uniforms.tReflect.value = this.rt.texture;
    this.cam.layers.enable(2);
    this.patch(m.floor);
  }

  setFloors(floors: Mesh[]): void {
    this.floors = floors;
    for (const f of floors) {
      const mat = f.material as Material;
      if ('roughness' in mat) this.patch(mat as MeshStandardMaterial);
    }
  }

  render(scene: Scene, camera: Camera, strength: number, hide: Object3D[]): void {
    this.uniforms.uStrength.value = strength;
    if (strength <= 0 || this.floors.length === 0) return;
    const gl = this.gl;
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(4, Math.floor(this.size.x / 2));
    const h = Math.max(4, Math.floor(this.size.y / 2));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);

    // Камера под полом: положение и взгляд отражены плоскостью y = 0.
    const src = camera as PerspectiveCamera;
    const pos = new Vector3().setFromMatrixPosition(src.matrixWorld);
    const dir = new Vector3(0, 0, -1).transformDirection(src.matrixWorld);
    const up = new Vector3(0, 1, 0).transformDirection(src.matrixWorld);
    const target = pos.clone().add(dir);
    pos.y = -pos.y;
    target.y = -target.y;
    up.y = -up.y;
    const cam = this.cam;
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(target);
    cam.fov = Math.min(120, (src.fov ?? 30) * 1.35);
    cam.aspect = w / h;
    cam.near = src.near ?? 0.5;
    cam.far = src.far ?? 400;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.uniforms.uTexMatrix.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    const was = hide.map((o) => o.visible);
    const floorsWas = this.floors.map((f) => f.visible);
    for (const o of hide) o.visible = false;
    for (const f of this.floors) f.visible = false;
    const prevClip = gl.clippingPlanes;
    gl.clippingPlanes = this.clip;
    gl.setRenderTarget(this.rt);
    gl.clear();
    gl.render(scene, cam);
    gl.setRenderTarget(null);
    gl.clippingPlanes = prevClip;
    hide.forEach((o, i) => (o.visible = was[i] ?? true));
    this.floors.forEach((f, i) => (f.visible = floorsWas[i] ?? true));
  }

  private patch(mat: MeshStandardMaterial): void {
    if (this.patched.has(mat)) return;
    this.patched.add(mat);
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms['tReflect'] = u.tReflect as never;
      shader.uniforms['uTexMatrix'] = u.uTexMatrix;
      shader.uniforms['uStrength'] = u.uStrength;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform mat4 uTexMatrix;\nvarying vec4 vReflUv;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vReflUv = uTexMatrix * modelMatrix * vec4(transformed, 1.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform sampler2D tReflect;\nuniform float uStrength;\nvarying vec4 vReflUv;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          `{
    vec2 ruv = vReflUv.xy / vReflUv.w + normal.xy * 0.012;
    float rough = clamp(roughnessFactor, 0.0, 1.0);
    vec3 refl = textureLod(tReflect, ruv, rough * 7.0).rgb;
    float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
    float edge = smoothstep(0.0, 0.04, ruv.x) * smoothstep(1.0, 0.96, ruv.x) * smoothstep(0.0, 0.04, ruv.y) * smoothstep(1.0, 0.96, ruv.y);
    outgoingLight += refl * uStrength * (1.0 - rough) * mix(0.3, 1.0, fres) * edge;
  }
  #include <opaque_fragment>`,
        );
    };
    mat.needsUpdate = true;
  }
}
