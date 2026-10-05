/**
 * Общий договор рендера. Точке входа всё равно, чем нарисован кадр:
 * плоским Pixi или трёхмерной сценой — ей нужны холст, тикер и проекция
 * курсора в мир.
 */
import type { Ticker } from 'pixi.js';
import type { World } from './ecs';

export interface RenderHost {
  canvas: HTMLCanvasElement;
  ticker: Ticker;
}

export interface Renderer {
  app: RenderHost;
  showHitboxes: boolean;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  layout(): void;
  draw(w: World, alpha: number): void;
}
