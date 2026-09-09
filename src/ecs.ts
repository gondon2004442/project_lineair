/**
 * Мини-ECS. Компоненты — плоские структуры без методов,
 * системы — функции над World. Никакой логики в сущностях.
 */
import type { Rng } from './rng';
import type { TileMap } from './room';
import type { InputSnapshot } from './input';

export type Entity = number;
export type Faction = 'player' | 'enemy';

/** Положение. px/py — положение на прошлом шаге, для интерполяции рендера. */
export interface Transform {
  x: number;
  y: number;
  px: number;
  py: number;
}

/** Тело: скорость и половина стороны хитбокса. */
export interface Body {
  vx: number;
  vy: number;
  radius: number;
}

export interface Health {
  hp: number;
  max: number;
  /** Пока > 0 — урон не проходит. */
  iframes: number;
  /** Пока > 0 — тело залито белым. */
  flash: number;
}

export type PlayerPhase = 'normal' | 'dash';

export interface PlayerC {
  /** Единичный вектор на курсор. */
  aimX: number;
  aimY: number;
  phase: PlayerPhase;
  fireCooldown: number;
  dashTime: number;
  dashCooldown: number;
  dashX: number;
  dashY: number;
}

export type EnemyPhase = 'chase' | 'cast' | 'burst' | 'recover';

export interface EnemyC {
  phase: EnemyPhase;
  /** Обратный отсчёт текущей фазы. */
  timer: number;
  shotsLeft: number;
  /** Знак бокового смещения при подходе. */
  strafeSign: number;
}

export interface BulletC {
  faction: Faction;
  damage: number;
  life: number;
}

export type Shape = 'square' | 'diamond' | 'dot';

export interface DrawC {
  shape: Shape;
  /** Половина стороны / радиус отрисовки. */
  size: number;
  color: number;
}

export type RunStatus = 'playing' | 'dead' | 'cleared';

export interface Feedback {
  shake: number;
  hitstop: number;
}

export interface World {
  seed: number;
  rng: Rng;
  /** Номер шага симуляции с начала забега. */
  tick: number;
  map: TileMap;
  input: InputSnapshot;
  fx: Feedback;
  status: RunStatus;
  player: Entity;

  nextEntity: Entity;
  alive: Set<Entity>;
  doomed: Entity[];

  transform: Map<Entity, Transform>;
  body: Map<Entity, Body>;
  health: Map<Entity, Health>;
  playerC: Map<Entity, PlayerC>;
  enemyC: Map<Entity, EnemyC>;
  bulletC: Map<Entity, BulletC>;
  drawC: Map<Entity, DrawC>;
}

export function createEntity(w: World): Entity {
  const e = w.nextEntity++;
  w.alive.add(e);
  return e;
}

/** Пометить на удаление. Реальное удаление — в flushDoomed в конце шага. */
export function destroyEntity(w: World, e: Entity): void {
  w.doomed.push(e);
}

export function flushDoomed(w: World): void {
  for (const e of w.doomed) {
    w.alive.delete(e);
    w.transform.delete(e);
    w.body.delete(e);
    w.health.delete(e);
    w.playerC.delete(e);
    w.enemyC.delete(e);
    w.bulletC.delete(e);
    w.drawC.delete(e);
  }
  w.doomed.length = 0;
}

export function entityCount(w: World): number {
  return w.alive.size;
}
