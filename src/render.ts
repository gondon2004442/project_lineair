/**
 * Рендер. Отвязан от логики: читает World и alpha между шагами,
 * ничего в мире не меняет. Собственный PRNG для тряски,
 * чтобы визуал не съедал случайность симуляции.
 */
import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import type { World } from './ecs';
import { createAberration, createDust, drawSmoke, type WarpSource } from './fx';
import { PALETTE } from './palette';
import { makeRng } from './rng';
import { countDrawCalls, profiler } from './profiler';
import { vacancyCount } from './systems/staff';
import { pendingItems } from './systems/postAuditor';
import { stashInReach } from './systems/issue';
import { counterInReach } from './systems/counter';
import { COUNTERS_BY_KIND } from './data/counters';
import { grabCandidate } from './systems/telekinesis';
import { TILE_DOOR, TILE_GATE, TILE_WALL, TILE_WEAK, type TileMap } from './room';
import { ROOM_HEIGHT, ROOM_WIDTH, STEP, TUNING } from './tuning';

export interface Renderer {
  app: Application;
  showHitboxes: boolean;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  layout(): void;
  draw(w: World, alpha: number): void;
}

export async function createRenderer(host: HTMLElement): Promise<Renderer> {
  const app = new Application();
  await app.init({
    background: PALETTE.black,
    antialias: false,
    resizeTo: host,
    roundPixels: true,
    // Аберрация написана на GLSL, поэтому просим именно WebGL.
    preference: 'webgl',
  });
  host.appendChild(app.canvas);

  // Считаем настоящие вызовы отрисовки, а не расспрашиваем Pixi.
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  if (gl !== undefined) countDrawCalls(gl, profiler);

  const root = new Container();
  const shakeLayer = new Container();
  const roomLayer = new Graphics();
  const dustLayer = new Graphics();
  const smokeLayer = new Graphics();
  const entityLayer = new Graphics();
  const debugLayer = new Graphics();

  // Свечение: те же красные силуэты, только размытые и сложенные поверх.
  const glowLayer = new Graphics();
  const bloom = new BlurFilter({
    strength: TUNING.fx.bloomBlur,
    quality: Math.max(1, Math.round(TUNING.fx.bloomQuality)),
  });
  glowLayer.filters = [bloom];
  glowLayer.blendMode = 'add';

  // Свечение идёт ПОД сущностями. Сверху оно складывалось с телами и
  // красило их в бордовый: сотрудник переставал быть бетонным, а красный
  // переставал принадлежать субъекту. Снизу ореол остаётся ореолом.
  shakeLayer.addChild(roomLayer, dustLayer, smokeLayer, glowLayer, entityLayer, debugLayer);
  root.addChild(shakeLayer);
  app.stage.addChild(root);

  // Вспышка стоп-кадра живёт в экранных координатах, её тряска не касается.
  const flashLayer = new Graphics();
  app.stage.addChild(flashLayer);
  // Область фильтра прибита к экрану. Без этого Pixi берёт её по границам
  // содержимого сцены, координаты внутри шейдера съезжают вместе с ними,
  // и волна вспыхивает не там, где её позвали.
  app.stage.filterArea = app.screen;

  const aberration = createAberration();
  let aberrationOn = TUNING.fx.aberration > 0;
  let shakeTick = -1;
  let shakeX = 0;
  let shakeY = 0;
  if (aberrationOn) app.stage.filters = [aberration.filter];

  const dust = createDust();
  const fxRng = makeRng(1);
  let fxTime = 0;
  // Бетон перерисовывается только когда карта сменилась или щёлкнул замок.
  let drawnToken = -1;

  const renderer: Renderer = {
    app,
    showHitboxes: TUNING.debug.hitboxes,

    screenToWorld(sx, sy) {
      const rect = app.canvas.getBoundingClientRect();
      return {
        x: (sx - rect.left - root.x) / root.scale.x,
        y: (sy - rect.top - root.y) / root.scale.y,
      };
    },

    layout() {
      // Контейнер мог сузиться: панель крутилок отъедает правый край.
      app.resize();
      app.stage.filterArea = app.screen;
      const scale = Math.min(app.screen.width / ROOM_WIDTH, app.screen.height / ROOM_HEIGHT);
      root.scale.set(scale);
      root.position.set(
        Math.round((app.screen.width - ROOM_WIDTH * scale) / 2),
        Math.round((app.screen.height - ROOM_HEIGHT * scale) / 2),
      );
    },

    draw(w, alpha) {
      profiler.begin('КАДР: ТАЙЛМАП');
      if (w.mapToken !== drawnToken) {
        drawnToken = w.mapToken;
        drawRoom(roomLayer, w.map);
      }
      profiler.end('КАДР: ТАЙЛМАП');

      const frame = app.ticker.deltaMS / 1000;
      fxTime += frame;

      // Тряска переставляется раз в шаг симуляции, а не раз в кадр. На
      // быстром мониторе кадров втрое больше шагов, и случайный сдвиг
      // каждый кадр превращал тряску в мелкую рябь: картинка дрожала
      // чаще, чем что-либо в ней двигалось.
      if (w.tick !== shakeTick) {
        shakeTick = w.tick;
        shakeX = fxRng.spread(1);
        shakeY = fxRng.spread(1);
      }
      const shake = w.fx.shake;
      shakeLayer.position.set(shakeX * shake, shakeY * shake);

      profiler.begin('КАДР: ПЫЛЬ');
      dust.update(frame);
      dustLayer.clear();
      dust.draw(dustLayer);
      profiler.end('КАДР: ПЫЛЬ');

      profiler.begin('КАДР: ДЫМ');
      smokeLayer.clear();
      drawSmoke(smokeLayer, w, fxTime);
      drawBlankRing(smokeLayer, w, alpha);
      profiler.end('КАДР: ДЫМ');

      entityLayer.clear();
      drawEntities(entityLayer, w, alpha);

      // Свечение и аберрация на нуле снимаются целиком: слабой машине
      // важно, чтобы выключенный эффект ничего не стоил.
      profiler.begin('КАДР: СВЕЧЕНИЕ');
      glowLayer.visible = TUNING.fx.bloomAlpha > 0;
      if (glowLayer.visible) {
        glowLayer.clear();
        drawGlow(glowLayer, w, alpha);
        glowLayer.alpha = TUNING.fx.bloomAlpha;
        bloom.strength = TUNING.fx.bloomBlur;
      }
      profiler.end('КАДР: СВЕЧЕНИЕ');

      // Искажение пространства. Считается в экранных долях: фильтр висит
      // на всей сцене и про мир ничего не знает.
      const scale = root.scale.x;
      const toScreen = (wx: number, wy: number): { x: number; y: number } => ({
        x: (root.x + wx * scale) / app.screen.width,
        y: (root.y + wy * scale) / app.screen.height,
      });
      const perHeight = scale / app.screen.height;

      let warpA: WarpSource | null = null;
      const blankLeft = fxLeft(w.fx.blankTime, alpha);
      if (blankLeft > 0 && TUNING.blank.warpPower > 0) {
        const full = TUNING.blank.ringTime;
        const grown = full <= 0 ? 1 : 1 - blankLeft / full;
        const at = toScreen(w.fx.blankX, w.fx.blankY);
        warpA = {
          x: at.x,
          y: at.y,
          radius: TUNING.blank.cancelRadius * grown * perHeight,
          power: TUNING.blank.warpPower * (1 - grown * grown * grown),
          width: TUNING.blank.warpWidth,
        };
      }

      let warpB: WarpSource | null = null;
      const tk = TUNING.telekinesis;
      const heldNow = w.playerC.get(w.player)?.held ?? -1;
      const heldAt = heldNow >= 0 ? w.transform.get(heldNow) : undefined;
      if (heldAt !== undefined && tk.holdWarp > 0) {
        const at = toScreen(lerp(heldAt.px, heldAt.x, alpha), lerp(heldAt.py, heldAt.y, alpha));
        warpB = {
          x: at.x,
          y: at.y,
          radius: tk.holdRadius,
          power: tk.holdWarp,
          width: tk.warpWidth,
        };
      } else if (fxLeft(w.fx.warpTime, alpha) > 0 && w.fx.warpPower > 0) {
        const done = tk.warpTime <= 0 ? 1 : 1 - fxLeft(w.fx.warpTime, alpha) / tk.warpTime;
        const at = toScreen(w.fx.warpX, w.fx.warpY);
        warpB = {
          x: at.x,
          y: at.y,
          radius: tk.warpRadius * done,
          power: w.fx.warpPower * (1 - done),
          width: tk.warpWidth,
        };
      }

      // Фильтр нужен, даже если общая аберрация выкручена в ноль: волна
      // живёт в том же шейдере.
      const wantAberration = TUNING.fx.aberration > 0 || warpA !== null || warpB !== null;
      if (wantAberration !== aberrationOn) {
        aberrationOn = wantAberration;
        app.stage.filters = wantAberration ? [aberration.filter] : [];
      }
      if (wantAberration) {
        aberration.setAmount(TUNING.fx.aberration);
        aberration.setWarp(warpA, warpB, app.screen.width / app.screen.height);
      }

      flashLayer.clear();
      if (w.fx.hitstop > 0 && TUNING.fx.hitstopFlash > 0) {
        flashLayer
          .rect(0, 0, app.screen.width, app.screen.height)
          .fill({ color: PALETTE.concrete300, alpha: TUNING.fx.hitstopFlash });
      }

      profiler.begin('КАДР: ХИТБОКСЫ');
      debugLayer.clear();
      if (renderer.showHitboxes) drawHitboxes(debugLayer, w, alpha);
      profiler.end('КАДР: ХИТБОКСЫ');
    },
  };

  return renderer;
}

/**
 * Помещение. Перерисовывается только при смене карты.
 *
 * Вид сверху офисного кита: ковролин со швами, стены с ореховой панелью,
 * обращённой в комнату, и латунным профилем над ней, стеклянные
 * перегородки вместо разрушаемого бетона, жёлтая разметка у проёмов.
 */
function drawRoom(g: Graphics, map: TileMap): void {
  g.clear();
  const size = map.size;
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const x = cx * size;
      const y = cy * size;
      const tile = map.tiles[cy * map.cols + cx];

      if (tile === TILE_WALL) {
        drawPanelledWall(g, map, cx, cy, x, y, size);
        continue;
      }
      if (tile === TILE_WEAK) {
        drawGlassPartition(g, map, cx, cy, x, y, size);
        continue;
      }
      if (tile === TILE_GATE) {
        // Проём: в полу нет пола. Провал в служебной рамке.
        const inset = TUNING.render.gateInset;
        g.rect(x, y, size, size).fill(PALETTE.black);
        g.rect(x + inset, y + inset, size - inset * 2, size - inset * 2).stroke({
          width: TUNING.render.gateWidth,
          color: PALETTE.yellow,
          alpha: 0.6,
        });
        continue;
      }

      // Пол: плитка и шов по краю. Пол светлее стен — на светлом полу
      // тёмный силуэт читается, а не тонет.
      g.rect(x, y, size, size).fill(PALETTE.floor);
      g.rect(x, y, size, TUNING.render.floorGrid)
        .rect(x, y, TUNING.render.floorGrid, size)
        .fill(PALETTE.floorSeam);

      if (tile !== TILE_DOOR) continue;
      drawDoorway(g, map, cx, cy, x, y, size);
    }
  }
}

/**
 * Поза субъекта: во сколько раз растянуто тело, на сколько поднято и
 * насколько сжата под ним тень.
 */
interface Pose {
  hx: number;
  hy: number;
  dx: number;
  dy: number;
  shadow: number;
}

// Пройденный путь копится на стороне отрисовки: шаг — это картинка, и
// в симуляции его быть не должно, иначе он попадёт в детерминизм.
let walkDist = 0;
let walkLastX = 0;
let walkLastY = 0;
let walkSeen = false;

/**
 * Куб не умеет переставлять ноги, поэтому шаг сделан тем, что у куба
 * есть: четыре кадра меняют ширину, высоту, подъём и перенос веса
 * вбок. Кадры дискретные, без интерполяции, — это ритм, а не
 * колебание. Цикл считается по пройденному пути, а не по времени:
 * иначе на замедлении и на разгоне ноги едут отдельно от пола.
 */
function playerPose(w: World, x: number, y: number): Pose {
  const cfg = TUNING.render;
  const player = w.playerC.get(w.player);
  const draw = w.drawC.get(w.player);
  const body = w.body.get(w.player);
  const half = draw === undefined ? 0 : draw.size * cfg.playerSizeFactor;
  const pose: Pose = { hx: half, hy: half, dx: 0, dy: 0, shadow: 1 };
  if (player === undefined) return pose;

  const step = walkSeen ? Math.hypot(x - walkLastX, y - walkLastY) : 0;
  walkLastX = x;
  walkLastY = y;
  walkSeen = true;
  if (step < cfg.walkJumpCut) walkDist += step;

  if (player.phase === 'dash') {
    // Растяжение по оси рывка и сжатие поперёк: тело то же, а скорость
    // читается с одного кадра.
    const k = cfg.dashStretch - 1;
    const inv = 1 - 1 / cfg.dashStretch;
    const ax = Math.abs(player.dashX);
    const ay = Math.abs(player.dashY);
    pose.hx = half * (1 + k * ax - inv * ay);
    pose.hy = half * (1 + k * ay - inv * ax);
    pose.shadow = cfg.contactDashScale;
    return pose;
  }

  const vx = body === undefined ? 0 : body.vx;
  const vy = body === undefined ? 0 : body.vy;
  const speed = Math.hypot(vx, vy);

  if (speed < cfg.walkMinSpeed) {
    // Стоит: два кадра дыхания, полный цикл idleBreathTime.
    const beat = Math.max(1e-6, cfg.idleBreathTime) / 2;
    if (Math.floor((w.tick * STEP) / beat) % 2 === 1) {
      pose.hx = half * (1 - cfg.idleBreath);
      pose.hy = half * (1 + cfg.idleBreath);
      // Низ остаётся на месте: дышит грудь, а не подошвы.
      pose.dy = -half * cfg.idleBreath;
    }
    return pose;
  }

  const frames = Math.max(1, Math.round(cfg.walkFrames));
  const stride = Math.max(1e-6, cfg.walkStride);

  // Фаза цикла непрерывная, и между ключами поза перетекает. Ключей
  // по-прежнему четыре, но щелчка между ними больше нет: при шаге
  // 290 px/с ключ держится несколько кадров, и дискретная смена
  // читалась не как походка, а как тряска.
  const phase = (walkDist / stride) * frames;
  const key = Math.floor(phase);
  const t01 = phase - key;
  // Сглаживание на входе и выходе ключа: линейная склейка оставляет на
  // самом ключе излом, и его видно.
  const ease = t01 * t01 * (3 - 2 * t01);
  const a = ((key % frames) + frames) % frames;
  const b = (a + 1) % frames;

  // Размах набирается с разгоном: иначе поза прыгает в полный размер на
  // первом же кадре движения и обратно на последнем.
  const amp = Math.min(1, Math.max(0, (speed - cfg.walkMinSpeed) / Math.max(1e-6, cfg.walkEase)));

  // Опорный ключ: тело ниже и шире, вес на ноге. Проходной: тело выше,
  // уже и оторвано от пола. Одна формула на оба — знак решает.
  const squash = mix(WALK_SQUASH[a], WALK_SQUASH[b], ease) * cfg.walkSquash * amp;
  const lift = mix(WALK_LIFT[a], WALK_LIFT[b], ease) * cfg.walkBob * amp;
  const shift = mix(WALK_SHIFT[a], WALK_SHIFT[b], ease) * cfg.walkLean * amp;

  pose.hx = half * (1 + squash);
  pose.hy = half * (1 - squash);
  // Низ остаётся на полу: при сжатии тело оседает ровно на столько, на
  // сколько потеряло в высоте.
  pose.dy = half * squash - lift;
  // Вбок — это поперёк хода: сверху «вбок» зависит от того, куда идёшь.
  pose.dx = (-vy / speed) * shift;
  pose.dy += (vx / speed) * shift;
  pose.shadow = half <= 0 ? 1 : half / (half + Math.max(0, lift));
  return pose;
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Четыре ключа цикла: опора, проходной, другая опора, проходной.
 * Вес переносится с ноги на ногу, опорные ключи сплющивают тело,
 * проходные вытягивают и отрывают от пола.
 */
const WALK_SHIFT = [-1, -0.5, 1, 0.5];
const WALK_SQUASH = [1, -0.5, 1, -0.5];
const WALK_LIFT = [0, 1, 0, 1];

/**
 * Субъект. Единственное красное на экране и потому верхний слой:
 * что бы ни творилось на участке, себя видно всегда.
 */
function drawPlayer(g: Graphics, w: World, alpha: number): void {
  const player = w.playerC.get(w.player);
  const t = w.transform.get(w.player);
  const health = w.health.get(w.player);
  const draw = w.drawC.get(w.player);
  if (player === undefined || t === undefined || draw === undefined) return;

  const x = lerp(t.px, t.x, alpha);
  const y = lerp(t.py, t.y, alpha);
  const half = draw.size * TUNING.render.playerSizeFactor;
  const pose = playerPose(w, x, y);
  const cx = x + pose.dx;
  const cy = y + pose.dy;

  if (player.phase === 'dash') {
    const speed = TUNING.player.dashDistance / TUNING.player.dashDuration;
    for (let i = 1; i <= TUNING.render.dashTrail; i++) {
      const back = speed * TUNING.render.dashTrailStep * i;
      g.rect(
        cx - player.dashX * back - pose.hx,
        cy - player.dashY * back - pose.hy,
        pose.hx * 2,
        pose.hy * 2,
      ).fill({
        color: PALETTE.red,
        alpha: (1 - i / (TUNING.render.dashTrail + 1)) * TUNING.render.dashGhostAlpha,
      });
    }
  }

  // Контактная тень остаётся на полу и сжимается, когда тело оторвано:
  // иначе подъём читается как скольжение.
  contactShadow(g, x, y, half, pose.shadow);

  // Мигание объясняет неуязвимость после урона. На рывке она и так есть
  // и видна по растяжению со смазом, а мигание съедало субъекта целиком:
  // всю фазу рывка его в кадре не было. Поэтому мигает только остаток
  // окна сверх рывкового — то есть именно полученный урон.
  const blink =
    health !== undefined &&
    health.flash <= 0 &&
    health.iframes > TUNING.player.dashIFrames &&
    Math.floor(w.tick * STEP * TUNING.feel.blinkRate) % 2 === 0;
  if (!blink) {
    const color = health !== undefined && health.flash > 0 ? PALETTE.concrete100 : PALETTE.red;
    block(g, cx - pose.hx, cy - pose.hy, pose.hx * 2, pose.hy * 2, color);
    // Кант: красный тёмный, и без канта субъект на полу пропадает,
    // стоит убрать цвет. Контур — единственный в кадре, силуэт читается
    // формой, а не оттенком.
    g.rect(cx - pose.hx, cy - pose.hy, pose.hx * 2, pose.hy * 2).stroke({
      width: TUNING.render.playerRim,
      color: PALETTE.concrete100,
      alignment: 1,
    });
  }

  const ax = player.aimX;
  const ay = player.aimY;
  g.moveTo(cx + ax * half, cy + ay * half)
    .lineTo(cx + ax * TUNING.render.aimLength, cy + ay * TUNING.render.aimLength)
    .stroke({ width: TUNING.render.aimWidth, color: PALETTE.red });
}

/**
 * Кольцо аннулирования. Расходится от субъекта до радиуса бланка и гаснет,
 * так что радиус действия виден целиком, а не угадывается. Цвет светлый:
 * жёлтый принадлежит должностям, красный — субъекту.
 */
function drawBlankRing(g: Graphics, w: World, alpha: number): void {
  const left = fxLeft(w.fx.blankTime, alpha);
  if (left <= 0) return;
  const full = TUNING.blank.ringTime;
  const grown = full <= 0 ? 1 : 1 - left / full;
  // Гаснет не равномерно, а в самом конце: линейное затухание делало
  // кольцо ярким, пока оно крошечное, и невидимым, когда оно наконец
  // показывает радиус. Читать надо как раз последнее.
  const fade = 1 - grown * grown * grown;
  g.circle(w.fx.blankX, w.fx.blankY, TUNING.blank.cancelRadius * grown).stroke({
    width: TUNING.blank.ringWidth,
    color: PALETTE.concrete100,
    alpha: TUNING.blank.ringAlpha * fade,
  });
}

/** Стена: тёмный бетон, к комнате обращена светлая панель с кантом. */
function drawPanelledWall(
  g: Graphics,
  map: TileMap,
  cx: number,
  cy: number,
  x: number,
  y: number,
  size: number,
): void {
  // Сплошная заливка без выреза: соседние клетки стены сливаются в одну
  // массу, и сетки тайлов в стене не видно. Раньше у каждой клетки был
  // свой шов, и стена читалась как кладка из кубиков.
  g.rect(x, y, size, size).fill(PALETTE.wall);

  const band = TUNING.render.wainscotBand;
  const rail = TUNING.render.brassRail;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    if (facesConcrete(map, cx + dx, cy + dy)) continue;
    // Фаска рисуется только на грани, обращённой в комнату, поэтому на
    // соседних клетках она продолжает сама себя одной линией.
    const horizontal = dx === 0;
    const face = horizontal
      ? { x, y: dy < 0 ? y : y + size - band, w: size, h: band }
      : { x: dx < 0 ? x : x + size - band, y, w: band, h: size };
    g.rect(face.x, face.y, face.w, face.h).fill(PALETTE.concrete500);
    const edge = horizontal
      ? { x, y: dy < 0 ? y + band : y + size - band - rail, w: size, h: rail }
      : { x: dx < 0 ? x + band : x + size - band - rail, y, w: rail, h: size };
    g.rect(edge.x, edge.y, edge.w, edge.h).fill(PALETTE.concrete300);

    // Технологический шов опалубки: поперёк стены, раз в несколько
    // тайлов. Он и сообщает масштаб, который раньше сообщала сетка.
    const along = horizontal ? cx : cy;
    if (along % TUNING.render.wallJointStep !== 0) continue;
    const jw = TUNING.render.wallJointWidth;
    const depth = size * TUNING.render.wallJointDepth;
    const joint = horizontal
      ? { x, y: dy < 0 ? y : y + size - depth, w: jw, h: depth }
      : { x: dx < 0 ? x : x + size - depth, y, w: depth, h: jw };
    g.rect(joint.x, joint.y, joint.w, joint.h).fill(PALETTE.concrete900);
  }
}

/** Соседняя клетка — тоже глухая стена, панель туда не смотрит. */
function facesConcrete(map: TileMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return true;
  return map.tiles[cy * map.cols + cx] === TILE_WALL;
}

/**
 * Стеклянная перегородка. В ките она подписана «бьётся», поэтому
 * разрушаемая клетка — именно стекло. Целых секций тем меньше,
 * чем сильнее её разбили: износ виден без цифр.
 */
function drawGlassPartition(
  g: Graphics,
  map: TileMap,
  cx: number,
  cy: number,
  x: number,
  y: number,
  size: number,
): void {
  g.rect(x, y, size, size).fill(PALETTE.floor);
  const sill = TUNING.render.glassSill;
  g.rect(x, y, size, size).stroke({ width: sill, color: PALETTE.furniture, alignment: 1 });

  const maxHp = Math.max(1, TUNING.room.weakWallHp);
  const left = map.weakHp[cy * map.cols + cx] ?? maxHp;
  const panes = Math.max(1, Math.ceil((left / maxHp) * 3));
  const gap = TUNING.render.weakPanelGap;
  const inner = size - sill * 2;
  const paneW = (inner - gap * 2) / 3;
  for (let i = 0; i < panes; i++) {
    g.rect(x + sill + i * (paneW + gap), y + sill, paneW, inner).fill({
      color: PALETTE.glass,
      alpha: TUNING.render.glassAlpha,
    });
  }
  g.rect(x, y, size, size).stroke({ width: TUNING.render.glassMullion, color: PALETTE.concrete700, alignment: 1 });
}

/** Проём: тёмный зев, деревянный наличник, жёлтая разметка на полу. */
function drawDoorway(
  g: Graphics,
  map: TileMap,
  cx: number,
  cy: number,
  x: number,
  y: number,
  size: number,
): void {
  const horizontal = cy === 0 || cy === map.rows - 1;
  g.rect(x, y, size, size).fill(PALETTE.black);

  if (map.doorsLocked) {
    // Заперто: служебная полоса поперёк зева.
    const inset = TUNING.render.doorBarInset;
    const bar = horizontal
      ? { x, y: y + inset, w: size, h: size - inset * 2 }
      : { x: x + inset, y, w: size - inset * 2, h: size };
    g.rect(bar.x, bar.y, bar.w, bar.h).fill(PALETTE.yellow);
    return;
  }

  // Открыто: наличник и две полосы разметки, как в ките.
  const jamb = TUNING.render.doorJamb;
  const frame = horizontal
    ? { x, y: cy === 0 ? y : y + size - jamb, w: size, h: jamb }
    : { x: cx === 0 ? x : x + size - jamb, y, w: jamb, h: size };
  g.rect(frame.x, frame.y, frame.w, frame.h).fill(PALETTE.furniture);

  const t = TUNING.render.doorThreshold;
  for (let i = 0; i < 2; i++) {
    const shift = jamb + t + i * (t * 2);
    const strip = horizontal
      ? { x, y: cy === 0 ? y + shift : y + size - shift - t, w: size, h: t }
      : { x: cx === 0 ? x + shift : x + size - shift - t, y, w: t, h: size };
    g.rect(strip.x, strip.y, strip.w, strip.h).fill({ color: PALETTE.yellow, alpha: 0.75 });
  }
}

/**
 * Перо телеграфа. Цвет один и тот же всегда, сообщение несут толщина и
 * частота мигания: чем меньше осталось до выстрела, тем толще контур и
 * тем чаще он мигает. Так телеграф читается и на обесцвеченном кадре, и
 * не претендует на служебный жёлтый.
 */
function telegraphPen(w: World, flash: number): { width: number; color: number; alpha: number } {
  const near = flash <= TUNING.render.telegraphNear;
  const rate = near ? TUNING.render.telegraphBlinkFast : TUNING.render.telegraphBlinkSlow;
  const lit = Math.floor(w.tick * STEP * rate) % 2 === 0;
  return {
    width: TUNING.render.telegraphWidth * (near ? TUNING.render.telegraphNearFactor : 1),
    color: PALETTE.concrete100,
    alpha: lit ? TUNING.render.telegraphAlpha : TUNING.render.telegraphAlphaOff,
  };
}

function lerp(prev: number, next: number, alpha: number): number {
  return prev + (next - prev) * alpha;
}

/**
 * Сколько эффекту осталось НА МОМЕНТ КАДРА. Таймеры убывают шагами
 * симуляции, а кадров между шагами сколько угодно: на замедлении шаг
 * идёт 20 раз в секунду против 60 кадров, и эффект, снятый прямо с
 * таймера, стоит по три кадра, а потом прыгает. Тела от этого спасает
 * интерполяция по alpha — эффектам нужна такая же.
 */
function fxLeft(left: number, alpha: number): number {
  return Math.max(0, left - alpha * STEP);
}

function drawEntities(g: Graphics, w: World, alpha: number): void {
  const time = w.tick * STEP;
  profiler.begin('КАДР: ТЕЛЕГРАФЫ');

  // Линия огня инспектора: пока табличка горит, видно, откуда уходить.
  for (const [e, inspector] of w.inspectorC) {
    const staff = w.staffC.get(e);
    const t = w.transform.get(e);
    const pt = w.transform.get(w.player);
    if (staff === undefined || staff.plateFlash <= 0 || t === undefined || pt === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const len = Math.hypot(dx, dy) || 1;
    const aim =
      inspector.shotsLeft > 0
        ? { x: inspector.aimX, y: inspector.aimY }
        : { x: dx / len, y: dy / len };
    g.moveTo(x, y)
      .lineTo(x + aim.x * TUNING.render.telegraphRay, y + aim.y * TUNING.render.telegraphRay)
      .stroke(telegraphPen(w, staff.plateFlash));
  }

  // Ревизор: луч на предмет, который он сейчас вносит в опись.
  for (const [e, auditor] of w.auditorC) {
    if (auditor.phase === 'open' || auditor.target < 0) continue;
    const t = w.transform.get(e);
    const tt = w.transform.get(auditor.target);
    if (t === undefined || tt === undefined) continue;
    g.moveTo(lerp(t.px, t.x, alpha), lerp(t.py, t.y, alpha))
      .lineTo(lerp(tt.px, tt.x, alpha), lerp(tt.py, tt.y, alpha))
      .stroke({
        width: TUNING.render.telegraphWidth,
        color: PALETTE.concrete100,
        alpha: TUNING.render.serviceRayAlpha,
      });
  }

  // Цель захвата и удерживаемое — светлой рамкой: жёлтый принадлежит
  // должностям, а это служебная отметка субъекта, а не объекта.
  const candidate = grabCandidate(w);
  const heldEntity = w.playerC.get(w.player)?.held ?? -1;
  const reachStash = stashInReach(w);
  const reachCounter = counterInReach(w);
  for (const mark of [candidate, heldEntity]) {
    if (mark < 0) continue;
    const t = w.transform.get(mark);
    const draw = w.drawC.get(mark);
    if (t === undefined || draw === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    const inset = TUNING.render.telegraphInset;
    g.rect(x - draw.size - inset, y - draw.size - inset, (draw.size + inset) * 2, (draw.size + inset) * 2)
      .stroke({
        width: TUNING.render.telegraphWidth,
        color: PALETTE.concrete100,
        alpha: mark === heldEntity ? 1 : 0.45,
      });
  }
  if (heldEntity >= 0) {
    const t = w.transform.get(heldEntity);
    const pt = w.transform.get(w.player);
    if (t !== undefined && pt !== undefined) {
      g.moveTo(lerp(pt.px, pt.x, alpha), lerp(pt.py, pt.y, alpha))
        .lineTo(lerp(t.px, t.x, alpha), lerp(t.py, t.y, alpha))
        .stroke({
          width: TUNING.render.telegraphWidth,
          color: PALETTE.concrete100,
          alpha: TUNING.render.holdRayAlpha,
        });
    }
  }

  profiler.end('КАДР: ТЕЛЕГРАФЫ');

  profiler.begin('КАДР: СУЩНОСТИ');
  for (const [e, draw] of w.drawC) {
    // Субъект рисуется последним: красное пятно не должен закрывать никто.
    if (e === w.player) continue;
    // Снаряды считаются отдельно: их много и они живут по своим правилам.
    if (w.bulletC.has(e)) continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);

    // Добыча рисуется своим: её не ломают и не таскают, к ней подходят.
    const stash = w.stashC.get(e);
    if (stash !== undefined) {
      drawStash(g, x, y, draw.size, stash.kind, stash.opened, e === reachStash);
      continue;
    }

    // Кладовщик: своя отрисовка. Он за столом, в бою не участвует, и
    // силуэт у него должен читаться как «не цель».
    const clerk = w.clerkC.get(e);
    if (clerk !== undefined) {
      drawClerk(g, x, y, draw.size, clerk.offended, clerk.noteTime > 0);
      continue;
    }

    // Стойка: тумба с табличкой. Рисуется своим — к ней подходят, её
    // не ломают и не таскают.
    const counter = w.counterC.get(e);
    if (counter !== undefined) {
      const spec = COUNTERS_BY_KIND.get(counter.kind as never);
      drawCounter(g, x, y, draw.size, spec === undefined ? 1 : spec.marks, counter.used, e === reachCounter);
      continue;
    }

    // Талон рисуется своим: бумажная полоска на полу, без объёма и без
    // тени. Объём у мелочи крал бы внимание у тел.
    if (w.ticketC.has(e)) {
      drawTicket(g, x, y, draw.size, draw.color);
      continue;
    }

    const health = w.health.get(e);
    let color = draw.color;
    if (health !== undefined) {
      if (health.flash > 0) color = PALETTE.concrete300;
      else if (health.iframes > 0 && Math.floor(time * TUNING.feel.blinkRate) % 2 === 0) continue;
    }

    if (draw.desk) {
      const extra = TUNING.render.deskExtra;
      g.rect(x - draw.size - extra, y - draw.size - extra, (draw.size + extra) * 2, (draw.size + extra) * 2)
        .fill(PALETTE.concrete700);
    }

    const staffHere = w.staffC.get(e);
    if (draw.shape === 'square' && staffHere !== undefined) {
      drawSilhouette(g, w, e, staffHere, x, y, draw.size, color);
    } else {
      switch (draw.shape) {
        case 'square': {
          // Положенное набок укрытие рисуется плитой: ниже, шире и с
          // светлой кромкой по верхнему краю — видно, что оно лежит.
          if (w.propC.get(e)?.phase === 'cover') {
            contactShadow(g, x, y, draw.size, 1);
            block(g, x - draw.size, y - draw.size, draw.size * 2, draw.size * 2, color);
            g.rect(x - draw.size, y - draw.size, draw.size * 2, TUNING.render.coverLip).fill(
              PALETTE.concrete300,
            );
            g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).stroke({
              width: TUNING.render.coverEdge,
              color: PALETTE.concrete500,
              alignment: 1,
            });
            break;
          }

          // Удерживаемое телекинезом висит: тело приподнято и дышит, тень
          // остаётся на полу и поджимается. Иначе полёт читается как
          // скольжение по полу.
          const cfg = TUNING.telekinesis;
          const held = e === heldEntity;
          const lift = held ? cfg.liftHeight + Math.sin(time * cfg.liftBobRate) * cfg.liftBob : 0;
          contactShadow(g, x, y, draw.size, held ? cfg.liftShadowScale : 1);
          const top = y - lift;
          g.rect(x - draw.size, top - draw.size, draw.size * 2, draw.size * 2).fill(color);
          shadeBlock(g, x - draw.size, top - draw.size, draw.size * 2, draw.size * 2);
          break;
        }
        case 'diamond':
          g.poly([x, y - draw.size, x + draw.size, y, x, y + draw.size, x - draw.size, y]).fill(color);
          break;
        case 'dot':
          g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).fill(color);
          break;
        case 'bar': {
        // Стрела зарядной формы: вытянута вдоль своей скорости.
          const body = w.body.get(e);
          const vx = body === undefined ? 1 : body.vx;
        const vy = body === undefined ? 0 : body.vy;
        const len = Math.hypot(vx, vy) || 1;
        const ux = vx / len;
        const uy = vy / len;
        const half = draw.size * TUNING.render.barLengthFactor;
        const px = -uy * draw.size;
        const py = ux * draw.size;
          g.poly([
            x + ux * half + px,
            y + uy * half + py,
            x + ux * half - px,
            y + uy * half - py,
            x - ux * half - px,
            y - uy * half - py,
            x - ux * half + px,
            y - uy * half + py,
          ]).fill(color);
          break;
        }
      }
    }

    const staff = staffHere;
    if (staff === undefined) continue;

    // Внеплановая проверка: двойной неподвижный контур. Цвет самый
    // светлый из палитры — красный занят субъектом.
    if (staff.control) {
      const gap = TUNING.render.controlOutlineGap;
      const width = TUNING.render.controlOutline;
      for (const pad of [gap, gap * 2]) {
        g.rect(x - draw.size - pad, y - draw.size - pad, (draw.size + pad) * 2, (draw.size + pad) * 2)
          .stroke({ width, color: PALETTE.concrete100 });
      }
    }

    drawPlates(g, x, y, draw.size, staff);
    if (staff.plateFlash > 0) {
      const inset = TUNING.render.telegraphInset;
      g.rect(x - draw.size - inset, y - draw.size - inset, (draw.size + inset) * 2, (draw.size + inset) * 2)
        .stroke(telegraphPen(w, staff.plateFlash));
    }
    if (w.registrarC.has(e)) drawVacancyCount(g, x, y, draw.size, vacancyCount(w));

    // Ревизор: счётчик невнесённых строк над головой, а пока идёт опись —
    // ещё и глухая рамка. Она же и есть «по нему не проходит».
    const auditor = w.auditorC.get(e);
    if (auditor !== undefined) {
      if (auditor.phase === 'open') {
        drawVacancyCount(g, x, y, draw.size, 0);
      } else {
        drawVacancyCount(g, x, y, draw.size, pendingItems(w));
        const inset = TUNING.render.auditShieldInset;
        g.rect(x - draw.size - inset, y - draw.size - inset, (draw.size + inset) * 2, (draw.size + inset) * 2)
          .stroke({ width: TUNING.render.auditShieldWidth, color: PALETTE.concrete300 });
      }
    }
  }

  drawPlayer(g, w, alpha);
  profiler.end('КАДР: СУЩНОСТИ');

  profiler.begin('КАДР: ПУЛИ');
  drawBullets(g, w, alpha);
  profiler.end('КАДР: ПУЛИ');
}

/** Снаряды: своя пачка, чтобы их цену было видно отдельно. */
function drawBullets(g: Graphics, w: World, alpha: number): void {
  for (const [e] of w.bulletC) {
    const draw = w.drawC.get(e);
    const t = w.transform.get(e);
    if (draw === undefined || t === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);

    if (draw.shape === 'diamond') {
      g.poly([x, y - draw.size, x + draw.size, y, x, y + draw.size, x - draw.size, y]).fill(draw.color);
      continue;
    }
    if (draw.shape === 'card') {
      const body = w.body.get(e);
      const vx = body === undefined ? 1 : body.vx;
      const vy = body === undefined ? 0 : body.vy;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const along = draw.size * TUNING.render.cardAlong;
      const across = draw.size * TUNING.render.cardAcross;
      const px = -uy * across;
      const py = ux * across;
      g.poly([
        x + ux * along + px,
        y + uy * along + py,
        x + ux * along - px,
        y + uy * along - py,
        x - ux * along - px,
        y - uy * along - py,
        x - ux * along + px,
        y - uy * along + py,
      ]).fill(draw.color);
      continue;
    }
    if (draw.shape === 'bar') {
      const body = w.body.get(e);
      const vx = body === undefined ? 1 : body.vx;
      const vy = body === undefined ? 0 : body.vy;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const half = draw.size * TUNING.render.barLengthFactor;
      const px = -uy * draw.size;
      const py = ux * draw.size;
      g.poly([
        x + ux * half + px,
        y + uy * half + py,
        x + ux * half - px,
        y + uy * half - py,
        x - ux * half - px,
        y - uy * half - py,
        x - ux * half + px,
        y - uy * half + py,
      ]).fill(draw.color);
      continue;
    }
    g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).fill(draw.color);
  }
}

/**
 * Силуэт сотрудника. Формы заданы дизайн-документом и нарочно не
 * совпадают друг с другом: должность читается по очертанию, а не по цвету.
 */
function drawSilhouette(
  g: Graphics,
  w: World,
  e: number,
  staff: { silhouette: string },
  x: number,
  y: number,
  half: number,
  color: number,
): void {
  contactShadow(g, x, y, half, 1);

  switch (staff.silhouette) {
    case 'armed': {
      // Инспектор: узкий корпус, жёсткий воротник-кольцо шире плеч и одна
      // рука, вытянутая вбок. Воротник торчит наружу с обеих сторон —
      // поэтому он виден и в чёрном пятне, а не только вблизи.
      const inspector = w.inspectorC.get(e);
      const ax = inspector === undefined ? 1 : inspector.aimX;
      const ay = inspector === undefined ? 0 : inspector.aimY;
      const len = Math.hypot(ax, ay) || 1;
      const bw = half * TUNING.render.inspectorWidth;
      const reach = half * TUNING.render.armReach;
      const thick = half * TUNING.render.armThickness;
      block(g, x - bw, y - half, bw * 2, half * 2, color);
      block(g, x + (ax / len) * reach - thick, y + (ay / len) * reach - thick, thick * 2, thick * 2, color);
      const collar = half * TUNING.render.collarWidth;
      const ct = half * TUNING.render.collarThick;
      block(g, x - collar, y - half - half * TUNING.render.collarLift, collar * 2, ct * 2, color);
      headShadow(g, x, y, bw);
      break;
    }
    case 'wide': {
      // Регистратор: вдвое шире, чем выше, по бокам — картотеки, которые
      // выше корпуса. Силуэт похож на стол с двумя тумбами.
      const bw = half * 2;
      const bh = half;
      block(g, x - bw, y - bh, bw * 2, bh * 2, color);
      const arm = half * TUNING.render.armThickness;
      const out = half * TUNING.render.registrarArmOut;
      const tall = bh * TUNING.render.registrarArmTall;
      block(g, x - bw - out, y - tall, arm * 2, tall * 2, color);
      block(g, x + bw + out - arm * 2, y - tall, arm * 2, tall * 2, color);
      headShadow(g, x, y, bh);
      break;
    }
    case 'bulk': {
      // Ревизор: массы слева вдвое больше, справа корпус обрублен, головы
      // в силуэте нет вовсе — она поглощена. Выходит кривая буква,
      // которую ни с кем не спутать даже чёрным пятном.
      const shift = half * TUNING.render.bulkShift;
      const tall = half * TUNING.render.bulkTall;
      const leftW = half * TUNING.render.bulkLeft;
      block(g, x - half - shift, y - tall, leftW * 2, tall * 2, color);
      const rightW = half * TUNING.render.bulkRightWidth;
      const rightH = half * TUNING.render.bulkRightHeight;
      block(g, x - half - shift + leftW * 2, y + tall - rightH * 2, rightW * 2, rightH * 2, color);
      headShadow(g, x - half - shift + leftW, y, leftW);
      break;
    }
    case 'desk': {
      // Заведующий: самый крупный, и вокруг него свита табличек. Свита
      // висит за габаритом корпуса и медленно обходит его по кругу.
      block(g, x - half, y - half, half * 2, half * 2, color);
      const head = half * TUNING.render.bulkHead;
      block(g, x - head, y - half - head, head * 2, head * 2, color);
      headShadow(g, x, y, half);
      const count = TUNING.render.chiefRetinue;
      const ring = half * TUNING.render.chiefRetinueRadius;
      const mark = half * TUNING.render.chiefRetinueSize;
      const spin = w.tick * STEP * TUNING.render.chiefRetinueSpin;
      for (let i = 0; i < count; i++) {
        const a = spin + (i / count) * Math.PI * 2;
        g.rect(x + Math.cos(a) * ring - mark, y + Math.sin(a) * ring - mark / 2, mark * 2, mark).fill(PALETTE.yellow);
      }
      break;
    }
    case 'slim': {
      // Курьер: вытянут по ходу движения, через плечо — сумка. Она и
      // показывает, куда он бежит, без всякой подсветки пути.
      const body = w.body.get(e);
      const vx = body === undefined ? 0 : body.vx;
      const vy = body === undefined ? 0 : body.vy;
      const speed = Math.hypot(vx, vy);
      const ux = speed > 1 ? vx / speed : 0;
      const uy = speed > 1 ? vy / speed : 1;
      const along = half * TUNING.render.courierStretch;
      const across = half * TUNING.render.slimWidth;
      g.poly([
        x + ux * along - uy * across,
        y + uy * along + ux * across,
        x + ux * along + uy * across,
        y + uy * along - ux * across,
        x - ux * along + uy * across,
        y - uy * along - ux * across,
        x - ux * along - uy * across,
        y - uy * along + ux * across,
      ]).fill(color);
      const bag = half * TUNING.render.courierBag;
      const outw = half * TUNING.render.courierBagOut;
      block(g, x - uy * outw - bag, y + ux * outw - bag, bag * 2, bag * 2, color);
      headShadow(g, x, y, across);
      break;
    }
    default: {
      // Стажёр: голова утоплена в плечи, выступа вперёд нет — он никуда
      // не смотрит. Наружу торчит только одно вспухшее плечо.
      const bh = half * TUNING.render.sunkenSquat;
      const bw = half * TUNING.render.internWide;
      block(g, x - bw, y - bh, bw * 2, bh * 2, color);
      const lump = half * TUNING.render.internShoulder;
      const out = half * TUNING.render.internShoulderOut;
      block(g, x - bw - out, y - bh - out, lump * 2, lump * 2, color);
      break;
    }
  }
}

/** Заливка с вертикальным градиентом: свет сверху-слева, всю игру одинаково. */
function block(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(x, y, w, h).fill(color);
  shadeBlock(g, x, y, w, h);
}

function shadeBlock(g: Graphics, x: number, y: number, w: number, h: number): void {
  const top = h * TUNING.render.shadeTopBand;
  g.rect(x, y, w, top).fill({ color: PALETTE.concrete100, alpha: TUNING.render.shadeTopAlpha });
  g.rect(x, y + h - top, w, top).fill({ color: PALETTE.black, alpha: TUNING.render.shadeBottomAlpha });
}

/** Тень от головы на плечи — главный признак объёма. */
function headShadow(g: Graphics, x: number, y: number, half: number): void {
  const w = half * TUNING.render.headShadowWidth;
  g.rect(x - w, y - half, w * 2, half * TUNING.render.headShadowDepth).fill({
    color: PALETTE.black,
    alpha: TUNING.render.headShadowAlpha,
  });
}

/**
 * Кладовщик. Тело за прилавком: широкая столешница под ним, сам он
 * узкий и светлый. Оружия нет, таблички четыре насечки — это должность,
 * а не угроза. Обиженный гаснет и отворачивается: стол закрыт.
 */
function drawClerk(
  g: Graphics,
  x: number,
  y: number,
  half: number,
  offended: boolean,
  writing: boolean,
): void {
  const cfg = TUNING.render;
  const extra = cfg.deskExtra;
  // Прилавок под ним — шире тела, светлее пола.
  g.rect(x - half - extra, y - half - extra, (half + extra) * 2, (half + extra) * 2).fill(
    PALETTE.concrete700,
  );
  contactShadow(g, x, y, half, 1);
  const body = offended ? PALETTE.concrete700 : PALETTE.concrete300;
  block(g, x - half, y - half, half * 2, half * 2, body);
  g.rect(x - half, y - half, half * 2, half * 2).stroke({
    width: cfg.stashEdge,
    color: offended ? PALETTE.concrete500 : PALETTE.concrete100,
    alignment: 1,
  });
  if (!offended || writing) {
    drawPlate(g, x, y - half - cfg.counterPlateLift, half, TUNING.clerk.plateMarks);
  }
}

/**
 * Стойка. Тумба шире, чем глубже, со светлой столешницей и служебной
 * табличкой над ней: по числу насечек стойки различаются между собой,
 * как и должности. Отработанное окошко гаснет и теряет табличку —
 * чтобы не звало второй раз.
 */
function drawCounter(
  g: Graphics,
  x: number,
  y: number,
  half: number,
  marks: number,
  used: boolean,
  near: boolean,
): void {
  const cfg = TUNING.render;
  const wide = half * cfg.counterWide;
  contactShadow(g, x, y, half, 1);
  const body = used ? PALETTE.concrete700 : PALETTE.furniture;
  block(g, x - wide, y - half, wide * 2, half * 2, body);
  // Столешница: светлая полоса по верхнему краю. По ней видно, что это
  // стойка, а не шкаф, даже когда табличка снята.
  g.rect(x - wide, y - half, wide * 2, cfg.counterTop).fill(
    used ? PALETTE.concrete500 : PALETTE.concrete300,
  );
  g.rect(x - wide, y - half, wide * 2, half * 2).stroke({
    width: cfg.stashEdge,
    color: used ? PALETTE.concrete500 : PALETTE.concrete300,
    alignment: 1,
  });
  if (!used) drawPlate(g, x, y - half - cfg.counterPlateLift, wide, marks);

  if (near && !used) {
    const pad = cfg.stashReachPad;
    g.rect(x - wide - pad, y - half - pad, (wide + pad) * 2, (half + pad) * 2).stroke({
      width: cfg.stashEdge,
      color: PALETTE.concrete100,
    });
  }
}

/**
 * Талон: светлая бумажная полоска с просечкой посередине. Просечка
 * нужна, чтобы талон не читался как пуля субъекта: та тоже светлая и
 * мелкая, но сплошная и круглая.
 */
function drawTicket(g: Graphics, x: number, y: number, size: number, color: number): void {
  const half = size * TUNING.render.ticketWide;
  g.rect(x - half, y - size, half * 2, size * 2).fill(color);
  const notch = half * TUNING.render.ticketNotch;
  g.rect(x - notch, y - size, notch * 2, size * 2).fill(PALETTE.concrete700);
  g.rect(x - half, y - size, half * 2, size * 2).stroke({
    width: TUNING.render.ticketEdge,
    color: PALETTE.concrete700,
    alignment: 1,
  });
}

/** Контактная тень. Сжимается на рывке, иначе полёт читается как скольжение. */
function contactShadow(g: Graphics, x: number, y: number, half: number, scale: number): void {
  g.ellipse(
    x,
    y + half * TUNING.render.contactDrop,
    half * TUNING.render.contactWidth * scale,
    half * TUNING.render.contactHeight * scale,
  ).fill({ color: PALETTE.black, alpha: TUNING.render.contactAlpha });
}

/**
 * Опечатанный шкаф и ячейка выдачи. Жёлтая полоса на них — служебная
 * разметка, а не подсветка: по правилам палитры жёлтым красят печати и
 * пломбы. Вскрытое гаснет и теряет пломбу, чтобы не звать второй раз.
 */
function drawStash(
  g: Graphics,
  x: number,
  y: number,
  half: number,
  kind: string,
  opened: boolean,
  near: boolean,
): void {
  const safe = kind === 'safe';
  contactShadow(g, x, y, half, 1);
  const body = opened ? PALETTE.concrete700 : PALETTE.furniture;
  block(g, x - half, y - half, half * 2, half * 2, body);
  g.rect(x - half, y - half, half * 2, half * 2).stroke({
    width: TUNING.render.stashEdge,
    color: opened ? PALETTE.concrete500 : PALETTE.concrete300,
    alignment: 1,
  });

  if (!opened) {
    // Пломба: у шкафа поперёк дверцы, у ячейки — ярлык сверху, у особой
    // выдачи крест-накрест: её видно через всю комнату, и не зря.
    const seal = TUNING.render.stashSeal;
    if (safe) {
      g.rect(x - half, y - seal / 2, half * 2, seal).fill(PALETTE.yellow);
    } else if (kind === 'special') {
      g.rect(x - half, y - seal / 2, half * 2, seal).fill(PALETTE.yellow);
      g.rect(x - seal / 2, y - half, seal, half * 2).fill(PALETTE.yellow);
    } else {
      g.rect(x - half, y - half - seal, half * 2, seal).fill(PALETTE.yellow);
    }
  }

  // В зоне оформления — светлый контур. Он не мигает: мигание занято
  // телеграфом, а это приглашение, а не угроза.
  if (near && !opened) {
    const pad = TUNING.render.stashReachPad;
    g.rect(x - half - pad, y - half - pad, (half + pad) * 2, (half + pad) * 2).stroke({
      width: TUNING.render.stashEdge,
      color: PALETTE.concrete100,
    });
  }
}

/** Таблички на груди. Регистратор занимает две должности — у него их две. */
function drawPlates(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  staff: { plateMarks: number; plates: number },
): void {
  const count = Math.max(1, staff.plates);
  const height = TUNING.render.plateHeight;
  const gap = TUNING.render.plateStack;
  const total = count * height + (count - 1) * gap;
  let top = y - total / 2;
  for (let i = 0; i < count; i++) {
    drawPlate(g, x, top + height / 2, size, staff.plateMarks);
    top += height + gap;
  }
}

/** Табличка: жёлтая пластина с насечками по старшинству. */
function drawPlate(g: Graphics, x: number, y: number, size: number, marks: number): void {
  const width = size * TUNING.render.plateWidthFactor;
  const height = TUNING.render.plateHeight;
  const top = y - height / 2;
  g.rect(x - width / 2, top, width, height).fill(PALETTE.yellow);

  const mark = TUNING.render.plateMarkSize;
  const gap = TUNING.render.plateMarkGap;
  const total = marks * mark + Math.max(0, marks - 1) * gap;
  let cursor = x - total / 2;
  for (let i = 0; i < marks; i++) {
    g.rect(cursor, top + (height - mark) / 2, mark, mark).fill(PALETTE.black);
    cursor += mark + gap;
  }
}

/** Сколько ставок Регистратору ещё закрывать. */
function drawVacancyCount(g: Graphics, x: number, y: number, size: number, open: number): void {
  const mark = TUNING.render.vacancyMark;
  const gap = TUNING.render.vacancyGap;
  const total = open * mark + Math.max(0, open - 1) * gap;
  let cursor = x - total / 2;
  const top = y - size - TUNING.render.vacancyLift;
  for (let i = 0; i < open; i++) {
    g.rect(cursor, top, mark, mark).fill(PALETTE.yellow);
    cursor += mark + gap;
  }
}

/**
 * Слой свечения. По брифу светиться должен только субъект, но заражённые
 * с красным ореолом читаются в бою лучше — это правка по игре, а не по
 * документу, и она сознательная. Ореол сотрудников гасится или снимается
 * ручками staffGlowAlpha и staffGlowSpread.
 */
function drawGlow(g: Graphics, w: World, alpha: number): void {
  // Сотрудники: ореол шире силуэта и тусклее субъекта.
  for (const [e] of w.staffC) {
    const draw = w.drawC.get(e);
    const t = w.transform.get(e);
    if (draw === undefined || t === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    const size = draw.size * TUNING.render.staffGlowSpread;
    g.rect(x - size, y - size, size * 2, size * 2);
  }
  g.fill({ color: PALETTE.red, alpha: TUNING.render.staffGlowAlpha });

  // Субъект и всё остальное красное — в полную силу.
  for (const [e, draw] of w.drawC) {
    if (draw.color !== PALETTE.red) continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    if (draw.shape === 'diamond') {
      g.poly([x, y - draw.size, x + draw.size, y, x, y + draw.size, x - draw.size, y]);
    } else {
      g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2);
    }
  }
  g.fill(PALETTE.red);
}

function drawHitboxes(g: Graphics, w: World, alpha: number): void {
  for (const [e, b] of w.body) {
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    g.rect(x - b.radius, y - b.radius, b.radius * 2, b.radius * 2).stroke({
      width: TUNING.render.hitboxWidth,
      color: PALETTE.yellow,
    });
    g.circle(x, y, b.radius).stroke({
      width: TUNING.render.hitboxWidth,
      color: PALETTE.red,
      alpha: 0.6,
    });
  }
}
