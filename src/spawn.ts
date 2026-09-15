/** Фабрики сущностей: набор компонентов и ничего больше. */
import {
  POSTS_BY_ID,
  POST_AUDITOR,
  POST_CHIEF,
  POST_COURIER,
  POST_INSPECTOR,
  POST_INTERN,
  POST_REGISTRAR,
} from './data/posts';
import { PROPS_BY_ID, PROP_CABINET, PROP_RUBBLE } from './data/props';
import { WEAPON_FORMS } from './data/weaponForms';
import { createEntity, type Entity, type Faction, type Shape, type World } from './ecs';
import { PALETTE } from './palette';
import { TUNING } from './tuning';

/** Числа должности. Опознание берётся из данных, поведение — отсюда. */
export interface PostNumbers {
  hp: number;
  radius: number;
}

export function postNumbers(post: string): PostNumbers {
  switch (post) {
    case POST_INTERN:
      return TUNING.post.intern;
    case POST_REGISTRAR:
      return TUNING.post.registrar;
    case POST_AUDITOR:
      return TUNING.post.auditor;
    case POST_CHIEF:
      return TUNING.post.chief;
    case POST_COURIER:
      return TUNING.post.courier;
    default:
      return TUNING.post.inspector;
  }
}

/**
 * Оттенок по остатку кожи. Шкала бетона из дизайн-документа:
 * чем меньше кожи, тем ближе к бетону, тем выше должность.
 */
export function skinShade(skin: number): number {
  if (skin >= 80) return PALETTE.concrete100;
  if (skin >= 60) return PALETTE.concrete300;
  if (skin >= 40) return PALETTE.concrete500;
  if (skin >= 20) return PALETTE.concrete700;
  return PALETTE.concrete900;
}

export function spawnPlayer(w: World, x: number, y: number): Entity {
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: 0, vy: 0, radius: TUNING.player.radius });
  w.health.set(e, { hp: TUNING.player.maxHp, max: TUNING.player.maxHp, iframes: 0, flash: 0 });
  w.playerC.set(e, {
    aimX: 1,
    aimY: 0,
    phase: 'normal',
    fireCooldown: 0,
    form: 0,
    switchCooldown: 0,
    ammo: WEAPON_FORMS.map((form) => Math.max(1, Math.round(TUNING.weapon[form.id].ammoMax))),
    reloading: false,
    reloadTimer: 0,
    charge: 0,
    queued: 0,
    queueTimer: 0,
    energy: TUNING.telekinesis.energyMax,
    energyDelay: 0,
    held: -1,
    dashTime: 0,
    dashCooldown: 0,
    dashX: 1,
    dashY: 0,
  });
  w.drawC.set(e, {
    shape: 'square',
    size: TUNING.player.radius,
    // Красный — только субъект. Это единственное красное пятно на экране.
    color: PALETTE.red,
    hollow: false,
    desk: false,
  });
  return e;
}

/** Занять ставку: сотрудник с общей частью и поведением своей должности. */
export function spawnStaff(w: World, post: string, priority: number, x: number, y: number): Entity {
  const spec = POSTS_BY_ID.get(post);
  const numbers = postNumbers(post);
  const e = createEntity(w);

  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: 0, vy: 0, radius: numbers.radius });
  w.health.set(e, { hp: numbers.hp, max: numbers.hp, iframes: 0, flash: 0 });
  w.staffC.set(e, {
    post,
    title: spec === undefined ? post.toUpperCase() : spec.title,
    priority,
    plateMarks: spec === undefined ? 0 : spec.plateMarks,
    plates: spec === undefined ? 1 : spec.plates,
    skin: spec === undefined ? 50 : spec.skin,
    silhouette: spec === undefined ? 'sunken' : spec.silhouette,
    plateFlash: 0,
  });
  w.drawC.set(e, {
    shape: 'square',
    size: numbers.radius,
    // Цвет сотрудника — это его заражение, а не должность как таковая.
    color: skinShade(spec === undefined ? 50 : spec.skin),
    hollow: false,
    desk: spec !== undefined && spec.desk,
  });
  attachBehaviour(w, e, post, x, y);
  return e;
}

/** Переназначить сотрудника на другую должность, не пересоздавая его. */
export function reassign(w: World, e: Entity, post: string): void {
  const spec = POSTS_BY_ID.get(post);
  const staff = w.staffC.get(e);
  const numbers = postNumbers(post);
  const health = w.health.get(e);
  const body = w.body.get(e);
  const draw = w.drawC.get(e);
  const t = w.transform.get(e);
  if (staff === undefined || health === undefined || body === undefined || draw === undefined) return;

  w.internC.delete(e);
  w.inspectorC.delete(e);
  w.registrarC.delete(e);
  w.auditorC.delete(e);
  w.chiefC.delete(e);
  w.courierC.delete(e);

  // Получил новое назначение — замер. Иначе стажёр доносил бы свой
  // диагональный разгон в должность, которая ходит только по осям.
  body.vx = 0;
  body.vy = 0;

  staff.post = post;
  staff.title = spec === undefined ? post.toUpperCase() : spec.title;
  staff.plateMarks = spec === undefined ? 0 : spec.plateMarks;
  staff.plates = spec === undefined ? 1 : spec.plates;
  staff.skin = spec === undefined ? 50 : spec.skin;
  staff.silhouette = spec === undefined ? 'sunken' : spec.silhouette;
  staff.plateFlash = 0;
  // Доля прочности переносится: иначе переназначение работало бы лечением,
  // и Заведующий чинил бы подчинённых перетасовкой.
  const ratio = health.max > 0 ? health.hp / health.max : 1;
  health.max = numbers.hp;
  health.hp = Math.max(1, Math.round(numbers.hp * Math.max(0, Math.min(1, ratio))));
  body.radius = numbers.radius;
  draw.size = numbers.radius;
  draw.color = skinShade(spec === undefined ? 50 : spec.skin);
  draw.hollow = false;
  draw.desk = spec !== undefined && spec.desk;
  attachBehaviour(w, e, post, t === undefined ? 0 : t.x, t === undefined ? 0 : t.y);
}

function attachBehaviour(w: World, e: Entity, post: string, x: number, y: number): void {
  switch (post) {
    case POST_INTERN:
      w.internC.set(e, {
        phase: 'route',
        targetX: x,
        targetY: y,
        timer: 0,
        promoteTo: POST_INSPECTOR,
      });
      break;
    case POST_COURIER:
      w.courierC.set(e, {
        phase: 'run',
        door: -1,
        timer: TUNING.post.courier.deliverTime,
        approachTimer: TUNING.post.courier.reachTimeout,
      });
      break;
    case POST_CHIEF:
      w.chiefC.set(e, {
        phase: 'hold',
        ringTimer: TUNING.post.chief.ringInterval,
        twist: 0,
        reshuffleTimer: TUNING.post.chief.reshuffleInterval,
      });
      break;
    case POST_AUDITOR:
      w.auditorC.set(e, {
        phase: 'audit',
        target: -1,
        timer: 0,
        approachTimer: TUNING.post.auditor.reachTimeout,
        shotTimer: TUNING.post.auditor.shotInterval,
      });
      break;
    case POST_REGISTRAR:
      w.registrarC.set(e, {
        phase: 'idle',
        timer: TUNING.post.registrar.fanInterval,
        orderTimer: TUNING.post.registrar.orderInterval,
        hireTimer: 0,
        hired: 0,
      });
      break;
    default:
      w.inspectorC.set(e, { axis: 0, aimX: 1, aimY: 0, shotsLeft: 0, shotTimer: 0 });
      break;
  }
}

/** Числа предмета: прочность, размер, масса, разгон при броске. */
export interface PropNumbers {
  radius: number;
  hp: number;
  mass: number;
  speedFactor: number;
}

export function propNumbers(kind: string): PropNumbers {
  switch (kind) {
    case PROP_CABINET:
      return TUNING.prop.cabinet;
    case PROP_RUBBLE:
      return TUNING.prop.rubble;
    default:
      return TUNING.prop.chair;
  }
}

/** Мебель офисного кита: кресло в обивке, стеллаж из тёмного дуба, обломок бетона. */
function propShade(kind: string): number {
  switch (kind) {
    case PROP_CABINET:
      return PALETTE.woodDark;
    case PROP_RUBBLE:
      return PALETTE.concrete500;
    default:
      return PALETTE.fabric;
  }
}

export function spawnProp(w: World, kind: string, x: number, y: number): Entity {
  const spec = PROPS_BY_ID.get(kind);
  const numbers = propNumbers(kind);
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: 0, vy: 0, radius: numbers.radius });
  w.health.set(e, { hp: numbers.hp, max: numbers.hp, iframes: 0, flash: 0 });
  w.propC.set(e, {
    kind,
    title: spec === undefined ? kind.toUpperCase() : spec.title,
    phase: 'idle',
    mass: numbers.mass,
    audited: false,
    lastHit: -1,
  });
  w.drawC.set(e, {
    shape: 'square',
    size: numbers.radius,
    color: propShade(kind),
    hollow: spec !== undefined && spec.hollow,
    desk: false,
  });
  return e;
}

/** Спецификация снаряда: у каждого стрелка своя. */
export interface BulletSpec {
  speed: number;
  radius: number;
  damage: number;
  life: number;
  /** Сколько тел пробивает. */
  pierce?: number;
  /** Доворот на цель, радиан в секунду. */
  homing?: number;
  shape?: Shape;
}

export function spawnBullet(
  w: World,
  faction: Faction,
  spec: BulletSpec,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
): Entity {
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: dirX * spec.speed, vy: dirY * spec.speed, radius: spec.radius });
  w.bulletC.set(e, {
    faction,
    damage: spec.damage,
    life: spec.life,
    pierce: spec.pierce ?? 0,
    homing: spec.homing ?? 0,
    lastHit: -1,
  });
  w.drawC.set(e, {
    shape: spec.shape ?? (faction === 'player' ? 'dot' : 'diamond'),
    size: spec.radius,
    // Снаряды субъекта красные — это его красный. Со стороны объекта
    // летят бумаги: картотечные карточки и предписания.
    color: faction === 'player' ? PALETTE.red : PALETTE.paper,
    hollow: false,
    desk: false,
  });
  return e;
}
