/**
 * Ревизор. Ведёт опись имущества участка и, пока опись не закончена,
 * неуязвим. Опись закончилась — он открыт на время окна, потом
 * начинает сначала.
 *
 * Отсюда вся тактика: ломай мебель быстрее, чем он её описывает.
 * Но осторожно — разбитый шкаф оставляет обломок, а это новая строка
 * описи. Ломать надо впереди Ревизора, а не позади.
 */
import type { Entity, World } from '../ecs';
import { spawnBullet } from '../spawn';
import { TUNING } from '../tuning';
import { approach } from './staff';

export function auditorSystem(w: World, dt: number): void {
  const pt = w.transform.get(w.player);
  const playerAlive = pt !== undefined && w.status !== 'dead';
  const cfg = TUNING.post.auditor;

  for (const [e, auditor] of w.auditorC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;

    let desiredVx = 0;
    let desiredVy = 0;

    if (auditor.phase === 'open') {
      auditor.timer -= dt;
      if (auditor.timer <= 0) {
        // Новый цикл: опись начинается с чистого листа.
        for (const [, prop] of w.propC) prop.audited = false;
        auditor.phase = 'audit';
        auditor.target = -1;
      }
    } else {
      let target = auditor.target;
      if (w.propC.get(target) === undefined) {
        target = nextItem(w, t.x, t.y);
        auditor.approachTimer = cfg.reachTimeout;
      }
      auditor.target = target;

      if (target < 0) {
        // Описывать нечего — опись закончена, Ревизор открыт.
        auditor.phase = 'open';
        auditor.timer = cfg.openTime;
        auditor.target = -1;
      } else {
        const tt = w.transform.get(target);
        if (tt === undefined) {
          auditor.target = -1;
        } else {
          const dx = tt.x - t.x;
          const dy = tt.y - t.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > cfg.reach) {
            auditor.timer = cfg.inventoryTime;
            desiredVx = (dx / dist) * cfg.speed;
            desiredVy = (dy / dist) * cfg.speed;
            // Дойти не вышло — Ревизор вносит предмет издалека и идёт дальше.
            auditor.approachTimer -= dt;
            if (auditor.approachTimer <= 0) {
              const stuck = w.propC.get(target);
              if (stuck !== undefined) stuck.audited = true;
              auditor.target = -1;
            }
          } else {
            auditor.timer -= dt;
            staff.plateFlash = cfg.inventoryTime;
            if (auditor.timer <= 0) {
              const prop = w.propC.get(target);
              if (prop !== undefined) prop.audited = true;
              auditor.target = -1;
              auditor.timer = cfg.inventoryTime;
            }
          }
        }
      }
    }

    // Предписание: редкий одиночный выстрел, чтобы Ревизор не был мебелью.
    if (playerAlive && pt !== undefined) {
      auditor.shotTimer -= dt;
      if (auditor.shotTimer <= cfg.shotTelegraph) staff.plateFlash = cfg.shotTelegraph;
      if (auditor.shotTimer <= 0) {
        auditor.shotTimer = cfg.shotInterval;
        const dx = pt.x - t.x;
        const dy = pt.y - t.y;
        const len = Math.hypot(dx, dy) || 1;
        const muzzle = b.radius + TUNING.enemyBullet.radius;
        spawnBullet(
          w,
          'enemy',
          TUNING.enemyBullet,
          t.x + (dx / len) * muzzle,
          t.y + (dy / len) * muzzle,
          dx / len,
          dy / len,
          e,
        );
      }
    }

    const moving = desiredVx !== 0 || desiredVy !== 0;
    const rate = (moving ? cfg.accel : cfg.friction) * dt;
    b.vx = approach(b.vx, desiredVx, rate);
    b.vy = approach(b.vy, desiredVy, rate);
  }
}

/** Ближайшая невнесённая строка описи. */
function nextItem(w: World, x: number, y: number): Entity {
  let best = -1;
  let bestDist = Infinity;
  for (const [e, prop] of w.propC) {
    if (prop.audited) continue;
    const t = w.transform.get(e);
    if (t === undefined) continue;
    const dist = Math.hypot(t.x - x, t.y - y);
    if (dist >= bestDist) continue;
    bestDist = dist;
    best = e;
  }
  return best;
}

/** Сколько строк описи ещё не внесено. */
export function pendingItems(w: World): number {
  let count = 0;
  for (const [, prop] of w.propC) {
    if (!prop.audited) count += 1;
  }
  return count;
}

/** Есть ли на участке Ревизор, который сейчас неуязвим. */
export function auditInProgress(w: World): boolean {
  for (const [, auditor] of w.auditorC) {
    if (auditor.phase !== 'open') return true;
  }
  return false;
}
