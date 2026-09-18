/**
 * Физические объекты: полёт, удар и разрушение.
 * Урон считается от импульса, поэтому выдохшийся предмет уже не опасен.
 */
import { PROP_RUBBLE } from '../data/props';
import { destroyEntity, type World } from '../ecs';
import { cellCenter, damageWall, tileAtPoint, TILE_WEAK } from '../room';
import { spawnProp } from '../spawn';
import { TUNING } from '../tuning';
import { applyDamage } from './damage';

export function propSystem(w: World, dt: number): void {
  const cfg = TUNING.prop;

  for (const [e, prop] of [...w.propC]) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const health = w.health.get(e);
    if (t === undefined || b === undefined || health === undefined) continue;

    if (health.hp <= 0) {
      breakProp(w, e, prop.kind, t.x, t.y);
      continue;
    }
    if (prop.phase === 'held') continue;

    const speed = Math.hypot(b.vx, b.vy);
    if (prop.phase === 'thrown') {
      if (speed < cfg.minImpactSpeed) {
        prop.phase = 'idle';
      } else {
        strike(w, e, t.x, t.y, b.radius, prop.mass, speed);
      }
    }

    // Трение делится на массу: тяжёлое несёт дальше, лёгкое выдыхается
    // быстрее. Иначе шкаф тормозил бы раньше стула, и импульс читался
    // бы наоборот.
    if (speed > 0) {
      const drop = Math.min(speed, (cfg.friction / Math.max(0.1, prop.mass)) * dt);
      const scale = (speed - drop) / speed;
      b.vx *= scale;
      b.vy *= scale;
    }
  }
}

/** Удар брошенного предмета: по телу или по перегородке. */
function strike(
  w: World,
  e: number,
  x: number,
  y: number,
  radius: number,
  mass: number,
  speed: number,
): void {
  const prop = w.propC.get(e);
  const health = w.health.get(e);
  if (prop === undefined || health === undefined) return;
  const damage = (TUNING.prop.impulseDamage * mass * speed) / 1000;

  for (const [target] of w.staffC) {
    if (target === prop.lastHit) continue;
    const tt = w.transform.get(target);
    const tb = w.body.get(target);
    if (tt === undefined || tb === undefined) continue;
    const reach = radius + tb.radius;
    if ((x - tt.x) ** 2 + (y - tt.y) ** 2 > reach * reach) continue;
    applyDamage(w, target, damage);
    w.sounds.push('impact');
    prop.lastHit = target;
    health.hp -= TUNING.prop.impactSelfDamage;
    return;
  }

  // Перегородка впереди по ходу.
  const aheadX = x + (radius + 1) * Math.sign(w.body.get(e)?.vx ?? 0);
  const aheadY = y + (radius + 1) * Math.sign(w.body.get(e)?.vy ?? 0);
  for (const [ax, ay] of [
    [aheadX, y],
    [x, aheadY],
  ]) {
    if (tileAtPoint(w.map, ax, ay) !== TILE_WEAK) continue;
    w.sounds.push('glass');
    if (damageWall(w.map, ax, ay, damage)) {
      const cell = cellCenter(w.map, ax, ay);
      spawnProp(w, PROP_RUBBLE, cell.x, cell.y);
    }
    w.mapToken += 1;
    health.hp -= TUNING.prop.impactSelfDamage;
    prop.phase = 'idle';
    return;
  }
}

/** Предмет рассыпался. Шкаф и стул оставляют обломок, обломок — ничего. */
function breakProp(w: World, e: number, kind: string, x: number, y: number): void {
  // Порча имущества сверх нормы идёт в личное дело: сначала контора
  // закрывает глаза на breakAllowance единиц, дальше пишет взыскание.
  // Обломок ломать уже нечего — он и так следствие.
  if (kind !== PROP_RUBBLE) {
    const cfg = TUNING.record;
    w.record.broken += 1;
    if (w.record.broken > cfg.breakAllowance) {
      w.record.penalty = Math.min(cfg.penaltyMax, w.record.penalty + cfg.penaltyPerBreak);
    }
  }
  destroyEntity(w, e);
  const p = w.playerC.get(w.player);
  if (p !== undefined && p.held === e) p.held = -1;
  if (kind !== PROP_RUBBLE) spawnProp(w, PROP_RUBBLE, x, y);
}

/** Предметы расталкивают тела: шкаф — это укрытие, а не половик. */
export function propPushSystem(w: World, dt: number): void {
  for (const [e, prop] of w.propC) {
    if (prop.phase !== 'idle') continue;
    const pt = w.transform.get(e);
    const pb = w.body.get(e);
    if (pt === undefined || pb === undefined) continue;

    for (const target of [w.player, ...w.staffC.keys()]) {
      const tt = w.transform.get(target);
      const tb = w.body.get(target);
      if (tt === undefined || tb === undefined) continue;
      const dx = tt.x - pt.x;
      const dy = tt.y - pt.y;
      const dist = Math.hypot(dx, dy);
      const minDist = pb.radius + tb.radius;
      if (dist >= minDist || dist === 0) continue;
      const push = (1 - dist / minDist) * TUNING.prop.pushForce * dt;
      tt.x += (dx / dist) * push;
      tt.y += (dy / dist) * push;
    }
  }
}
