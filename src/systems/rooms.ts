/**
 * Двери участка: запираются на входе, открываются по зачистке.
 * За зачистку бросается выдача — предмет в личное дело или бланк.
 */
import { WEAPON_FORMS } from '../data/weaponForms';
import { pickItem } from '../paperwork';
import type { World } from '../ecs';
import { makeRng, type Rng } from '../rng';
import { DIRS, opposite, standingInDoor } from '../room';
import { TUNING } from '../tuning';
import { enterRoom } from '../world';
import { formStat, reserveMax } from '../weapon';

export function roomSystem(w: World): void {
  const room = w.floor.rooms[w.room];
  if (room === undefined) return;

  if (!room.cleared && w.staffC.size === 0) {
    room.cleared = true;
    // Участок, пройденный без единого попадания, идёт в выслугу.
    if (w.record.roomClean) {
      const cfg = TUNING.record;
      w.record.service = Math.min(cfg.serviceMax, w.record.service + cfg.servicePerCleanRoom);
    }
    w.map.doorsLocked = false;
    w.mapToken += 1;
    w.sounds.push('door.unlock');
    rollReward(w, room.index);
  }

  if (w.map.doorsLocked || w.status === 'dead') return;

  const t = w.transform.get(w.player);
  if (t === undefined) return;
  for (const dir of DIRS) {
    const next = room.neighbors[dir];
    if (next < 0 || !standingInDoor(w.map, dir, t.x, t.y)) continue;
    enterRoom(w, next, opposite(dir));
    return;
  }
}

/**
 * Выдача по итогам зачистки. Случайность своя на каждый участок, поэтому
 * порядок обхода этажа на бросок не влияет.
 *
 * Шанс — не постоянный: за каждый участок без выдачи он растёт на step и
 * упирается в cap, а как только выдача случилась, падает обратно к base.
 * Полоса невезения кончается сама, а не когда повезёт.
 */
function rollReward(w: World, roomIndex: number): void {
  const cfg = TUNING.reward;
  const rng = makeRng((w.seed + roomIndex * TUNING.floor.itemSeedStride) >>> 0);

  // Проверка на участке — это и риск, и повод: за каждого «на контроле»
  // шанс выдачи на этом участке выше.
  const bonus = w.record.controlHere * TUNING.record.controlRewardBonus;
  const chance = Math.min(cfg.cap, w.reward.chance + bonus);

  if (rng.float() >= chance) {
    w.reward.dry += 1;
    w.reward.chance = Math.min(cfg.cap, w.reward.chance + cfg.step);
    return;
  }

  w.reward.dry = 0;
  w.reward.chance = rewardBase(w);

  // Бланк выпадает, только если его есть куда положить: иначе выдача
  // ушла бы в пустоту и pity-таймер обнулился бы зря.
  const canCarry = w.blanks < TUNING.blank.carryMax;
  if (canCarry && rng.float() < cfg.blankShare) {
    w.blanks += 1;
    w.sounds.push('door.unlock');
    return;
  }

  if (w.passes < TUNING.stash.passesMax && rng.float() < cfg.passShare) {
    w.passes += 1;
    w.sounds.push('door.unlock');
    return;
  }

  if (rng.float() < cfg.ammoShare && giveAmmo(w, rng)) return;

  const item = pickItem(w, rng);
  if (item !== undefined) w.build.push(item.id);
}

/**
 * Базовый шанс выдачи с поправкой на личное дело: выслуга его поднимает,
 * взыскание опускает. Именно здесь скрытые статы начинают ощущаться,
 * не будучи показанными.
 */
export function rewardBase(w: World): number {
  const cfg = TUNING.reward;
  const rec = TUNING.record;
  const raw = cfg.base + w.record.service * rec.serviceRewardStep - w.record.penalty * rec.penaltyRewardStep;
  return Math.max(0.02, Math.min(cfg.cap, raw));
}

/**
 * Выдача боезапаса. Форма выбирается по весу: точная одиночная попадается
 * часто, залповая — редко. Формы с полным запасом в розыгрыше не
 * участвуют, иначе выдача уходила бы в потолок.
 */
function giveAmmo(w: World, rng: Rng): boolean {
  const p = w.playerC.get(w.player);
  if (p === undefined) return false;

  const need: { index: number; weight: number }[] = [];
  let total = 0;
  WEAPON_FORMS.forEach((form, index) => {
    const max = reserveMax(w, form.id);
    if ((p.reserve[index] ?? 0) >= max) return;
    const weight = Math.max(0, formStat(w, form.id, 'pickupWeight'));
    if (weight <= 0) return;
    need.push({ index, weight });
    total += weight;
  });
  if (total <= 0) return false;

  let roll = rng.float() * total;
  for (const candidate of need) {
    roll -= candidate.weight;
    if (roll > 0) continue;
    const form = WEAPON_FORMS[candidate.index];
    if (form === undefined) return false;
    const add = Math.max(1, Math.round(formStat(w, form.id, 'pickup')));
    p.reserve[candidate.index] = Math.min(
      reserveMax(w, form.id),
      (p.reserve[candidate.index] ?? 0) + add,
    );
    w.sounds.push('reload');
    return true;
  }
  return false;
}
