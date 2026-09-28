/**
 * ОБОРУДОВАНИЕ. Стоит и не пускает, пока в него не влетели.
 *
 * Тело жёсткое, как у стены: субъекта выставляет наружу целиком, а не
 * толкает силой. Мягкий толчок здесь уже проверялся на штате и не
 * работает — на полном ходу субъект продавливает его насквозь.
 *
 * Роняет движение, а не соседство: ниже порога скорости столкновение
 * только останавливает. Иначе прижатый к кулеру субъект ронял бы его
 * просто так, и тесноты не получилось бы вовсе.
 *
 * Опрокинутое обратно не встаёт и след за собой оставляет до конца
 * участка: убирать некому, а уходя с участка не убирают и подавно —
 * clearExceptPlayer уносит всё вместе с самим участком.
 */
import { createEntity, type World } from '../ecs';
import { FIXTURES_BY_ID } from '../data/fixtures';
import { PALETTE } from '../palette';
import { TUNING } from '../tuning';

export function fixtureSystem(w: World): void {
  if (w.fixtureC.size === 0) return;
  const pt = w.transform.get(w.player);
  const pb = w.body.get(w.player);
  if (pt === undefined || pb === undefined) return;

  const speed = Math.hypot(pb.vx, pb.vy);
  for (const [e, fixture] of w.fixtureC) {
    if (fixture.toppled) continue;
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;

    const dx = pt.x - t.x;
    const dy = pt.y - t.y;
    const dist = Math.hypot(dx, dy);
    const minDist = pb.radius + b.radius;
    if (dist >= minDist || dist === 0) continue;

    const nx = dx / dist;
    const ny = dy / dist;

    if (speed >= TUNING.fixture.toppleSpeed) {
      // Пятно расползается ОТ субъекта, а не к нему: нормаль смотрит на
      // него, значит в след идёт обратный вектор.
      topple(w, e, -nx, -ny);
      continue;
    }

    // Не хватило хода — просто не пускает.
    pt.x = t.x + nx * minDist;
    pt.y = t.y + ny * minDist;
  }
}

/** Опрокинуть: тело убрать, след направить по ходу удара. */
function topple(w: World, e: number, nx: number, ny: number): void {
  const fixture = w.fixtureC.get(e);
  if (fixture === undefined || fixture.toppled) return;
  fixture.toppled = true;
  fixture.spillX = nx;
  fixture.spillY = ny;
  // Лежащее больше не тело: через него ходят, и в этом смысл.
  w.body.delete(e);
  w.sounds.push('impact');
}

/**
 * Положить готовый след без предмета: разбитый ящик картотеки не
 * опрокидывается, он рассыпается. Тела у следа нет с самого начала.
 */
export function spillAt(w: World, kind: string, x: number, y: number, dirX: number, dirY: number): void {
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.fixtureC.set(e, { kind, title: 'РАССЫПАННОЕ', toppled: true, spillX: dirX, spillY: dirY });
  const spec = FIXTURES_BY_ID.get(kind);
  w.drawC.set(e, {
    shape: 'square',
    size: spec === undefined ? 10 : spec.radius,
    color: PALETTE.furniture,
    hollow: false,
    desk: false,
  });
}

/** Опрокинуть всё, чего коснулся брошенный предмет. */
export function toppleAt(w: World, x: number, y: number, radius: number): void {
  for (const [e, fixture] of w.fixtureC) {
    if (fixture.toppled) continue;
    const t = w.transform.get(e);
    const b = w.body.get(e);
    if (t === undefined || b === undefined) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist >= radius + b.radius || dist === 0) continue;
    // Здесь наоборот: вектор уже смотрит от точки удара к предмету.
    topple(w, e, dx / dist, dy / dist);
  }
}
