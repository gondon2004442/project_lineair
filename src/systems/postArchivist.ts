/**
 * ГЛАВНЫЙ АРХИВАРИУС. Босс архива.
 *
 * Не двигается вообще: сидит за конторкой в середине зала. Весь бой —
 * это стеллажи, которые он держит вокруг себя кольцом и медленно
 * проворачивает. Кольцо закрывает его от линии огня и давит субъекта,
 * если тот стоит на пути.
 *
 * Уязвим он только когда лезет за делом. А лезет он, когда кольцо
 * редеет: сломал картотеки — архивариус потянулся за новой, и вот тогда
 * по нему проходит. Это прямое продолжение логики Ревизора: окно
 * открывает игрок, а не ждёт, пока оно наступит само.
 */
import { PROP_CABINET } from '../data/props';
import type { Entity, World } from '../ecs';
import { spawnProp } from '../spawn';
import { TUNING } from '../tuning';

/** Открыт ли архивариус для урона. По нему же решает точка урона. */
export function archivistOpen(w: World, e: Entity): boolean {
  const a = w.archivistC.get(e);
  return a === undefined || a.phase === 'open';
}

export function archivistSystem(w: World, dt: number): void {
  const cfg = TUNING.archivist;

  for (const [e, boss] of w.archivistC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    if (t === undefined || b === undefined || staff === undefined) continue;

    // Конторка привинчена к полу: что бы в него ни прилетело, он стоит.
    b.vx = 0;
    b.vy = 0;
    if (staff.frozen > 0) continue;

    // Кольцо живёт само: стеллажи на рельсах едут, их ломают, они
    // кончаются. Считаем, сколько осталось.
    const ring = ringOf(w, e);
    boss.angle += cfg.spin * dt;

    if (boss.phase === 'open') {
      boss.openTimer -= dt;
      staff.plateFlash = Math.max(staff.plateFlash, boss.openTimer);
      if (boss.openTimer > 0) continue;
      // Дело достал — закрывается и ставит кольцо заново.
      boss.phase = 'closed';
      boss.broken = 0;
      boss.raiseTimer = cfg.raiseTime;
      continue;
    }

    if (boss.raiseTimer > 0) {
      boss.raiseTimer -= dt;
      if (boss.raiseTimer <= 0) raiseRing(w, e, t.x, t.y);
      continue;
    }

    // Кольцо на месте: ведём его по кругу вокруг конторки.
    const want = Math.max(1, Math.round(cfg.ring));
    if (ring.length === 0 && boss.broken < want) {
      // Кольца нет вовсе — поставить при первом же шаге.
      raiseRing(w, e, t.x, t.y);
      continue;
    }
    spinRing(w, ring, t.x, t.y, boss.angle);

    // Сломано достаточно — полез за делом.
    boss.broken = want - ring.length;
    if (boss.broken >= Math.max(1, Math.round(cfg.breakToOpen))) {
      boss.phase = 'open';
      boss.openTimer = cfg.openTime;
      staff.plateFlash = cfg.openTime;
      w.sounds.push('ring');
    }
  }
}

/** Стеллажи, которые сейчас числятся за этим архивариусом. */
function ringOf(w: World, boss: Entity): Entity[] {
  const out: Entity[] = [];
  for (const [e, rail] of w.railC) {
    if (rail.owner !== boss) continue;
    if (!w.propC.has(e)) continue;
    out.push(e);
  }
  return out;
}

/** Поставить кольцо стеллажей заново. */
function raiseRing(w: World, boss: Entity, x: number, y: number): void {
  const cfg = TUNING.archivist;
  const count = Math.max(1, Math.round(cfg.ring));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const px = x + Math.cos(angle) * cfg.ringRadius;
    const py = y + Math.sin(angle) * cfg.ringRadius;
    const e = spawnProp(w, PROP_CABINET, px, py);
    if (e < 0) continue;
    // Рельс с хозяином: по нему же кольцо и считается.
    w.railC.set(e, { dirX: 0, dirY: 0, speed: 0, owner: boss });
  }
  w.sounds.push('impact');
}

/** Провернуть кольцо: стеллажи обходят конторку по кругу. */
function spinRing(w: World, ring: Entity[], x: number, y: number, angle: number): void {
  const cfg = TUNING.archivist;
  const count = Math.max(1, Math.round(cfg.ring));
  ring.forEach((e, i) => {
    const prop = w.propC.get(e);
    const t = w.transform.get(e);
    if (prop === undefined || t === undefined) return;
    // Схваченный или брошенный стеллаж выпадает из кольца: его забрал
    // субъект, и это его право.
    if (prop.phase !== 'idle') return;
    const a = angle + (i / count) * Math.PI * 2;
    t.x = x + Math.cos(a) * cfg.ringRadius;
    t.y = y + Math.sin(a) * cfg.ringRadius;
  });
}
