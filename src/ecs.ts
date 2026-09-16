/**
 * Мини-ECS. Компоненты — плоские структуры без методов,
 * системы — функции над World. Никакой логики в сущностях.
 */
import type { Floor } from './floor';
import type { Rng } from './rng';
import type { TileMap } from './room';
import type { InputSnapshot } from './input';
import { profiler } from './profiler';

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
  /** Индекс текущей формы оружия в WEAPON_FORMS. */
  form: number;
  /** Пауза после переключения формы. */
  switchCooldown: number;
  /** Патроны в обойме каждой формы. Обоймы не общие. */
  ammo: number[];
  /** Идёт ли перезарядка текущей формы и сколько ей осталось. */
  reloading: boolean;
  reloadTimer: number;
  /** Накопленный заряд зарядной формы, секунды. */
  charge: number;
  /** Сколько снарядов залпа осталось выпустить и когда следующий. */
  queued: number;
  queueTimer: number;
  /** Телекинез: запас энергии, пауза до восполнения и что сейчас держим. */
  energy: number;
  energyDelay: number;
  held: Entity;
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
  /** Сколько табличек на груди. */
  plates: number;
  /** Сколько процентов кожи осталось: отсюда оттенок бетона. */
  skin: number;
  /** Форма силуэта. */
  silhouette: string;
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

export type CourierPhase = 'run' | 'deliver';

export interface CourierC {
  phase: CourierPhase;
  /** Сторона, к двери которой бежит. -1 — цели нет. */
  door: number;
  /** Обратный отсчёт вызова у двери. */
  timer: number;
  /** Сколько ещё пытается дойти до выбранной двери. */
  approachTimer: number;
}

export type ChiefPhase = 'hold' | 'windup';

export interface ChiefC {
  phase: ChiefPhase;
  /** Обратный отсчёт до циркуляра. */
  ringTimer: number;
  /** На сколько провёрнуто следующее кольцо. */
  twist: number;
  /** Обратный отсчёт до переназначения подчинённых. */
  reshuffleTimer: number;
}

export type AuditorPhase = 'audit' | 'open' | 'shot';

export interface AuditorC {
  /** Пока 'audit' — урон по Ревизору не проходит. */
  phase: AuditorPhase;
  /** Что описывает сейчас. */
  target: Entity;
  /** Обратный отсчёт описи предмета или окна уязвимости. */
  timer: number;
  /** Сколько ещё пытаться дойти до текущего предмета. */
  approachTimer: number;
  /** Обратный отсчёт до следующего предписания. */
  shotTimer: number;
}

export type PropPhase = 'idle' | 'held' | 'thrown';

/** Физический объект участка: стул, шкаф, бетонный обломок. */
export interface PropC {
  kind: string;
  title: string;
  phase: PropPhase;
  mass: number;
  /** Внесён ли предмет в текущую опись Ревизора. */
  audited: boolean;
  /** Кого уже задел в этом полёте: одно тело — один удар. */
  lastHit: Entity;
}

export interface BulletC {
  faction: Faction;
  damage: number;
  life: number;
  /** Сколько ещё тел пробьёт, прежде чем погаснуть. */
  pierce: number;
  /** Скорость доворота на цель, радиан в секунду. 0 — не наводится. */
  homing: number;
  /** Кого уже зацепил: пробивающий снаряд не бьёт одного дважды. */
  lastHit: Entity;
}

/**
 * Формы снарядов и силуэтов. 'card' — картотечная карточка: только
 * снаряды объекта, и ни одна форма субъекта с ней не совпадает.
 */
export type Shape = 'square' | 'diamond' | 'dot' | 'bar' | 'card';

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

/** Где мы: в вестибюле или на этаже. */
export type Scene = 'lobby' | 'run';

export interface Feedback {
  shake: number;
  hitstop: number;
  /** Замедление хода: сколько шагов симуляции ещё идти медленно. */
  slowMo: number;
  /** Кольцо аннулирования: остаток жизни и где оно вспыхнуло. */
  blankTime: number;
  blankX: number;
  blankY: number;
  /** Точечная волна телекинеза: захват и бросок. */
  warpTime: number;
  warpX: number;
  warpY: number;
  warpPower: number;
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
  /**
   * Что прозвучало на этом шаге. Системы складывают сюда имена событий,
   * точка входа раз в кадр отдаёт их звуку и очищает. Симуляция про
   * сам звук не знает, поэтому детерминизм им не задет.
   */
  sounds: string[];
  status: RunStatus;
  scene: Scene;
  player: Entity;
  /** Штатное расписание текущего участка. */
  roster: RosterEntry[];
  /** Выданные предметы: правки к параметрам оружия. */
  build: string[];
  /** Сколько бланков на руках. Ресурс субъекта, а не сущность. */
  blanks: number;
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
  auditorC: Map<Entity, AuditorC>;
  chiefC: Map<Entity, ChiefC>;
  courierC: Map<Entity, CourierC>;
  propC: Map<Entity, PropC>;
  bulletC: Map<Entity, BulletC>;
  drawC: Map<Entity, DrawC>;
}

export function createEntity(w: World): Entity {
  const e = w.nextEntity++;
  w.alive.add(e);
  profiler.countSpawn(1);
  return e;
}

/** Пометить на удаление. Реальное удаление — в flushDoomed в конце шага. */
export function destroyEntity(w: World, e: Entity): void {
  w.doomed.push(e);
}

export function flushDoomed(w: World): void {
  profiler.countDestroy(w.doomed.length);
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
    w.auditorC.delete(e);
    w.chiefC.delete(e);
    w.courierC.delete(e);
    w.propC.delete(e);
    w.bulletC.delete(e);
    w.drawC.delete(e);
  }
  w.doomed.length = 0;
}

export function entityCount(w: World): number {
  return w.alive.size;
}
