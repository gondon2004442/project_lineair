/**
 * Телекинез: ПКМ поднимает ближайший объект, отпускание — бросает.
 * Держать стоит энергии; кончилась — предмет падает.
 */
import type { Entity, PlayerC, PropC, World } from '../ecs';
import { propNumbers } from '../spawn';
import { TUNING } from '../tuning';

export function telekinesisSystem(w: World, dt: number): void {
  const p = w.playerC.get(w.player);
  const pt = w.transform.get(w.player);
  if (p === undefined || pt === undefined) return;

  const cfg = TUNING.telekinesis;
  const max = cfg.energyMax;

  if (w.status === 'dead') {
    if (p.held >= 0) release(w, p, false);
    return;
  }

  // --- Удержание ---
  if (p.held >= 0) {
    const prop = w.propC.get(p.held);
    const t = w.transform.get(p.held);
    const b = w.body.get(p.held);
    if (prop === undefined || t === undefined || b === undefined) {
      p.held = -1;
    } else {
      spend(p, cfg.holdDrain * dt);
      if (p.energy <= 0 || !w.input.grabHeld) {
        release(w, p, w.input.grabHeld ? false : true);
      } else {
        p.grabTime += dt;
        const targetX = pt.x + p.aimX * cfg.holdDistance;
        const targetY = pt.y + p.aimY * cfg.holdDistance;
        // Тянем к точке удержания, а не телепортируем: видно инерцию.
        const pull = Math.min(1, cfg.holdPull * dt);
        t.x += (targetX - t.x) * pull;
        t.y += (targetY - t.y) * pull;
        b.vx = 0;
        b.vy = 0;
        prop.lastHit = -1;
      }
    }
  } else if (w.input.grabHeld && p.energy >= cfg.grabCost) {
    const target = nearestProp(w, pt.x, pt.y, cfg.grabRange);
    if (target >= 0) {
      const prop = w.propC.get(target);
      if (prop !== undefined) {
        // Поднятое набок укрытие снова становится обычным предметом.
        if (prop.phase === 'cover') uncover(w, target);
        prop.phase = 'held';
        prop.lastHit = -1;
        p.held = target;
        p.grabTime = 0;
        w.sounds.push('grab');
        spend(p, cfg.grabCost);
        const gt = w.transform.get(target);
        if (gt !== undefined) warp(w, gt.x, gt.y, cfg.grabWarp);
      }
    }
  }

  // --- Энергия ---
  if (p.energyDelay > 0) {
    p.energyDelay = Math.max(0, p.energyDelay - dt);
  } else if (p.held < 0) {
    p.energy = Math.min(max, p.energy + cfg.energyRegen * dt);
  }
  p.energy = Math.max(0, Math.min(max, p.energy));
}

function spend(p: PlayerC, amount: number): void {
  p.energy -= amount;
  p.energyDelay = TUNING.telekinesis.energyRegenDelay;
}

/** Отпустить удерживаемое: броском или просто уронив. */
function release(w: World, p: PlayerC, thrown: boolean): void {
  const prop = w.propC.get(p.held);
  const b = w.body.get(p.held);
  const thrownEntity = p.held;
  const quick = p.grabTime < TUNING.telekinesis.tapTime;
  p.held = -1;
  p.grabTime = 0;
  if (prop === undefined || b === undefined) return;

  // Короткое нажатие: предмет ложится набок и становится укрытием.
  // Держал дольше — значит целился, и это бросок.
  if (thrown && quick) {
    cover(w, thrownEntity, prop, b);
    return;
  }

  if (!thrown) {
    prop.phase = 'idle';
    b.vx = 0;
    b.vy = 0;
    return;
  }
  const speed = TUNING.telekinesis.throwSpeed * propNumbers(prop.kind).speedFactor;
  w.sounds.push('throw');
  const tt = w.transform.get(thrownEntity);
  if (tt !== undefined) warp(w, tt.x, tt.y, TUNING.telekinesis.throwWarp);
  prop.phase = 'thrown';
  prop.lastHit = -1;
  b.vx = p.aimX * speed;
  b.vy = p.aimY * speed;
}

/**
 * Положить набок. Укрытие шире обычного предмета, держит свой запас
 * попаданий и не сдвигается телами — стоит там, куда поставили.
 */
function cover(w: World, e: Entity, prop: PropC, b: { vx: number; vy: number; radius: number }): void {
  const cfg = TUNING.prop;
  prop.phase = 'cover';
  prop.lastHit = -1;
  b.vx = 0;
  b.vy = 0;
  b.radius = propNumbers(prop.kind).radius * cfg.coverWidth;
  const health = w.health.get(e);
  if (health !== undefined) {
    health.max = cfg.coverHits;
    health.hp = cfg.coverHits;
  }
  const draw = w.drawC.get(e);
  if (draw !== undefined) draw.size = b.radius;
  w.sounds.push('impact');
}

/** Поднял укрытие — оно снова обычный предмет со своим габаритом. */
function uncover(w: World, e: Entity): void {
  const prop = w.propC.get(e);
  const b = w.body.get(e);
  if (prop === undefined || b === undefined) return;
  const numbers = propNumbers(prop.kind);
  b.radius = numbers.radius;
  const draw = w.drawC.get(e);
  if (draw !== undefined) draw.size = numbers.radius;
  const health = w.health.get(e);
  if (health !== undefined) {
    health.max = numbers.hp;
    health.hp = Math.min(health.hp, numbers.hp);
  }
}

/** Короткая волна в точке: её рисует фильтр, симуляция только помечает. */
function warp(w: World, x: number, y: number, power: number): void {
  w.fx.warpTime = TUNING.telekinesis.warpTime;
  w.fx.warpX = x;
  w.fx.warpY = y;
  w.fx.warpPower = power;
}

function nearestProp(w: World, x: number, y: number, range: number): Entity {
  let best = -1;
  let bestDist = range;
  for (const [e, prop] of w.propC) {
    if (prop.phase === 'held') continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const dist = Math.hypot(t.x - x, t.y - y);
    if (dist >= bestDist) continue;
    bestDist = dist;
    best = e;
  }
  return best;
}

/** Что подсветить как цель захвата, когда ничего не держим. */
export function grabCandidate(w: World): Entity {
  const p = w.playerC.get(w.player);
  const pt = w.transform.get(w.player);
  if (p === undefined || pt === undefined || p.held >= 0) return -1;
  if (p.energy < TUNING.telekinesis.grabCost) return -1;
  return nearestProp(w, pt.x, pt.y, TUNING.telekinesis.grabRange);
}
