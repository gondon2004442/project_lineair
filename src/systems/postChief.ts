/**
 * Заведующий сектором. Дальше его приёмной этажа нет.
 *
 * Два инструмента: циркуляр — кольцо снарядов во все стороны,
 * и право переназначения — на ходу меняет должности подчинённых.
 * Заученный набор паттернов посреди боя перетасовывается: только что
 * ты считал такты трёх инспекторов, а теперь их двое и один стажёр.
 */
import { POST_INSPECTOR, POST_INTERN } from '../data/posts';
import type { Entity, World } from '../ecs';
import { reassign, spawnBullet } from '../spawn';
import { DEG, TUNING } from '../tuning';
import { approach } from './staff';

export function chiefSystem(w: World, dt: number): void {
  const pt = w.transform.get(w.player);
  const alive = pt !== undefined && w.status !== 'dead';
  const cfg = TUNING.post.chief;

  for (const [e, chief] of w.chiefC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;

    let desiredVx = 0;
    let desiredVy = 0;

    if (alive && pt !== undefined) {
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      let step = 0;
      if (dist > cfg.standoff) step = 1;
      else if (dist < cfg.standoff * cfg.backoffRatio) step = -1;
      desiredVx = (dx / dist) * cfg.speed * step;
      desiredVy = (dy / dist) * cfg.speed * step;

      // --- Циркуляр ---
      chief.ringTimer -= dt;
      if (chief.ringTimer <= cfg.ringTelegraph) {
        chief.phase = 'windup';
        staff.plateFlash = cfg.ringTelegraph;
      }
      if (chief.ringTimer <= 0) {
        w.sounds.push('ring');
        fireRing(w, e, t.x, t.y, b.radius, chief.twist);
        chief.twist += cfg.ringTwistDeg * DEG;
        chief.ringTimer = cfg.ringInterval;
        chief.phase = 'hold';
      }

      // --- Право переназначения ---
      chief.reshuffleTimer -= dt;
      if (chief.reshuffleTimer <= cfg.reshuffleTelegraph) staff.plateFlash = cfg.reshuffleTelegraph;
      if (chief.reshuffleTimer <= 0) {
        chief.reshuffleTimer = cfg.reshuffleInterval;
        reshuffle(w, Math.max(0, Math.round(cfg.reshuffleCount)));
      }
    }

    const moving = desiredVx !== 0 || desiredVy !== 0;
    const rate = (moving ? cfg.accel : cfg.friction) * dt;
    b.vx = approach(b.vx, desiredVx, rate);
    b.vy = approach(b.vy, desiredVy, rate);
  }
}

function fireRing(w: World, owner: Entity, x: number, y: number, radius: number, twist: number): void {
  const cfg = TUNING.post.chief;
  const count = Math.max(3, Math.round(cfg.ringCount));
  for (let i = 0; i < count; i++) {
    const angle = twist + (i / count) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const muzzle = radius + TUNING.enemyBullet.radius;
    spawnBullet(w, 'enemy', TUNING.enemyBullet, x + dirX * muzzle, y + dirY * muzzle, dirX, dirY, owner);
  }
}

/**
 * Перетасовка. Трогает только рядовых: понижать старшую должность
 * Заведующий не стал бы, да и тактика «выбей старшего» от этого поплыла бы.
 */
function reshuffle(w: World, count: number): void {
  if (count <= 0) return;
  const ranks: Entity[] = [];
  for (const [e, staff] of w.staffC) {
    if (staff.post === POST_INTERN || staff.post === POST_INSPECTOR) ranks.push(e);
  }
  if (ranks.length === 0) return;

  for (let i = 0; i < count; i++) {
    const pick = ranks[w.rng.int(ranks.length)];
    if (pick === undefined) continue;
    const staff = w.staffC.get(pick);
    if (staff === undefined) continue;
    const next = staff.post === POST_INTERN ? POST_INSPECTOR : POST_INTERN;
    reassign(w, pick, next);
    const after = w.staffC.get(pick);
    if (after !== undefined) after.plateFlash = TUNING.post.chief.reshuffleTelegraph;
  }
}

/** Есть ли на участке живой Заведующий. */
export function hasChief(w: World): boolean {
  return w.chiefC.size > 0;
}
