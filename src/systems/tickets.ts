/**
 * ТАЛОНЫ. Служебная мелочь, которая остаётся от ликвидированной ставки.
 *
 * Падают на пол врассыпную и тянутся к субъекту, когда он подходит
 * ближе magnetRadius: собирать их поштучно, бегая по участку в бою, —
 * работа, а не игра. Но и сами не прилетают: подойти всё-таки надо.
 *
 * Пока штат жив. Как только участок зачищен, радиус перестаёт что-либо
 * значить и всё, что лежит на полу, идёт к субъекту через весь зал:
 * обход углов за бумажками — это уже не решение, а повинность.
 *
 * Уходя с участка, талоны с пола не забирают — clearExceptPlayer уносит
 * их вместе со всем остальным. Это цена спешки, а не потеря.
 */
import { createEntity, destroyEntity, type Entity, type World } from '../ecs';
import { PALETTE } from '../palette';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { statAt } from '../weapon';

/**
 * Сколько талонов стоит эта ставка. Старшая платит больше, «на контроле»
 * — ещё больше: проверка это и риск, и повод.
 */
export function ticketValue(w: World, e: Entity): number {
  const staff = w.staffC.get(e);
  if (staff === undefined) return 0;
  const cfg = TUNING.ticket;
  let count = cfg.perStaff;
  if (w.chiefC.has(e)) count += cfg.chiefBonus;
  else if (staff.priority <= 1) count += cfg.seniorBonus;
  if (staff.control) count += cfg.controlBonus;
  return Math.max(0, Math.round(count));
}

/**
 * Рассыпать талоны на месте ставки. Разлёт свой у каждого листка, но
 * считается он не из общего потока случайности, а из seed, участка и
 * номера сущности: порядок, в котором штат кончается, на содержимое
 * участка влиять не должен.
 */
export function dropTickets(w: World, e: Entity): void {
  const t = w.transform.get(e);
  if (t === undefined) return;
  scatterTickets(w, t.x, t.y, ticketValue(w, e), e);
}

/**
 * Рассыпать талоны в точке. Разлёт считается не из общего потока, а из
 * seed, участка и соли: порядок событий на содержимое пола не влияет.
 */
export function scatterTickets(w: World, x: number, y: number, count: number, salt: number): void {
  if (count <= 0) return;
  const cfg = TUNING.ticket;
  if (w.ticketC.size >= cfg.maxOnFloor) return;

  const rng = makeRng((w.seed + w.room * TUNING.stash.seedStride + salt) >>> 0);
  for (let i = 0; i < count; i++) {
    const angle = rng.float() * Math.PI * 2;
    const speed = rng.range(cfg.spread * 0.4, cfg.spread);
    const ticket = createEntity(w);
    w.transform.set(ticket, { x, y, px: x, py: y });
    w.body.set(ticket, {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: cfg.size,
    });
    w.ticketC.set(ticket, { value: 1, delay: cfg.pickupDelay });
    w.drawC.set(ticket, {
      shape: 'square',
      size: cfg.size,
      color: PALETTE.concrete300,
      hollow: false,
      desk: false,
    });
  }
}

/** Разлёт, притяжение и подбор. */
export function ticketSystem(w: World, dt: number): void {
  if (w.ticketC.size === 0) return;
  const cfg = TUNING.ticket;
  const pt = w.transform.get(w.player);
  // Радиус притяжения правит инструкция кладовщика, поэтому читается
  // через statAt, а не прямо из тюнинга.
  const magnet = statAt(w, 'ticket.magnetRadius');
  // Участок зачищен — талоны идут сами, откуда бы ни лежали.
  const swept = w.staffC.size === 0;

  for (const [e, ticket] of w.ticketC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;

    // Бумага о пол тормозит быстро: разлёт виден, а разъезжаться по
    // всему участку талонам незачем.
    const drag = Math.max(0, 1 - cfg.drag * dt);
    b.vx *= drag;
    b.vy *= drag;

    ticket.delay = Math.max(0, ticket.delay - dt);
    if (pt === undefined || w.status === 'dead') continue;

    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const dist = Math.hypot(dx, dy);
    if (ticket.delay <= 0 && dist <= cfg.pickupRadius) {
      w.tickets += ticket.value;
      // Десяток талонов подбирается одним движением: щелчок нужен один,
      // иначе подбор звучит как обвал.
      if (!w.sounds.includes('ticket')) w.sounds.push('ticket');
      destroyEntity(w, e);
      continue;
    }
    if (ticket.delay > 0 || dist <= 0) continue;
    if (swept) {
      // После зачистки талон ведут напрямую, а не толчком: толчок
      // оставлял его лежать за первым же бетонным блоком, куда его
      // прижимала физика. Скорость ровная, путь прямой.
      const step = Math.min(dist, cfg.sweepSpeed * dt);
      b.vx = 0;
      b.vy = 0;
      t.x += (dx / dist) * step;
      t.y += (dy / dist) * step;
      continue;
    }
    if (dist > magnet) continue;
    // Тянет тем сильнее, чем ближе: издалека это намёк, вблизи — захват.
    const pull = cfg.magnetPull * (1 - dist / magnet) * dt;
    b.vx += (dx / dist) * pull;
    b.vy += (dy / dist) * pull;
  }
}
