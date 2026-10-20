/**
 * НАЧАЛЬНИК ОТДЕЛА КАДРОВ. Босс этажа связи и кадров.
 *
 * Все прочие начальники бьют по субъекту. Этот ПРАВИТ субъекта: он
 * издаёт распоряжения, и каждое — физический лист, зависший в комнате.
 * Пока лист цел, распоряжение действует: то форма отстранена, то рывок
 * запрещён, то инвентарь изъят, то субъект переведён на нижестоящую
 * ставку и бьёт вдвое слабее.
 *
 * Открыт он ровно тогда, когда НИ ОДНО его распоряжение не действует.
 * Отсюда решение, которого нет ни у одного другого боя: снести все листы
 * ради короткого окна — или терпеть ограничения и бить между делом. Бой
 * целиком собран из механики игры, а не из новых пуль.
 */
import { PROP_ORDER } from '../data/props';
import type { Entity, World } from '../ecs';
import { spawnProp } from '../spawn';
import { TUNING } from '../tuning';
import { approach } from './staff';

/** Виды распоряжений в порядке, в котором он их выпускает. */
const KINDS = ['form', 'dash', 'tool', 'demote'];

/** Действует ли сейчас распоряжение этого вида. */
export function orderActive(w: World, kind: string): boolean {
  for (const [, order] of w.orderC) {
    if (order.kind === kind) return true;
  }
  return false;
}

/** Отстранённая форма или −1. Отстраняют ту, что была в руках. */
export function lockedForm(w: World): number {
  for (const [, order] of w.orderC) {
    if (order.kind === 'form') return order.form;
  }
  return -1;
}

/** Во сколько раз субъект бьёт слабее по переводу на нижестоящую ставку. */
export function demoteFactor(w: World): number {
  return orderActive(w, 'demote') ? TUNING.personnel.demoteFactor : 1;
}

/** Назначен ли субъект на должность прямо сейчас. */
export function appointed(w: World): boolean {
  return w.appointed > 0;
}

/**
 * Открыт ли начальник для урона: только пока ни одно распоряжение не
 * действует. Это и есть его окно, и открывает его игрок.
 */
export function personnelOpen(w: World, e: Entity): boolean {
  if (!w.personnelC.has(e)) return true;
  return w.orderC.size === 0;
}

export function personnelSystem(w: World, dt: number): void {
  w.appointed = Math.max(0, w.appointed - dt);
  if (w.personnelC.size === 0) return;
  const cfg = TUNING.personnel;
  const pt = w.transform.get(w.player);
  const alive = pt !== undefined && w.status !== 'dead';

  for (const [e, boss] of w.personnelC) {
    const t = w.transform.get(e);
    const b = w.body.get(e);
    const staff = w.staffC.get(e);
    const health = w.health.get(e);
    if (t === undefined || b === undefined || staff === undefined || health === undefined) continue;
    if (staff.frozen > 0) continue;

    // Фаза считается по оставшейся прочности, как у заведующего.
    const left = health.max <= 0 ? 1 : health.hp / health.max;
    const want: 1 | 2 | 3 = left <= cfg.phaseThreeAt ? 3 : left <= cfg.phaseTwoAt ? 2 : 1;
    if (want > boss.stage) {
      boss.stage = want;
      staff.plateFlash = cfg.firstDelay;
      w.sounds.push('fan');
    }

    // Табличка горит, пока он открыт: молчащие распоряжения и есть окно.
    if (w.orderC.size === 0) staff.plateFlash = Math.max(staff.plateFlash, 0.2);

    if (alive && pt !== undefined) {
      // Держится поодаль: он не дерётся, он оформляет.
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      let step = 0;
      if (dist > cfg.standoff) step = 1;
      else if (dist < cfg.standoff * 0.7) step = -1;
      const rate = TUNING.post.personnel.accel * dt;
      b.vx = approach(b.vx, (dx / dist) * TUNING.post.personnel.speed * step, rate);
      b.vy = approach(b.vy, (dy / dist) * TUNING.post.personnel.speed * step, rate);
    }

    boss.issueTimer -= dt;
    if (boss.issueTimer > 0) continue;
    boss.issueTimer = cfg.issueEvery;

    // Третья фаза: назначение субъекта на должность. Выдаётся один раз
    // и работает не как ограничение, а как подмена: по штатному не
    // стреляют, но и талоны за ставки ему не падают, и выйти он не
    // может — ровно как всякий оформленный.
    if (boss.stage >= 3 && !boss.appointed) {
      boss.appointed = true;
      w.appointed = cfg.appointTime;
      w.sounds.push('stamp');
      continue;
    }

    const want2 =
      boss.stage >= 3 ? cfg.ordersPhaseThree : boss.stage === 2 ? cfg.ordersPhaseTwo : cfg.ordersPhaseOne;
    if (w.orderC.size >= Math.max(1, Math.round(want2))) continue;
    issueOrder(w, boss.stage, t.x, t.y);
  }
}

/**
 * Выпустить лист. Висит он в стороне от боя: чтобы достать его, надо
 * перестать стрелять по начальнику, — в этом и состоит цена окна.
 */
function issueOrder(w: World, stage: number, x: number, y: number): void {
  const cfg = TUNING.personnel;
  // Вид выбирается по кругу от числа уже висящих: набор распоряжений
  // предсказуем, и игрок может на него рассчитывать.
  const kind = KINDS[(w.orderC.size + stage) % KINDS.length] ?? KINDS[0];
  if (kind === undefined) return;
  const range = cfg.orderRange + cfg.orderRangeAdd * (stage - 1);
  const angle = w.rng.angle();
  const px = x + Math.cos(angle) * range;
  const py = y + Math.sin(angle) * range;

  const e = spawnProp(w, PROP_ORDER, px, py);
  if (e < 0) return;
  const health = w.health.get(e);
  if (health !== undefined) {
    health.hp = cfg.orderHp;
    health.max = cfg.orderHp;
  }
  const body = w.body.get(e);
  if (body !== undefined) body.radius = cfg.orderRadius;
  const draw = w.drawC.get(e);
  if (draw !== undefined) draw.size = cfg.orderRadius;
  w.orderC.set(e, { kind, form: w.playerC.get(w.player)?.form ?? 0 });
  w.sounds.push('fan');
}
