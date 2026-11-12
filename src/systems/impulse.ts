/**
 * ИМПУЛЬС. Общее для всего, что передаёт удар: массы тел, толчок и
 * столкновения предметов между собой.
 *
 * Масса предмета записана в его данных. Масса сотрудника выводится из
 * габарита: ревизор вдвое шире стажёра и отлетает вчетверо меньше.
 */
import type { Entity, World } from '../ecs';
import { TUNING } from '../tuning';
import { toppleAt } from './fixtures';

/** Масса сотрудника или субъекта: квадрат радиуса тела. */
export function bodyMass(w: World, e: Entity): number {
  const prop = w.propC.get(e);
  if (prop !== undefined) return Math.max(0.1, prop.mass);
  const b = w.body.get(e);
  const r = b === undefined ? 12 : b.radius;
  return Math.max(0.3, (r * r) / Math.max(1, TUNING.physics.staffMassDiv));
}

/**
 * Толкнуть тело. Складывается с тем, что уже есть: два удара подряд
 * отбрасывают дальше одного. Потолок не даёт улететь сквозь участок.
 */
export function kick(w: World, e: Entity, vx: number, vy: number): void {
  if (vx === 0 && vy === 0) return;
  const cfg = TUNING.physics;
  let k = w.kickC.get(e);
  if (k === undefined) {
    k = { vx: 0, vy: 0 };
    w.kickC.set(e, k);
  }
  k.vx += vx;
  k.vy += vy;
  const speed = Math.hypot(k.vx, k.vy);
  if (speed > cfg.kickMax && speed > 0) {
    k.vx *= cfg.kickMax / speed;
    k.vy *= cfg.kickMax / speed;
  }
}

/** Неподвижно для удара: стеллаж на рельсе и положенное набок укрытие. */
function anchored(w: World, e: Entity): boolean {
  const prop = w.propC.get(e);
  if (prop === undefined) return true;
  return prop.phase === 'cover' || w.railC.has(e);
}

/**
 * Толкнуть предмет: скорость делится на массу. Быстрый толчок делает из
 * него снаряд — он полетит и ударит того, в кого попадёт.
 */
export function shove(w: World, e: Entity, vx: number, vy: number): void {
  const prop = w.propC.get(e);
  const b = w.body.get(e);
  if (prop === undefined || b === undefined) return;
  if (prop.phase === 'held' || anchored(w, e)) return;
  const m = Math.max(0.1, prop.mass);
  b.vx += vx / m;
  b.vy += vy / m;
  if (Math.hypot(b.vx, b.vy) >= TUNING.prop.minImpactSpeed) {
    prop.phase = 'thrown';
    prop.lastHit = -1;
  }
}

/**
 * Предметы сталкиваются друг с другом. Раньше они проходили насквозь:
 * брошенный шкаф пролетал через стул. Теперь удар передаётся по массе —
 * лёгкое отлетает, тяжёлое почти не шелохнётся, и быстрый удар делает
 * из задетого новый снаряд. Отсюда цепочки: шкаф сносит стул, стул
 * сносит инспектора.
 */
export function propCollisionSystem(w: World): void {
  const cfg = TUNING.physics;
  const props: Entity[] = [];
  for (const [e, prop] of w.propC) if (prop.phase !== 'held') props.push(e);
  let sounded = false;

  for (let i = 0; i < props.length; i++) {
    const a = props[i];
    if (a === undefined) continue;
    const ta = w.transform.get(a);
    const ba = w.body.get(a);
    if (ta === undefined || ba === undefined) continue;
    for (let j = i + 1; j < props.length; j++) {
      const c = props[j];
      if (c === undefined) continue;
      const tc = w.transform.get(c);
      const bc = w.body.get(c);
      if (tc === undefined || bc === undefined) continue;
      const dx = tc.x - ta.x;
      const dy = tc.y - ta.y;
      const minD = ba.radius + bc.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      // Совпали центры: разводим по оси x, иначе нормали нет.
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      const invA = anchored(w, a) ? 0 : 1 / bodyMass(w, a);
      const invC = anchored(w, c) ? 0 : 1 / bodyMass(w, c);
      const inv = invA + invC;
      if (inv <= 0) continue;

      // Развести по массе: тяжёлое сдвигается меньше.
      const overlap = minD - d;
      ta.x -= nx * overlap * (invA / inv);
      ta.y -= ny * overlap * (invA / inv);
      tc.x += nx * overlap * (invC / inv);
      tc.y += ny * overlap * (invC / inv);

      // Удар: только если сходятся, а не расходятся.
      const vrel = (bc.vx - ba.vx) * nx + (bc.vy - ba.vy) * ny;
      if (vrel >= 0) continue;
      const imp = (-(1 + cfg.propRestitution) * vrel * cfg.chainFactor) / inv;
      ba.vx -= imp * invA * nx;
      ba.vy -= imp * invA * ny;
      bc.vx += imp * invC * nx;
      bc.vy += imp * invC * ny;

      const speed = -vrel;
      if (speed < TUNING.prop.minImpactSpeed) continue;
      for (const e of [a, c]) {
        const prop = w.propC.get(e);
        const b = w.body.get(e);
        if (prop === undefined || b === undefined || anchored(w, e)) continue;
        if (Math.hypot(b.vx, b.vy) >= TUNING.prop.minImpactSpeed && prop.phase === 'idle') {
          prop.phase = 'thrown';
          prop.lastHit = -1;
        }
        // Сильный удар бьёт и сами предметы.
        const h = w.health.get(e);
        if (h !== undefined && speed >= TUNING.prop.minImpactSpeed * 1.6) {
          h.hp -= TUNING.prop.impactSelfDamage;
          h.flash = TUNING.feel.flashTime;
        }
      }
      // Оборудование между ними — опрокинуто.
      toppleAt(w, (ta.x + tc.x) / 2, (ta.y + tc.y) / 2, minD / 2);
      if (!sounded) {
        w.sounds.push('impact');
        sounded = true;
      }
    }
  }
}
