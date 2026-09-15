/**
 * Рендер. Отвязан от логики: читает World и alpha между шагами,
 * ничего в мире не меняет. Собственный PRNG для тряски,
 * чтобы визуал не съедал случайность симуляции.
 */
import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import type { World } from './ecs';
import { createAberration, createDust, drawSmoke } from './fx';
import { PALETTE } from './palette';
import { makeRng } from './rng';
import { vacancyCount } from './systems/staff';
import { pendingItems } from './systems/postAuditor';
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

  shakeLayer.addChild(roomLayer, dustLayer, smokeLayer, entityLayer, glowLayer, debugLayer);
  root.addChild(shakeLayer);
  app.stage.addChild(root);

  // Вспышка стоп-кадра живёт в экранных координатах, её тряска не касается.
  const flashLayer = new Graphics();
  app.stage.addChild(flashLayer);

  const aberration = createAberration();
  let aberrationOn = TUNING.fx.aberration > 0;
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
      const scale = Math.min(app.screen.width / ROOM_WIDTH, app.screen.height / ROOM_HEIGHT);
      root.scale.set(scale);
      root.position.set(
        Math.round((app.screen.width - ROOM_WIDTH * scale) / 2),
        Math.round((app.screen.height - ROOM_HEIGHT * scale) / 2),
      );
    },

    draw(w, alpha) {
      if (w.mapToken !== drawnToken) {
        drawnToken = w.mapToken;
        drawRoom(roomLayer, w.map);
      }

      const frame = app.ticker.deltaMS / 1000;
      fxTime += frame;

      const shake = w.fx.shake;
      shakeLayer.position.set(fxRng.spread(shake), fxRng.spread(shake));

      dust.update(frame);
      dustLayer.clear();
      dust.draw(dustLayer);

      smokeLayer.clear();
      drawSmoke(smokeLayer, w, fxTime);

      entityLayer.clear();
      drawEntities(entityLayer, w, alpha);

      // Свечение и аберрация на нуле снимаются целиком: слабой машине
      // важно, чтобы выключенный эффект ничего не стоил.
      glowLayer.visible = TUNING.fx.bloomAlpha > 0;
      if (glowLayer.visible) {
        glowLayer.clear();
        drawGlow(glowLayer, w, alpha);
        glowLayer.alpha = TUNING.fx.bloomAlpha;
        bloom.strength = TUNING.fx.bloomBlur;
      }

      const wantAberration = TUNING.fx.aberration > 0;
      if (wantAberration !== aberrationOn) {
        aberrationOn = wantAberration;
        app.stage.filters = wantAberration ? [aberration.filter] : [];
      }
      if (wantAberration) aberration.setAmount(TUNING.fx.aberration);

      flashLayer.clear();
      if (w.fx.hitstop > 0 && TUNING.fx.hitstopFlash > 0) {
        flashLayer
          .rect(0, 0, app.screen.width, app.screen.height)
          .fill({ color: PALETTE.concreteLight, alpha: TUNING.fx.hitstopFlash });
      }

      debugLayer.clear();
      if (renderer.showHitboxes) drawHitboxes(debugLayer, w, alpha);
    },
  };

  return renderer;
}

/** Бетон, пол и дверные проёмы. Перерисовывается только при смене карты. */
function drawRoom(g: Graphics, map: TileMap): void {
  g.clear();
  const size = map.size;
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const x = cx * size;
      const y = cy * size;
      const tile = map.tiles[cy * map.cols + cx];

      if (tile === TILE_WALL) {
        const inset = TUNING.render.wallInset;
        g.rect(x, y, size, size).fill(PALETTE.concrete);
        g.rect(x + inset, y + inset, size - inset * 2, size - inset * 2).fill(PALETTE.concreteMid);
        continue;
      }

      if (tile === TILE_WEAK) {
        // Перегородка: та же клетка, но набрана панелями. Панелей тем
        // меньше, чем сильнее её уже разбили — износ виден без цифр.
        const inset = TUNING.render.wallInset;
        const gap = TUNING.render.weakPanelGap;
        g.rect(x, y, size, size).fill(PALETTE.concrete);
        const maxHp = Math.max(1, TUNING.room.weakWallHp);
        const left = map.weakHp[cy * map.cols + cx] ?? maxHp;
        const panels = Math.max(1, Math.ceil((left / maxHp) * 4));
        const side = (size - inset * 2 - gap) / 2;
        const spots: ReadonlyArray<readonly [number, number]> = [
          [x + inset, y + inset],
          [x + inset + side + gap, y + inset],
          [x + inset, y + inset + side + gap],
          [x + inset + side + gap, y + inset + side + gap],
        ];
        for (let i = 0; i < panels; i++) {
          const spot = spots[i];
          if (spot === undefined) continue;
          g.rect(spot[0], spot[1], side, side).fill(PALETTE.concreteMid);
        }
        continue;
      }

      if (tile === TILE_GATE) {
        // Проём: в полу нет пола. Чёрный провал в красной рамке.
        const inset = TUNING.render.gateInset;
        g.rect(x, y, size, size).fill(PALETTE.black);
        g.rect(x + inset, y + inset, size - inset * 2, size - inset * 2).stroke({
          width: TUNING.render.gateWidth,
          color: PALETTE.red,
          alpha: 0.5,
        });
        continue;
      }

      g.rect(x, y, size, size).fill(PALETTE.concreteDark);
      g.rect(x, y, size, TUNING.render.floorGrid)
        .rect(x, y, TUNING.render.floorGrid, size)
        .fill(PALETTE.concrete);

      if (tile !== TILE_DOOR) continue;
      const horizontal = cy === 0 || cy === map.rows - 1;
      if (map.doorsLocked) {
        g.rect(x, y, size, size).fill(PALETTE.red);
        const inset = TUNING.render.doorBarInset;
        const bar = horizontal
          ? { x, y: y + inset, w: size, h: size - inset * 2 }
          : { x: x + inset, y, w: size - inset * 2, h: size };
        g.rect(bar.x, bar.y, bar.w, bar.h).fill(PALETTE.yellow);
      } else {
        const t = TUNING.render.doorThreshold;
        const strip = horizontal
          ? { x, y: cy === 0 ? y + size - t : y, w: size, h: t }
          : { x: cx === 0 ? x + size - t : x, y, w: t, h: size };
        g.rect(strip.x, strip.y, strip.w, strip.h).fill(PALETTE.yellow);
      }
    }
  }
}

function lerp(prev: number, next: number, alpha: number): number {
  return prev + (next - prev) * alpha;
}

function drawEntities(g: Graphics, w: World, alpha: number): void {
  const time = w.tick * STEP;

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
      .stroke({ width: TUNING.render.telegraphWidth, color: PALETTE.yellow, alpha: 0.55 });
  }

  // Ревизор: луч на предмет, который он сейчас вносит в опись.
  for (const [e, auditor] of w.auditorC) {
    if (auditor.phase === 'open' || auditor.target < 0) continue;
    const t = w.transform.get(e);
    const tt = w.transform.get(auditor.target);
    if (t === undefined || tt === undefined) continue;
    g.moveTo(lerp(t.px, t.x, alpha), lerp(t.py, t.y, alpha))
      .lineTo(lerp(tt.px, tt.x, alpha), lerp(tt.py, tt.y, alpha))
      .stroke({ width: TUNING.render.telegraphWidth, color: PALETTE.yellow, alpha: 0.5 });
  }

  // Цель захвата и удерживаемое — жёлтой рамкой.
  const candidate = grabCandidate(w);
  const heldEntity = w.playerC.get(w.player)?.held ?? -1;
  for (const mark of [candidate, heldEntity]) {
    if (mark < 0) continue;
    const t = w.transform.get(mark);
    const draw = w.drawC.get(mark);
    if (t === undefined || draw === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    const inset = TUNING.render.telegraphInset;
    g.rect(x - draw.size - inset, y - draw.size - inset, (draw.size + inset) * 2, (draw.size + inset) * 2)
      .stroke({ width: TUNING.render.telegraphWidth, color: PALETTE.yellow, alpha: mark === heldEntity ? 1 : 0.45 });
  }
  if (heldEntity >= 0) {
    const t = w.transform.get(heldEntity);
    const pt = w.transform.get(w.player);
    if (t !== undefined && pt !== undefined) {
      g.moveTo(lerp(pt.px, pt.x, alpha), lerp(pt.py, pt.y, alpha))
        .lineTo(lerp(t.px, t.x, alpha), lerp(t.py, t.y, alpha))
        .stroke({ width: TUNING.render.telegraphWidth, color: PALETTE.yellow, alpha: 0.35 });
    }
  }

  const player = w.playerC.get(w.player);
  const playerT = w.transform.get(w.player);
  if (player !== undefined && playerT !== undefined) {
    const x = lerp(playerT.px, playerT.x, alpha);
    const y = lerp(playerT.py, playerT.y, alpha);
    if (player.phase === 'dash') {
      const speed = TUNING.player.dashDistance / TUNING.player.dashDuration;
      for (let i = 1; i <= TUNING.render.dashTrail; i++) {
        const back = speed * TUNING.render.dashTrailStep * i;
        const size = TUNING.player.radius;
        g.rect(x - player.dashX * back - size, y - player.dashY * back - size, size * 2, size * 2).fill({
          color: PALETTE.concreteMid,
          alpha: 1 - i / (TUNING.render.dashTrail + 1),
        });
      }
    }
    const ax = player.aimX;
    const ay = player.aimY;
    g.moveTo(x + ax * TUNING.player.radius, y + ay * TUNING.player.radius)
      .lineTo(x + ax * TUNING.render.aimLength, y + ay * TUNING.render.aimLength)
      .stroke({ width: TUNING.render.aimWidth, color: PALETTE.red });
  }

  for (const [e, draw] of w.drawC) {
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);

    const health = w.health.get(e);
    let color = draw.color;
    if (health !== undefined) {
      if (health.flash > 0) color = PALETTE.concreteLight;
      else if (health.iframes > 0 && Math.floor(time * TUNING.feel.blinkRate) % 2 === 0) continue;
    }

    if (draw.desk) {
      const extra = TUNING.render.deskExtra;
      g.rect(x - draw.size - extra, y - draw.size - extra, (draw.size + extra) * 2, (draw.size + extra) * 2)
        .fill(PALETTE.concrete);
    }

    switch (draw.shape) {
      case 'square':
        if (draw.hollow) {
          g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).stroke({
            width: TUNING.render.hollowWidth,
            color,
          });
        } else {
          g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).fill(color);
        }
        break;
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

    const staff = w.staffC.get(e);
    if (staff === undefined) continue;
    drawPlate(g, x, y, draw.size, staff.plateMarks);
    if (staff.plateFlash > 0) {
      const inset = TUNING.render.telegraphInset;
      g.rect(x - draw.size - inset, y - draw.size - inset, (draw.size + inset) * 2, (draw.size + inset) * 2)
        .stroke({ width: TUNING.render.telegraphWidth, color: PALETTE.yellow });
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
          .stroke({ width: TUNING.render.auditShieldWidth, color: PALETTE.concreteLight });
      }
    }
  }
}

/** Табличка на груди: жёлтая пластина с насечками по старшинству. */
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
 * Слой свечения: только акцентный красный, залитый целиком.
 * Размытие и сложение делают из него ореол, не трогая сами силуэты.
 */
function drawGlow(g: Graphics, w: World, alpha: number): void {
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
