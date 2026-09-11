/** Фабрики сущностей: набор компонентов и ничего больше. */
import { POSTS_BY_ID, POST_INSPECTOR, POST_INTERN, POST_REGISTRAR } from './data/posts';
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
    default:
      return TUNING.post.inspector;
  }
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
    color: PALETTE.concreteLight,
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
    plateFlash: 0,
  });
  w.drawC.set(e, {
    shape: 'square',
    size: numbers.radius,
    color: PALETTE.red,
    hollow: spec !== undefined && spec.fill === 'hollow',
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

  staff.post = post;
  staff.title = spec === undefined ? post.toUpperCase() : spec.title;
  staff.plateMarks = spec === undefined ? 0 : spec.plateMarks;
  staff.plateFlash = 0;
  health.hp = numbers.hp;
  health.max = numbers.hp;
  body.radius = numbers.radius;
  draw.size = numbers.radius;
  draw.hollow = spec !== undefined && spec.fill === 'hollow';
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
    lastHit: -1,
  });
  w.drawC.set(e, {
    shape: 'square',
    size: numbers.radius,
    color: PALETTE.concreteMid,
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
    color: faction === 'player' ? PALETTE.yellow : PALETTE.red,
    hollow: false,
    desk: false,
  });
  return e;
}
