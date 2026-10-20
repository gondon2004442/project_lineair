/**
 * АТТЕСТАЦИЯ. Испытания натурной части.
 *
 * Комиссия в натурной части — не охрана, а аттестационная комиссия:
 * последняя инстанция перед выдачей. Поэтому и этаж устроен не как
 * коридор с врагами, а как серия проверок между участками боя, и
 * проходятся они не оружием, а тем, чем субъект и так владеет: ногами,
 * прицелом и телекинезом.
 *
 * Испытание занимает помещение целиком. Пока оно не сдано, двери
 * заперты: аттестацию не покидают на середине.
 */
import { TRIALS, TRIALS_BY_ID, type Trial } from '../data/trials';
import { floorAt } from '../data/floors';
import { PROP_ORDER } from '../data/props';
import type { World } from '../ecs';
import { makeRng } from '../rng';
import { spawnProp } from '../spawn';
import { rebuildRoom } from '../world';
import { TUNING } from '../tuning';
import { grantForm } from './issue';
import { WEAPON_FORMS } from '../data/weaponForms';

/** Какое испытание досталось помещению. Пусто — обычный участок. */
export function trialOf(w: World, index: number): Trial | undefined {
  if (floorAt(w.depth).verdict !== true) return undefined;
  const room = w.floor.rooms[index];
  if (room === undefined || room.kind === 'start' || index === w.floor.end) return undefined;
  // Какие участки отданы под аттестацию, решает посевная этажа: три
  // помещения из рядовых, по одному на испытание.
  const rng = makeRng((w.seed + Math.abs(w.depth) * TUNING.trial.seedStride) >>> 0);
  const pool = w.floor.rooms
    .filter((r) => r.kind !== 'start' && r.index !== w.floor.end)
    .map((r) => r.index);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) continue;
    pool[i] = b;
    pool[j] = a;
  }
  const at = pool.indexOf(index);
  if (at < 0 || at >= TRIALS.length) return undefined;
  return TRIALS[at];
}

/** Сдано ли это испытание за забег. */
export function trialPassed(w: World, id: string): boolean {
  return w.trials.includes(id);
}

/** Идёт ли аттестация прямо сейчас и какая. */
export function activeTrial(w: World): Trial | undefined {
  const trial = trialOf(w, w.room);
  if (trial === undefined || trialPassed(w, trial.id)) return undefined;
  return trial;
}

/** Выдать полномочие. Числовые правки читает statAt, прочие — системы. */
function grant(w: World, trial: Trial): void {
  if (!w.grants.includes(trial.grant)) w.grants.push(trial.grant);
  w.trials.push(trial.id);
  // Допуск к форме — это именно форма: выдаётся первая невыданная.
  if (trial.grant === 'form') {
    const at = WEAPON_FORMS.findIndex((f, i) => w.forms[i] !== true && f.id !== 'circular');
    const form = WEAPON_FORMS[at];
    if (form !== undefined) grantForm(w, form.id);
  }
  w.trialNote = TUNING.trial.noteTime;
  w.sounds.push('stamp');
}

/** Мишени второго испытания: их ставит комната, двигает — система. */
function placeTargets(w: World, need: number): void {
  const cfg = TUNING.trial;
  const map = w.map;
  const centre = { x: (map.cols / 2) * map.size, y: (map.rows / 2) * map.size };
  for (let i = 0; i < need; i++) {
    const angle = (i / need) * Math.PI * 2;
    const e = spawnProp(
      w,
      PROP_ORDER,
      centre.x + Math.cos(angle) * cfg.targetRing,
      centre.y + Math.sin(angle) * cfg.targetRing,
    );
    if (e < 0) continue;
    const h = w.health.get(e);
    if (h !== undefined) {
      h.hp = cfg.targetHp;
      h.max = cfg.targetHp;
    }
    w.targetC.set(e, { angle, phase: i / need });
  }
}

/** Подготовить помещение под испытание. Вызывается на входе. */
export function setupTrial(w: World): void {
  w.trialTimer = 0;
  w.trialDone = 0;
  w.trialBeat = TUNING.trial.beat;
  const trial = activeTrial(w);
  if (trial === undefined) return;
  // Аттестацию не покидают на середине.
  w.map.doorsLocked = true;
  w.mapToken += 1;
  w.trialNote = TUNING.trial.noteTime;
  if (trial.goal === 'targets') placeTargets(w, Math.max(1, Math.round(trial.need)));
}

export function trialSystem(w: World, dt: number): void {
  w.trialNote = Math.max(0, w.trialNote - dt);
  const trial = activeTrial(w);
  if (trial === undefined) return;
  const cfg = TUNING.trial;

  // Мишени ходят по кругу: их двигает комиссия, а не ветер.
  for (const [e, target] of w.targetC) {
    const t = w.transform.get(e);
    if (t === undefined) continue;
    target.angle += cfg.targetSpin * dt;
    const map = w.map;
    const centre = { x: (map.cols / 2) * map.size, y: (map.rows / 2) * map.size };
    t.x = centre.x + Math.cos(target.angle) * cfg.targetRing;
    t.y = centre.y + Math.sin(target.angle) * cfg.targetRing;
  }

  const p = w.playerC.get(w.player);
  const t = w.transform.get(w.player);
  if (p === undefined || t === undefined) return;

  // Плиты в испытании перестраивает сама аттестация. Искажение здесь не
  // помощник: его отсчёт идёт, только пока в помещении есть кому
  // стрелять, а на аттестации стрелять не в кого.
  if (trial.goal === 'cross' || trial.goal === 'hold') {
    w.trialBeat -= dt;
    if (w.trialBeat <= 0) {
      w.trialBeat = cfg.beat;
      if (w.tick > 0) rebuildRoom(w);
    }
  }

  if (trial.goal === 'cross') {
    // Пройти помещение, пока оно перестраивается: считаем перестройки,
    // пережитые без срыва. Сорвался — отсчёт сначала.
    if (p.fallTimer > 0) {
      w.trialDone = 0;
      return;
    }
    if (w.rebuilds > w.trialTimer) {
      w.trialTimer = w.rebuilds;
      w.trialDone += 1;
    }
    if (w.trialDone >= trial.need) grant(w, trial);
    return;
  }

  if (trial.goal === 'targets') {
    // Мишени не отвечают: проверяется точность, а не храбрость.
    const left = w.targetC.size;
    w.trialDone = Math.max(1, Math.round(trial.need)) - left;
    if (left === 0) grant(w, trial);
    return;
  }

  // Удержание: отпустил — отсчёт начинается заново.
  if (p.held < 0) {
    w.trialTimer = 0;
    w.trialDone = 0;
    return;
  }
  w.trialTimer += dt;
  w.trialDone = Math.floor(w.trialTimer);
  if (w.trialTimer >= trial.need) grant(w, trial);
}

/** Сдана ли аттестация этого помещения: по ней отпираются двери. */
export function trialClear(w: World): boolean {
  const trial = trialOf(w, w.room);
  return trial === undefined || trialPassed(w, trial.id);
}

export { TRIALS_BY_ID };
