/** Жизнь снаряда: время, бетон, наведение, попадание и пробитие. */
import { PROP_RUBBLE } from '../data/props';
import { destroyEntity, type Entity, type World } from '../ecs';
import { cellCenter, damageWall, isSolidPoint, tileAtPoint, TILE_WEAK } from '../room';
import { spawnProp } from '../spawn';
import { TUNING } from '../tuning';
import { applyDamage } from './damage';
import { PROPS_BY_ID } from '../data/props';

export function bulletSystem(w: World, dt: number): void {
  for (const [e, bullet] of w.bulletC) {
    const t = w.transform.get(e);
    if (t === undefined) continue;

    bullet.life -= dt;
    if (bullet.life <= 0) {
      destroyEntity(w, e);
      continue;
    }
    if (isSolidPoint(w.map, t.x, t.y)) {
      // Перегородка не просто гасит снаряд, она от него крошится.
      if (tileAtPoint(w.map, t.x, t.y) === TILE_WEAK) {
        w.sounds.push('glass');
        if (damageWall(w.map, t.x, t.y, bullet.damage)) {
          const cell = cellCenter(w.map, t.x, t.y);
          spawnProp(w, PROP_RUBBLE, cell.x, cell.y);
        }
        w.mapToken += 1;
      }
      destroyEntity(w, e);
      continue;
    }

    const b = w.body.get(e);
    if (b === undefined) continue;

    if (bullet.homing > 0) steer(w, e, t.x, t.y, b, bullet.homing * dt);

    // Мебель — укрытие для обеих сторон. Своё удерживаемое снаряд не задевает:
    // иначе держать шкаф и стрелять было бы нельзя.
    const heldByPlayer = w.playerC.get(w.player)?.held ?? -1;
    let blocked = false;
    for (const [prop, propC] of w.propC) {
      if (propC.phase === 'held' && bullet.faction === 'player' && prop === heldByPlayer) continue;
      // Стойка с факсами пуль не держит: сквозь неё стреляют, но
      // из-за неё не видят. В этом вся её ценность.
      if (PROPS_BY_ID.get(propC.kind)?.stopsBullets === false) continue;
      // Кольцо архивариуса своим огнём не ломается: иначе его же
      // инспекторы простреливают стеллажи, окно открывается само, и
      // игроку остаётся ждать. Открывать его должен он, а не они.
      if (bullet.faction !== 'player' && w.railC.get(prop)?.owner !== undefined) continue;
      if (prop === bullet.lastHit || !hit(w, e, b.radius, prop)) continue;
      const health = w.health.get(prop);
      if (health !== undefined) {
        health.hp -= bullet.damage;
        health.flash = TUNING.feel.flashTime;
      }
      bullet.lastHit = prop;
      if (bullet.pierce <= 0) {
        destroyEntity(w, e);
        blocked = true;
        break;
      }
      bullet.pierce -= 1;
    }
    if (blocked) continue;

    if (bullet.faction === 'player') {
      // Кладовщик не воюет и урона не получает. Но выстрел в его сторону
      // он не пропустит: стол закрывается, а в дело идёт взыскание.
      let offended = false;
      for (const [clerk, clerkC] of w.clerkC) {
        if (!hit(w, e, b.radius, clerk)) continue;
        offendClerk(w, clerkC);
        destroyEntity(w, e);
        offended = true;
        break;
      }
      if (offended) continue;

      for (const [target] of w.staffC) {
        if (target === bullet.lastHit || !hit(w, e, b.radius, target)) continue;
        applyDamage(w, target, bullet.damage);
        if (bullet.pin > 0) pinTo(w, target, b.vx, b.vy, bullet.pin);
        bullet.lastHit = target;
        // Пробивающий снаряд идёт дальше, пока не выберет запас.
        if (bullet.pierce <= 0) {
          destroyEntity(w, e);
          break;
        }
        bullet.pierce -= 1;
      }
    } else if (hit(w, e, b.radius, w.player)) {
      if (applyDamage(w, w.player, bullet.damage)) destroyEntity(w, e);
    }
  }
}

/**
 * ПОДШИТЬ. Скоба пришивает сотрудника к ближайшей опоре — стене или
 * мебели — по ходу своего полёта.
 *
 * Опора ищется вперёд по направлению снаряда, а не по сторонам: иначе
 * сотрудника дёргало бы назад, к стене за спиной, и выстрел читался бы
 * как притяжение. Не нашлось опоры — он всё равно стоит: скоба держит,
 * просто упереть её не во что.
 */
function pinTo(w: World, target: Entity, vx: number, vy: number, time: number): void {
  const staff = w.staffC.get(target);
  const t = w.transform.get(target);
  const b = w.body.get(target);
  if (staff === undefined || t === undefined || b === undefined) return;
  staff.pinned = Math.max(staff.pinned, time);
  staff.frozen = Math.max(staff.frozen, time);
  b.vx = 0;
  b.vy = 0;

  const len = Math.hypot(vx, vy);
  if (len === 0) return;
  const dirX = vx / len;
  const dirY = vy / len;
  const reach = Math.max(0, TUNING.weapon.staple.pinReach);
  const step = Math.max(2, b.radius / 2);
  // Идём вперёд до первой опоры и останавливаемся вплотную перед ней.
  let lastX = t.x;
  let lastY = t.y;
  for (let d = step; d <= reach; d += step) {
    const x = t.x + dirX * d;
    const y = t.y + dirY * d;
    if (isSolidPoint(w.map, x + dirX * b.radius, y + dirY * b.radius) || propAt(w, x, y, b.radius)) {
      t.x = lastX;
      t.y = lastY;
      t.px = lastX;
      t.py = lastY;
      w.sounds.push('impact');
      return;
    }
    lastX = x;
    lastY = y;
  }
}

/** Есть ли мебель в этой точке: к ней пришивают так же, как к стене. */
function propAt(w: World, x: number, y: number, radius: number): boolean {
  for (const [prop, propC] of w.propC) {
    if (propC.phase !== 'idle') continue;
    const t = w.transform.get(prop);
    const b = w.body.get(prop);
    if (t === undefined || b === undefined) continue;
    const reach = radius + b.radius;
    if ((t.x - x) ** 2 + (t.y - y) ** 2 <= reach * reach) return true;
  }
  return false;
}

/**
 * Кладовщик оформляет протокол: стол закрыт до конца забега, в деле
 * взыскание. Стрелять в того, кто тебя обслуживает, — нарушение
 * процедуры, и контора это заметит.
 */
function offendClerk(w: World, clerk: { offended: boolean; noteTime: number }): void {
  clerk.noteTime = TUNING.clerk.noteTime;
  if (clerk.offended) return;
  clerk.offended = true;
  w.deskOffended = true;
  w.record.penalty = Math.min(
    TUNING.record.penaltyMax,
    w.record.penalty + Math.max(0, Math.round(TUNING.clerk.offencePenalty)),
  );
  w.sounds.push('fan');
}

/** Доворот на ближайшего сотрудника, не быстрее заданного угла за шаг. */
function steer(
  w: World,
  bulletEntity: Entity,
  x: number,
  y: number,
  b: { vx: number; vy: number },
  maxTurn: number,
): void {
  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;
  for (const [target] of w.staffC) {
    if (target === w.bulletC.get(bulletEntity)?.lastHit) continue;
    const t = w.transform.get(target);
    if (t === undefined) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist >= bestDist) continue;
    bestDist = dist;
    bestX = dx;
    bestY = dy;
  }
  if (bestDist === Infinity) return;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed === 0) return;
  const current = Math.atan2(b.vy, b.vx);
  const wanted = Math.atan2(bestY, bestX);
  let delta = wanted - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
  const next = current + turn;
  b.vx = Math.cos(next) * speed;
  b.vy = Math.sin(next) * speed;
}

function hit(w: World, bulletEntity: number, bulletRadius: number, target: number): boolean {
  const bt = w.transform.get(bulletEntity);
  const tt = w.transform.get(target);
  const tb = w.body.get(target);
  if (bt === undefined || tt === undefined || tb === undefined) return false;
  const reach = bulletRadius + tb.radius;
  return (bt.x - tt.x) ** 2 + (bt.y - tt.y) ** 2 <= reach * reach;
}
