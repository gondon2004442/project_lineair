/**
 * Трёхмерный рендер. Тот же договор, что у плоского: читает World и alpha
 * между шагами, ничего в мире не меняет.
 *
 * Вид сверху сохранён: камера стоит над помещением под крутым углом и
 * держит его целиком, как плоский кадр. Изменилось то, чем кадр собран —
 * объём, материалы, один жёсткий ключевой свет с тенями, лампы с лучами в
 * пыльном воздухе и затенение в углах. Это уже не пиксели, а помещение.
 */
import { Ticker } from 'pixi.js';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Reflection } from './reflect';
import type { World } from '../ecs';
import type { Renderer } from '../renderer';
import { PALETTE } from '../palette';
import { countDrawCalls, profiler } from '../profiler';
import { makeRng } from '../rng';
import { floorAt } from '../data/floors';
import { statAt } from '../weapon';
import { STEP, TUNING } from '../tuning';
import { Actors } from './actors';
import { QuadBatch } from './batch';
import { beamMaterial } from './beam';
import { createMaterials } from './materials';
import { createPost } from './post';
import { buildRoom, type RoomView } from './room';

const U = 1 / TUNING.room.tile;
const LIGHTS = 8;
/** Слой субъекта: его рисуют второй раз поверх пересчёта красного. */
const SUBJECT_LAYER = 1;

export async function createRenderer3D(host: HTMLElement): Promise<Renderer> {
  const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  RectAreaLightUniformsLib.init();
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = ACESFilmicToneMapping;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = PCFShadowMap;
  gl.shadowMap.autoUpdate = false;
  // Очистка идёт мимо перевода в линейный цвет: чёрный задаётся нулём,
  // иначе тональная кривая поднимала его до серого.
  gl.setClearColor(0x000000, 1);
  host.appendChild(gl.domElement);
  countDrawCalls(gl.getContext() as WebGL2RenderingContext, profiler);

  const ticker = new Ticker();
  ticker.start();

  const m = createMaterials();
  const scene = new Scene();
  const overlay = new Scene();
  const pmrem = new PMREMGenerator(gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = TUNING.view3d.env;
  scene.fog = new FogExp2(0x030405, TUNING.view3d.fog);

  const camera = new PerspectiveCamera(TUNING.view3d.fov, 1, 1, 400);
  camera.layers.enable(SUBJECT_LAYER);
  const subjectCam = camera.clone();
  subjectCam.layers.set(SUBJECT_LAYER);

  // --- Свет -------------------------------------------------------------------
  const hemi = new HemisphereLight(0x9aa4ae, 0x17191c, TUNING.view3d.ambient);
  const key = new DirectionalLight(TUNING.view3d.keyColor, TUNING.view3d.key);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  const sc = key.shadow.camera;
  sc.left = -21;
  sc.right = 21;
  sc.top = 21;
  sc.bottom = -21;
  sc.near = 1;
  sc.far = 120;
  scene.add(hemi, key, key.target);
  const pool: PointLight[] = [];
  for (let i = 0; i < LIGHTS; i++) {
    const light = new PointLight(0xffffff, 0, 10, 2);
    scene.add(light);
    pool.push(light);
  }
  for (const l of [hemi, key, ...pool]) l.layers.enableAll();

  // --- Воздух: косой луч ключевого света и пыль ---------------------------------
  const keyBeamMat = beamMaterial(TUNING.view3d.keyColor, TUNING.view3d.keyBeam);
  const keyBeam = new Mesh(new CylinderGeometry(2.6, 3.4, 30, 4, 1, true), keyBeamMat);
  keyBeam.renderOrder = 5;
  scene.add(keyBeam);

  const dustCount = Math.max(0, Math.round(TUNING.fx.dustCount * 6));
  const dustRng = makeRng(0x0f1e2d3c);
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  const roomW = TUNING.room.cols + TUNING.room.wall * 2;
  const roomD = TUNING.room.rows + TUNING.room.wall * 2;
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = dustRng.range(1, roomW - 1);
    dustPos[i * 3 + 1] = dustRng.range(0.2, 4.5);
    dustPos[i * 3 + 2] = dustRng.range(1, roomD - 1);
    dustSeed[i] = dustRng.range(0, 1000);
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  const dust = new Points(
    dustGeo,
    new PointsMaterial({
      color: PALETTE.concrete300,
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      map: m.glow,
    }),
  );
  dust.frustumCulled = false;
  scene.add(dust);

  // --- Пачки ------------------------------------------------------------------
  const decalMat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const glowMat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    map: m.glow,
    toneMapped: false,
  });
  const svcMat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    side: 2,
  });
  const decal = new QuadBatch(4096, decalMat);
  const glow = new QuadBatch(4096, glowMat);
  const svc = new QuadBatch(8192, svcMat);
  decal.mesh.renderOrder = 2;
  glow.mesh.renderOrder = 6;
  scene.add(decal.mesh, glow.mesh);
  overlay.add(svc.mesh);

  const actors = new Actors(m);
  scene.add(actors.group);

  const aoHidden: Object3D[] = [keyBeam, dust, decal.mesh, glow.mesh];
  const aoBase = aoHidden.length;
  const post = createPost(gl, scene, camera, aoHidden);
  const reflection = new Reflection(gl, m);

  // --- Состояние кадра ----------------------------------------------------------
  let room: RoomView | null = null;
  let roomKey = '';
  let lastWorld: World | null = null;
  let hissNow = 0;
  let shakeTick = -1;
  let shakeX = 0;
  let shakeZ = 0;
  const fxRng = makeRng(1);
  let time = 0;
  const base = new Vector3();
  const look = new Vector3();
  const camRight = new Vector3();
  const camUp = new Vector3();
  const ray = new Raycaster();
  const ndc = new Vector2();
  const aimPlane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const tmp = new Vector3();
  const quat = new Quaternion();

  /**
   * Поставить камеру так, чтобы всё помещение, включая верх дальней
   * стены, влезало в кадр. Расстояние ищется делением пополам, центровка —
   * сдвигом объектива, чтобы перспектива не перекашивалась.
   */
  function fit(): void {
    const v = TUNING.view3d;
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    camera.fov = v.fov;
    camera.aspect = width / height;
    const pitch = (v.pitch * Math.PI) / 180;
    const dir = new Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
    base.set(roomW / 2, 0, roomD / 2);
    const pts = [
      new Vector3(0, 0, 0),
      new Vector3(roomW, 0, 0),
      new Vector3(0, 0, roomD),
      new Vector3(roomW, 0, roomD),
      new Vector3(0, v.wallHeight, 0),
      new Vector3(roomW, v.wallHeight, 0),
      new Vector3(0, v.southWallHeight, roomD),
      new Vector3(roomW, v.southWallHeight, roomD),
    ];
    const place = (dist: number): { w: number; h: number; cx: number; cy: number } => {
      camera.position.copy(base).addScaledVector(dir, -dist);
      camera.lookAt(base);
      camera.near = Math.max(0.5, dist * 0.2);
      camera.far = dist * 3 + 50;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        tmp.copy(p).project(camera);
        x0 = Math.min(x0, tmp.x);
        x1 = Math.max(x1, tmp.x);
        y0 = Math.min(y0, tmp.y);
        y1 = Math.max(y1, tmp.y);
      }
      return { w: (x1 - x0) / 2, h: (y1 - y0) / 2, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    let lo = 5;
    let hi = 600;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const r = place(mid);
      if (Math.max(r.w, r.h) * v.margin > 1) lo = mid;
      else hi = mid;
    }
    const r = place(hi);
    // Сдвиг объектива: кадр по центру без поворота камеры.
    camera.projectionMatrix.elements[8] = r.cx;
    camera.projectionMatrix.elements[9] = r.cy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    look.copy(camera.position);
  }

  function layout(): void {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    gl.setSize(width, height);
    post.setSize(width, height);
    fit();
  }

  function rebuildRoom(w: World): void {
    if (room !== null) {
      room.group.removeFromParent();
      room.fx.removeFromParent();
      room.dispose();
    }
    room = buildRoom(w, m);
    scene.add(room.group, room.fx);
    aoHidden.length = aoBase;
    aoHidden.push(room.fx, ...room.aoHidden);
    reflection.setFloors(room.floors);
    for (const lamp of room.lamps) lamp.beam.renderOrder = 5;
  }

  const renderer: Renderer = {
    app: { canvas: gl.domElement, ticker },
    showHitboxes: TUNING.debug.hitboxes,

    screenToWorld(sx, sy) {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      aimPlane.constant = -TUNING.view3d.shotHeight * 0.6;
      if (ray.ray.intersectPlane(aimPlane, hit) === null) return { x: 0, y: 0 };
      return { x: hit.x / U, y: hit.z / U };
    },

    layout,

    draw(w, alpha) {
      const v = TUNING.view3d;
      const frame = ticker.deltaMS / 1000;
      time += frame;

      profiler.begin('КАДР: ТАЙЛМАП');
      if (w !== lastWorld) {
        lastWorld = w;
        actors.clear();
      }
      const signed = w.seals.includes(w.depth);
      const keyNow = [w.mapToken, w.room, w.scene, w.depth, signed, v.wallHeight, v.innerWallHeight, v.southWallHeight, v.doorHeight].join('|');
      if (keyNow !== roomKey) {
        roomKey = keyNow;
        rebuildRoom(w);
        fit();
      }
      profiler.end('КАДР: ТАЙЛМАП');

      // Красное состояние ведётся к цели ровно, как в плоском виде.
      const want = Math.max(0, Math.min(1, w.fx.hiss)) * TUNING.hiss.amount;
      const rate = TUNING.hiss.fadeIn <= 0 ? 1 : frame / TUNING.hiss.fadeIn;
      hissNow += Math.max(-rate, Math.min(rate, want - hissNow));
      if (Math.abs(want - hissNow) < 0.001) hissNow = want;
      const hissOn = hissNow > 0;
      const dark = floorAt(w.depth).distortion === 'dark' && w.scene === 'run';

      // Камера: тряска раз в шаг симуляции и лёгкое ведение за прицелом.
      if (w.tick !== shakeTick) {
        shakeTick = w.tick;
        shakeX = fxRng.spread(1);
        shakeZ = fxRng.spread(1);
      }
      const pt = w.transform.get(w.player);
      const player = w.playerC.get(w.player);
      const px = pt === undefined ? roomW / 2 : (pt.px + (pt.x - pt.px) * alpha) * U;
      const pz = pt === undefined ? roomD / 2 : (pt.py + (pt.y - pt.py) * alpha) * U;
      const lead = v.lookahead;
      const lx = pt === undefined ? 0 : (px - roomW / 2) * lead + (player?.aimX ?? 0) * lead * 6;
      const lz = pt === undefined ? 0 : (pz - roomD / 2) * lead + (player?.aimY ?? 0) * lead * 6;
      const shake = w.fx.shake * U;
      camera.position.set(look.x + lx + shakeX * shake, look.y, look.z + lz + shakeZ * shake);
      camera.updateMatrixWorld();
      subjectCam.position.copy(camera.position);
      subjectCam.quaternion.copy(camera.quaternion);
      subjectCam.projectionMatrix.copy(camera.projectionMatrix);
      subjectCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      subjectCam.updateMatrixWorld();
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

      // --- Свет -----------------------------------------------------------------
      const az = (v.keyAzimuth * Math.PI) / 180;
      const el = (v.keyElevation * Math.PI) / 180;
      const toLight = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      key.target.position.set(roomW / 2, 0, roomD / 2);
      key.position.copy(key.target.position).addScaledVector(toLight, 60);
      const dim = dark ? 1 - TUNING.dark.alpha : 1;
      key.intensity = v.key * dim;
      key.color.setHex(v.keyColor);
      hemi.intensity = v.ambient * (dark ? 0.08 : 1);
      scene.environmentIntensity = v.env * (dark ? 0.15 : 1);
      gl.toneMappingExposure = v.exposure;
      // Помещение со своим светом: солнце в окна вместо общего ключевого.
      const own = room?.look?.();
      if (own !== undefined) {
        const saz = (own.sun.az * Math.PI) / 180;
        const sel = (own.sun.el * Math.PI) / 180;
        toLight.set(Math.sin(saz) * Math.cos(sel), Math.sin(sel), -Math.cos(saz) * Math.cos(sel));
        key.position.copy(key.target.position).addScaledVector(toLight, 60);
        key.intensity = own.sun.intensity;
        key.color.setHex(own.sun.color);
        hemi.intensity = own.sky;
        scene.environmentIntensity = own.env;
        gl.toneMappingExposure = own.exposure;
      }
      room?.tick?.(time);
      (scene.fog as FogExp2).density = v.fog;

      // Косой луч ключевого света: столб из-за левого верхнего угла на пол.
      const floorHit = new Vector3(roomW * 0.32, 0, roomD * 0.58);
      keyBeam.position.copy(floorHit).addScaledVector(toLight, 15);
      quat.setFromUnitVectors(new Vector3(0, 1, 0), toLight);
      keyBeam.quaternion.copy(quat);
      keyBeamMat.uniforms['uIntensity']!.value = v.keyBeam * dim;
      keyBeamMat.uniforms['uTime']!.value = time;
      keyBeam.visible = v.keyBeam > 0 && !dark && own === undefined;

      // Пул точечного света.
      let slot = 0;
      const use = (x: number, y: number, z: number, color: number, intensity: number, distance: number): void => {
        const l = pool[slot++];
        if (l === undefined) return;
        l.position.set(x, y, z);
        l.color.setHex(color);
        l.intensity = intensity;
        l.distance = distance;
      };
      const skin = hissOn ? TUNING.hiss.subject : PALETTE.red;
      if (pt !== undefined && w.status !== 'dead') {
        use(px, 0.9, pz, skin, v.playerGlow * (hissOn ? 0.4 : 1), 5);
        if (dark) use(px, 2.2, pz, 0xe8ecef, v.darkLight, statAt(w, 'dark.player') * U * 2.2);
      }
      if (w.fx.shotTime > 0) {
        const k = Math.max(0, w.fx.shotTime - alpha * STEP) / Math.max(1e-6, TUNING.dark.shotTime);
        use(w.fx.shotX * U, TUNING.view3d.shotHeight, w.fx.shotY * U, 0xffe2b8, (dark ? 60 : 14) * k, dark ? TUNING.dark.shot * U * 1.5 : 6);
      }
      for (const section of w.sections) {
        if (!section.lit) continue;
        use(section.x * U, 1.2, section.y * U, PALETTE.yellow, 18, TUNING.keeper.sectionLight * U * 2);
      }
      const nowS = performance.now() / 1000;
      if (room !== null) {
        room.lamps.forEach((lamp, i) => {
          const on = dark ? lamp.darkLit : true;
          const fl = lamp.flicker ? flickerAlpha(nowS, i) : 1;
          const k = on ? fl : 0;
          lamp.beam.visible = k > 0 && v.lampBeam > 0;
          const bm = lamp.beam.material as unknown as { uniforms: Record<string, { value: number }> };
          if (bm.uniforms['uIntensity'] !== undefined) bm.uniforms['uIntensity'].value = v.lampBeam * k;
          if (bm.uniforms['uTime'] !== undefined) bm.uniforms['uTime'].value = time;
          (lamp.pool.material as MeshBasicMaterial).opacity = 0.09 * k;
          if (k > 0) use(lamp.x, v.wallHeight + 0.8, lamp.z, 0xe4ecf4, v.lampIntensity * k, 14);
        });
      }
      for (; slot < pool.length; slot++) {
        const l = pool[slot];
        if (l !== undefined) l.intensity = 0;
      }

      // Пыль медленно оседает и плывёт.
      const pos = dustGeo.getAttribute('position') as BufferAttribute;
      const fall = TUNING.fx.dustSpeed * U * frame * 0.3;
      for (let i = 0; i < dustCount; i++) {
        const seed = dustSeed[i] ?? 0;
        let y = pos.getY(i) - fall * (0.4 + (seed % 1));
        if (y < 0.05) y += 4.5;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.4 + seed) * 0.002);
      }
      pos.needsUpdate = true;
      (dust.material as PointsMaterial).opacity = TUNING.fx.dustAlpha * 3 * (dark ? 0.3 : 1);

      // --- Сущности и служебное ---------------------------------------------------
      profiler.begin('КАДР: СУЩНОСТИ');
      decal.begin();
      glow.begin();
      svc.begin();
      glow.right.copy(camRight);
      glow.up.copy(camUp);
      actors.sync(w, {
        alpha,
        time: w.tick * STEP,
        skin,
        hiss: hissOn,
        dark,
        showHitboxes: renderer.showHitboxes,
        camRight,
        camUp,
      }, { decal, glow, svc });
      decal.end();
      glow.end();
      svc.end();
      if (actors.playerRoot !== null) actors.playerRoot.traverse((o) => o.layers.enable(SUBJECT_LAYER));
      profiler.end('КАДР: СУЩНОСТИ');

      // --- Последний проход ---------------------------------------------------------
      const u = post.final.uniforms as Record<string, { value: unknown }>;
      const width = gl.domElement.clientWidth || 1;
      const height = gl.domElement.clientHeight || 1;
      const aspect = width / height;
      const toUv = (x: number, z: number): Vector3 => new Vector3(x, 0, z).project(camera);
      const radiusH = (x: number, z: number, r: number): number => {
        const a = toUv(x, z);
        const b2 = toUv(x + r, z);
        return (Math.abs(b2.x - a.x) / 2) * aspect;
      };
      const warpA = u['uWarpA']!.value as { set(x: number, y: number, z: number, w: number): void };
      const warpB = u['uWarpB']!.value as { set(x: number, y: number, z: number, w: number): void };
      const warpW = u['uWarpWidth']!.value as Vector2;
      warpA.set(0.5, 0.5, 0, 0);
      warpB.set(0.5, 0.5, 0, 0);
      const blankLeft = Math.max(0, w.fx.blankTime - alpha * STEP);
      if (blankLeft > 0 && TUNING.blank.warpPower > 0) {
        const full = TUNING.blank.ringTime;
        const grown = full <= 0 ? 1 : 1 - blankLeft / full;
        const c = toUv(w.fx.blankX * U, w.fx.blankY * U);
        warpA.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5, radiusH(w.fx.blankX * U, w.fx.blankY * U, TUNING.blank.cancelRadius * grown * U), TUNING.blank.warpPower * (1 - grown * grown * grown));
      }
      const tk = TUNING.telekinesis;
      const heldNow = player?.held ?? -1;
      const heldAt = heldNow >= 0 ? w.transform.get(heldNow) : undefined;
      if (heldAt !== undefined && tk.holdWarp > 0) {
        const c = toUv((heldAt.px + (heldAt.x - heldAt.px) * alpha) * U, (heldAt.py + (heldAt.y - heldAt.py) * alpha) * U);
        warpB.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5, tk.holdRadius, tk.holdWarp);
      } else if (w.fx.warpTime - alpha * STEP > 0 && w.fx.warpPower > 0) {
        const left = Math.max(0, w.fx.warpTime - alpha * STEP);
        const done = tk.warpTime <= 0 ? 1 : 1 - left / tk.warpTime;
        const c = toUv(w.fx.warpX * U, w.fx.warpY * U);
        warpB.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5, tk.warpRadius * done, w.fx.warpPower * (1 - done));
      }
      warpW.set(TUNING.blank.warpWidth, tk.warpWidth);
      u['uAspect']!.value = aspect;
      u['uAmount']!.value = TUNING.fx.aberration;
      u['uHiss']!.value = hissNow;
      u['uGamma']!.value = TUNING.hiss.gamma;
      (u['uDeep']!.value as Color).setHex(TUNING.hiss.deep).convertLinearToSRGB();
      (u['uHot']!.value as Color).setHex(TUNING.hiss.hot).convertLinearToSRGB();
      u['uVignette']!.value = v.vignette;
      u['uGrain']!.value = v.grain;
      u['uTime']!.value = time;
      u['uFlash']!.value = w.fx.hitstop > 0 ? TUNING.fx.hitstopFlash : 0;
      (u['uFlashColor']!.value as Color).setHex(PALETTE.concrete300).convertLinearToSRGB();

      post.ao.enabled = v.ao > 0;
      post.ao.updateGtaoMaterial({ radius: v.aoRadius, scale: 1, thickness: 1 });
      post.bloom.strength = v.bloomStrength;
      post.bloom.radius = v.bloomRadius;
      post.bloom.threshold = v.bloomThreshold;

      profiler.begin('КАДР: СЦЕНА');
      gl.shadowMap.needsUpdate = true;
      post.composer.render(frame);
      // Отражение пола снимается после кадра, на готовых тенях, и идёт в
      // следующий: запаздывание на кадр глазу не видно, а тени не считаются дважды.
      reflection.render(scene, camera, v.reflect, [decal.mesh, glow.mesh, dust, keyBeam, ...(room?.fx.children ?? [])]);
      // Поверх пересчёта: субъект и служебный слой. Субъект в заседании не
      // пересчитан, а подменён; жёлтое остаётся жёлтым.
      gl.autoClear = false;
      gl.clearDepth();
      if (actors.playerRoot !== null && actors.playerRoot.visible) {
        const fog = scene.fog;
        scene.fog = null;
        gl.render(scene, subjectCam);
        scene.fog = fog;
      }
      gl.clearDepth();
      gl.render(overlay, camera);
      gl.autoClear = true;
      profiler.end('КАДР: СЦЕНА');
    },
  };

  // Отладочная ручка: стенд и консоль добираются до сцены и проходов.
  Object.defineProperty(window, 'lineair3d', { value: { gl, scene, camera, post }, configurable: true });

  return renderer;
}

/** Мигание ламп по реальному времени: хеш от номера отрезка, без состояния. */
function flickerAlpha(time: number, seed: number): number {
  const cfg = TUNING.render;
  const rate = Math.max(0, cfg.lampFlickerRate);
  if (rate <= 0) return 1;
  const step = Math.floor(time * rate) + seed * 977;
  const noise = Math.sin(step * 12.9898) * 43758.5453;
  const value = noise - Math.floor(noise);
  return value < cfg.lampFlickerDrop ? cfg.lampFlickerLow : 1;
}
