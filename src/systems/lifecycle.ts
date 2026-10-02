/** Таймеры тел, смерть и состояние забега. */
import { destroyEntity, type Entity, type World } from '../ecs';
import { floorAt } from '../data/floors';
import { isGatePoint, liftOpen, openLift } from '../room';
import { descend, deeperExists } from '../world';
import { dropTickets } from './tickets';
import { WEAPON_FORMS } from '../data/weaponForms';
import { spawnStash } from '../spawn';
import { TUNING } from '../tuning';

export function lifecycleSystem(w: World, dt: number): void {
  // Кладовщик отписывается: пока табличка горит, видно, что он занят
  // протоколом, а не выдачей.
  for (const [, clerk] of w.clerkC) clerk.noteTime = Math.max(0, clerk.noteTime - dt);

  for (const [e, h] of w.health) {
    h.iframes = Math.max(0, h.iframes - dt);
    h.flash = Math.max(0, h.flash - dt);
    if (h.hp > 0) continue;

    // Разрушение предметов ведёт своя система: она оставляет обломок.
    if (w.propC.has(e)) continue;

    if (e === w.player) {
      if (w.status !== 'dead') {
        w.status = 'dead';
        w.runEnded = 'dead';
        const b = w.body.get(e);
        if (b !== undefined) {
          b.vx = 0;
          b.vy = 0;
        }
      }
    } else {
      // Приёмная, взятая без единого попадания, — благодарность в дело:
      // перманентный контейнер здоровья на забег. Награда не за победу,
      // а за качество победы.
      if (w.chiefC.has(e) && w.record.roomClean) commend(w);
      // Циркулярная остаётся там, где стоял начальник. Она его
      // инструмент: не выдаётся по описи, а снимается с него — заодно и
      // причина драться с ним помимо печати.
      if (w.chiefC.has(e)) dropCircular(w, e);
      // Печать уровня: снимается с того, кто им заведует. Это и есть
      // единственная причина убивать начальника — не добыча, а подпись.
      takeSeal(w, e);
      // Талоны сыплются до удаления: место ставки ещё известно.
      dropTickets(w, e);
      destroyEntity(w, e);
    }
  }
}

/**
 * Циркулярная форма на месте убитого начальника. Ящик с инструментом, а
 * не предмет в деле: её ещё надо оформить допуском, как и всё, что
 * контора выдаёт.
 */
function dropCircular(w: World, e: Entity): void {
  const index = WEAPON_FORMS.findIndex((f) => f.id === 'circular');
  const form = WEAPON_FORMS[index];
  if (form === undefined || w.forms[index] === true) return;
  const t = w.transform.get(e);
  if (t === undefined) return;
  spawnStash(w, 'form', form.id, `${form.code} · ${form.title}`, t.x, t.y);
  w.sounds.push('ring');
}

/** Благодарность: контейнер здоровья, который остаётся до конца забега. */
function commend(w: World): void {
  const health = w.health.get(w.player);
  if (health === undefined) return;
  w.commendations += 1;
  health.max += TUNING.post.chief.commendationHp;
  health.hp = Math.min(health.max, health.hp + TUNING.post.chief.commendationHp);
  w.sounds.push('door.unlock');
}

/**
 * Этаж кончается приёмной. Ответвления можно не проходить —
 * их смысл в предметах, а не в обязательной зачистке.
 */
export function statusSystem(w: World): void {
  if (w.status !== 'playing') return;
  const office = w.floor.rooms[w.floor.end];
  if (office === undefined || !office.cleared) return;

  // Приёмная сдана — открывается лифт. Забег на этом больше не кончается:
  // здание глубже, и это единственное место, где видно, насколько.
  if (w.room === w.floor.end && !liftOpen(w.map)) {
    openLift(w.map);
    // Карта запечена: без отметки шахта не появится до смены участка.
    w.mapToken += 1;
  }
  if (!deeperExists(w)) {
    w.status = 'cleared';
    w.runEnded = 'cleared';
  }
}

/**
 * Снять печать с убитого держателя. Печать одна на уровень: комиссия
 * из троих отдаёт её, когда ляжет последний, — орган один, и полномочия
 * у него тоже одни.
 */
function takeSeal(w: World, e: Entity): void {
  const staff = w.staffC.get(e);
  if (staff === undefined) return;
  if (staff.post !== floorAt(w.depth).sealHolder) return;
  // Орган из нескольких лиц: печать отдаёт последний. Живой — значит с
  // прочностью выше нуля, а не просто числящийся: все трое гибнут в
  // одном шаге, из хранилища их вычёркивают только в конце его, и по
  // одному лишь списку выходило, что последнего нет никогда.
  for (const [other, s] of w.staffC) {
    if (other === e || s.post !== staff.post) continue;
    if ((w.health.get(other)?.hp ?? 0) > 0) return;
  }
  if (w.seals.includes(w.depth)) return;
  w.seals.push(w.depth);
  w.sounds.push('stamp');
}

/** Подписан ли спуск с этого уровня: печать в деле. */
export function descentSigned(w: World): boolean {
  return w.seals.includes(w.depth);
}

/**
 * Шаг в лифт. Как и в вестибюле: никаких кнопок и подтверждений —
 * встал в шахту, поехал.
 */
export function liftSystem(w: World): void {
  if (w.scene !== 'run' || w.status !== 'playing') return;
  if (!deeperExists(w)) return;
  const office = w.floor.rooms[w.floor.end];
  if (office === undefined || !office.cleared || w.room !== w.floor.end) return;
  // Распоряжение о спуске действительно только с печатью уровня.
  if (!descentSigned(w)) return;
  const t = w.transform.get(w.player);
  if (t === undefined || !isGatePoint(w.map, t.x, t.y)) return;
  // В шахту надо ВОЙТИ, а не оказаться в ней. Приёмная сдаётся чаще
  // всего в середине зала — ровно там, где пробивается шахта, — и лифт
  // увозил бы субъекта в тот же миг, не спросив.
  if (isGatePoint(w.map, t.px, t.py)) return;
  w.sounds.push('gate');
  descend(w);
}

export function feedbackSystem(w: World, dt: number): void {
  w.fx.shake = Math.max(0, w.fx.shake - TUNING.feel.shakeDecay * dt);
  // Кольцо бланка и замедление живут шагами симуляции, а не кадрами:
  // на медленной машине они не станут длиннее.
  w.fx.blankTime = Math.max(0, w.fx.blankTime - dt);
  w.fx.slowMo = Math.max(0, w.fx.slowMo - dt);
  w.fx.warpTime = Math.max(0, w.fx.warpTime - dt);
  w.fx.shotTime = Math.max(0, w.fx.shotTime - dt);
  w.fx.cloudTime = Math.max(0, w.fx.cloudTime - dt);
}
