/**
 * Рендер. Отвязан от логики: читает World и alpha между шагами,
 * ничего в мире не меняет. Собственный PRNG для тряски,
 * чтобы визуал не съедал случайность симуляции.
 */
import { Application, Container, Graphics } from 'pixi.js';
import type { World } from './ecs';
import { PALETTE } from './palette';
import { makeRng } from './rng';
import { TILE_DOOR, TILE_WALL, type TileMap } from './room';
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
  });
  host.appendChild(app.canvas);

  const root = new Container();
  const shakeLayer = new Container();
  const roomLayer = new Graphics();
  const entityLayer = new Graphics();
  const debugLayer = new Graphics();
  shakeLayer.addChild(roomLayer, entityLayer, debugLayer);
  root.addChild(shakeLayer);
  app.stage.addChild(root);

  const fxRng = makeRng(1);
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

      const shake = w.fx.shake;
      shakeLayer.position.set(fxRng.spread(shake), fxRng.spread(shake));

      entityLayer.clear();
      drawEntities(entityLayer, w, alpha);

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

  for (const [e, enemy] of w.enemyC) {
    if (enemy.phase !== 'cast') continue;
    const t = w.transform.get(e);
    const pt = w.transform.get(w.player);
    if (t === undefined || pt === undefined) continue;
    const x = lerp(t.px, t.x, alpha);
    const y = lerp(t.py, t.y, alpha);
    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const len = Math.hypot(dx, dy) || 1;
    g.moveTo(x, y)
      .lineTo(x + (dx / len) * TUNING.render.telegraphRay, y + (dy / len) * TUNING.render.telegraphRay)
      .stroke({ width: TUNING.render.telegraphWidth, color: PALETTE.yellow, alpha: 0.55 });
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

    switch (draw.shape) {
      case 'square':
        g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).fill(color);
        break;
      case 'diamond':
        g.poly([x, y - draw.size, x + draw.size, y, x, y + draw.size, x - draw.size, y]).fill(color);
        break;
      case 'dot':
        g.rect(x - draw.size, y - draw.size, draw.size * 2, draw.size * 2).fill(color);
        break;
    }

    const enemy = w.enemyC.get(e);
    if (enemy !== undefined && enemy.phase === 'cast') {
      const inset = TUNING.render.telegraphInset;
      g.rect(x - draw.size - inset, y - draw.size - inset, (draw.size + inset) * 2, (draw.size + inset) * 2).stroke({
        width: TUNING.render.telegraphWidth,
        color: PALETTE.yellow,
      });
    }
  }
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
