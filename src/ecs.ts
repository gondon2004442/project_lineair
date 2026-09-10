/**
 * Мини-ECS. Компоненты — плоские структуры без методов,
 * системы — функции над World. Никакой логики в сущностях.
 */
import type { Floor } from './floor';
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

/** Общее для всякого сотрудника: какую ставку он занимает. */
export interface StaffC {
  post: string;
  title: string;
  /** Меньше — раньше закрывают вакансию. */
  priority: number;
  /** Насечек на табличке. */
  plateMarks: number;
  /** Пока > 0 — табличка светится: телеграф. */
  plateFlash: number;
}

export type InternPhase = 'route' | 'promotion';

export interface InternC {
  phase: InternPhase;
  /** Куда идёт сейчас. */
  targetX: number;
  targetY: number;
  /** Пауза на точке или обратный отсчёт переназначения. */
  timer: number;
  /** На какую должность его переводят. */
  promoteTo: string;
}

export interface InspectorC {
  /** Ось движения: 0 — по горизонтали, 1 — по вертикали. */
  axis: 0 | 1;
  /** Куда стреляет: единичный вектор, зафиксированный на такте. */
  aimX: number;
  aimY: number;
  /** Сколько выстрелов осталось в текущем такте. */
  shotsLeft: number;
  /** Обратный отсчёт до следующего выстрела внутри такта. */
  shotTimer: number;
}

export type RegistrarPhase = 'idle' | 'windup' | 'fan';

export interface RegistrarC {
  phase: RegistrarPhase;
  timer: number;
  /** Обратный отсчёт до следующего приказа о закрытии ставки. */
  orderTimer: number;
  /** Обратный отсчёт добора со стороны. */
  hireTimer: number;
  /** Сколько человек уже добрано на этом участке. */
  hired: number;
}

/** Строка штатного расписания участка в работе. */
export interface RosterEntry {
  post: string;
  title: string;
  priority: number;
  quota: number;
  /** Пересчитывается каждый шаг по живым сотрудникам. */
  occupied: number;
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
  /** Контур вместо заливки. */
  hollow: boolean;
  /** Стол под телом. */
  desk: boolean;
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
  floor: Floor;
  /** Индекс текущего помещения на этаже. */
  room: number;
  map: TileMap;
  /** Растёт при любой перестройке карты: рендеру пора перерисовать бетон. */
  mapToken: number;
  input: InputSnapshot;
  fx: Feedback;
  status: RunStatus;
  player: Entity;
  /** Штатное расписание текущего участка. */
  roster: RosterEntry[];
  /** Общий метроном участка: по его долям бьют инспекторы. */
  metronome: number;
  /** Такт, на котором сейчас участок. */
  beat: number;

  nextEntity: Entity;
  alive: Set<Entity>;
  doomed: Entity[];

  transform: Map<Entity, Transform>;
  body: Map<Entity, Body>;
  health: Map<Entity, Health>;
  playerC: Map<Entity, PlayerC>;
  staffC: Map<Entity, StaffC>;
  internC: Map<Entity, InternC>;
  inspectorC: Map<Entity, InspectorC>;
  registrarC: Map<Entity, RegistrarC>;
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
    w.staffC.delete(e);
    w.internC.delete(e);
    w.inspectorC.delete(e);
    w.registrarC.delete(e);
    w.bulletC.delete(e);
    w.drawC.delete(e);
  }
  w.doomed.length = 0;
}

export function entityCount(w: World): number {
  return w.alive.size;
}
