/**
 * СМОТРИТЕЛЬ УЗЛА. Босс теплового узла.
 *
 * Не стреляет вовсе. Он гасит секции освещения и бьёт в упор, а свет —
 * одновременно его оружие и его слабость: в темноте он быстр и по нему
 * не проходит, под зажжённой лампой он медленный и открытый.
 *
 * Поэтому бой с ним — не про урон. Субъект бегает по щитовой и зажигает
 * секции руками, Смотритель ходит следом и гасит. Кто успевает, тот и
 * диктует бой.
 */
import type { Entity, World } from '../ecs';
import { TUNING } from '../tuning';
import { applyDamage } from './damage';
import { approach } from './staff';

/** Освещена ли точка хотя бы одной зажжённой секцией. */
export function litAt(w: World, x: number, y: number): boolean {
  const r = TUNING.keeper.sectionLight;
  for (const s of w.sections) {
    if (!s.lit) continue;
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/**
 * Открыт ли Смотритель для урона. Под лампой — да, в темноте — нет: он
 * не прячется, его там просто нет на что навести.
 */
export function keeperOpen(w: World, e: Entity): boolean {
  if (!w.keeperC.has(e)) return true;
  const t = w.transform.get(e);
  if (t === undefined) return true;
  return litAt(w, t.x, t.y);
}

export function keeperSystem(w: World, dt: number): void {
  const cfg = TUNING.keeper;
  const pt = w.transform.get(w.player);
  const alive = pt !== undefined && w.status !== 'dead';

  // --- Субъект зажигает секцию, рядом с которой стоит.
  if (alive && pt !== undefined) {
    for (const section of w.sections) {
      if (section.lit) {
        section.charge = 0;
        continue;
      }
      const near = Math.hypot(pt.x - section.x, pt.y - section.y) <= cfg.relightReach;
      section.charge = near ? section.charge + dt : 0;
      if (section.charge >= cfg.relightTime) {
        section.lit = true;
        section.charge = 0;
        w.sounds.push('door.unlock');
      }
    }
  }

  for (const [e, keeper] of w.keeperC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;
    if (staff.frozen > 0) continue;

    // Под лампой он вязнет, в темноте летит. Это и есть весь его нрав.
    const inLight = litAt(w, t.x, t.y);
    const speed = TUNING.post.keeper.speed * (inLight ? 1 : cfg.darkSpeed);

    // --- Куда идёт: к ближайшей зажжённой секции, а если таких нет —
    // к субъекту. Гасить больше нечего, значит, остаётся бить.
    keeper.douseTimer = Math.max(0, keeper.douseTimer - dt);
    let goX = pt?.x ?? t.x;
    let goY = pt?.y ?? t.y;
    keeper.target = -1;
    let best = Infinity;
    w.sections.forEach((section, i) => {
      if (!section.lit) return;
      const d = Math.hypot(section.x - t.x, section.y - t.y);
      if (d >= best) return;
      best = d;
      keeper.target = i;
      goX = section.x;
      goY = section.y;
    });

    const target = w.sections[keeper.target];
    if (target !== undefined && best <= cfg.douseReach && keeper.douseTimer <= 0) {
      target.lit = false;
      target.charge = 0;
      keeper.douseTimer = cfg.douseEvery;
      w.sounds.push('glass');
    }

    const dx = goX - t.x;
    const dy = goY - t.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rate = TUNING.post.keeper.accel * dt;
    b.vx = approach(b.vx, (dx / dist) * speed, rate);
    b.vy = approach(b.vy, (dy / dist) * speed, rate);

    // --- Касание. Стрелять ему нечем, поэтому вред только в упор и не
    // чаще, чем раз в touchInterval: иначе стоять рядом значило бы
    // умереть за один шаг, а не за несколько.
    keeper.touchTimer = Math.max(0, keeper.touchTimer - dt);
    if (!alive || pt === undefined) continue;
    const reach = cfg.touchReach + b.radius;
    if (Math.hypot(pt.x - t.x, pt.y - t.y) > reach) continue;
    if (keeper.touchTimer > 0) continue;
    keeper.touchTimer = cfg.touchInterval;
    applyDamage(w, w.player, cfg.touchDamage);
  }
}
