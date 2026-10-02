/**
 * ОФОРМЛЕНИЕ. Вторая дорога к приложениям, помимо зачистки.
 *
 * Один дефицитный ресурс работает на двух рынках: допуск вскрывает
 * опечатанный шкаф (что внутри — не написано) и он же получает со стола
 * выдачи названное по описи. Шкаф вдобавок открывается бланком, и это
 * тот самый второй рынок бланка: потратить его, чтобы выжить сейчас, или
 * чтобы получить предмет потом.
 */
import { POST_INSPECTOR } from '../data/posts';
import { SUBJECTS_BY_ID } from '../data/subjects';
import { WEAPON_FORMS } from '../data/weaponForms';
import type { Entity, World } from '../ecs';
import { ITEMS_BY_ID } from '../data/items';
import { grantItem, pickItem } from '../paperwork';
import { spawnStaff } from '../spawn';
import { makeRng } from '../rng';
import { TUNING } from '../tuning';
import { formStat, infiniteReserve, reserveMax, statAt } from '../weapon';

/** Ближайшая добыча в пределах вытянутой руки. */
export function stashInReach(w: World): Entity {
  const t = w.transform.get(w.player);
  if (t === undefined) return -1;
  const reach = TUNING.stash.reach;
  let best = -1;
  let bestDist = reach * reach;
  for (const [e, stash] of w.stashC) {
    if (stash.opened) continue;
    const st = w.transform.get(e);
    if (st === undefined) continue;
    const dx = st.x - t.x;
    const dy = st.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestDist) continue;
    bestDist = d2;
    best = e;
  }
  return best;
}

/** Закрыт ли стол выдачи: кладовщик обслуживает не всякого. */
export function deskClosed(w: World): boolean {
  for (const [, clerk] of w.clerkC) {
    if (clerk.offended) return true;
  }
  return false;
}

/** Чем можно оформить добычу прямо сейчас. Пусто — нечем. */
export function issueCost(
  w: World,
  target: Entity,
): 'pass' | 'blank' | 'free' | 'ticket' | 'commendation' | '' {
  const stash = w.stashC.get(target);
  if (stash === undefined || stash.opened) return '';
  // Чужое дело ничего не стоит: его читают, а не оформляют. План
  // эвакуации тоже даром: это починка схемы, а не добыча, и платить за
  // то, чтобы интерфейс перестал врать, игрок не должен.
  if (stash.kind === 'case' || stash.kind === 'evac') return 'free';

  // Замурованного не оформляют по описи: его правят в расписании, а это
  // стоит допуска и только допуска. Бланком штат не переписывают.
  if (stash.kind === 'walled') return w.passes > 0 ? 'pass' : '';

  // Стол выдачи: платят талонами, и только пока кладовщик обслуживает.
  if (stash.kind === 'cell' || stash.kind === 'special' || isService(stash.kind)) {
    if (deskClosed(w)) return '';
    if (stash.kind === 'special') {
      const need = Math.max(1, Math.round(TUNING.clerk.specialCommendations));
      return w.commendations >= need ? 'commendation' : '';
    }
    if (isService(stash.kind) && servicePointless(w, stash.kind) !== '') return '';
    return w.tickets >= deskPrice(w, stash.kind) ? 'ticket' : '';
  }

  if (w.passes > 0) return 'pass';
  // Бланком вскрывается только шкаф: на столе выдачи бланк не примут.
  if (stash.kind === 'safe' && w.blanks > 0) return 'blank';
  return '';
}

/**
 * Цена ячейки стола выдачи. Читается через statAt: её правит
 * должностная инструкция кладовщика, и цена на табличке обязана
 * совпадать с той, что спишут.
 */
export function cellPrice(w: World): number {
  return deskPrice(w, 'cell');
}

/**
 * Цена позиции прилавка в талонах. Все цены идут через statAt: их правит
 * должностная инструкция кладовщика, и цена на табличке обязана
 * совпадать с той, что спишут.
 */
export function deskPrice(w: World, kind: string): number {
  const path =
    kind === 'pass' ? 'clerk.passPrice'
    : kind === 'blank' ? 'clerk.blankPrice'
    : kind === 'ammo' ? 'clerk.ammoPrice'
    : kind === 'heal' ? 'clerk.healPrice'
    : 'clerk.cellPrice';
  return Math.max(0, Math.round(statAt(w, path)));
}

/** Позиции прилавка: их продают за талоны и только за них. */
function isService(kind: string): boolean {
  return kind === 'pass' || kind === 'blank' || kind === 'ammo' || kind === 'heal';
}

/**
 * Есть ли смысл в этой позиции прямо сейчас. Полный запас бланков или
 * целое здоровье — не повод списывать талоны: окошко должно отказывать,
 * а не брать деньги ни за что.
 */
function servicePointless(w: World, kind: string): string {
  if (kind === 'pass') {
    return w.passes >= TUNING.stash.passesMax ? 'ДОПУСКОВ ПОЛНО' : '';
  }
  if (kind === 'blank') {
    return w.blanks >= TUNING.blank.carryMax ? 'БЛАНКОВ ПОЛНО' : '';
  }
  if (kind === 'heal') {
    const health = w.health.get(w.player);
    if (health === undefined) return 'НЕКОМУ';
    return health.hp >= health.max ? 'ЖАЛОБ НЕТ' : '';
  }
  // ПОДАЧА: табельной форме запас не нужен, а полный запас не пополнить.
  const p = w.playerC.get(w.player);
  const form = p === undefined ? undefined : WEAPON_FORMS[p.form];
  if (p === undefined || form === undefined) return 'НЕКОМУ';
  if (infiniteReserve(w, form.id)) return 'ЗАПАС ТАБЕЛЬНЫЙ';
  return (p.reserve[p.form] ?? 0) >= reserveMax(w, form.id) ? 'ЗАПАС ПОЛОН' : '';
}

/** Что написать у добычи: чем платят и хватает ли. */
export function issueOffer(w: World, target: Entity): { text: string; ok: boolean } {
  const stash = w.stashC.get(target);
  if (stash === undefined || stash.opened) return { text: '', ok: false };
  const cost = issueCost(w, target);
  if (cost !== '') {
    if (cost === 'ticket') return { text: `${deskPrice(w, stash.kind)} ТАЛОНОВ`, ok: true };
    if (cost === 'commendation') return { text: 'БЛАГОДАРНОСТЬ', ok: true };
    if (cost === 'blank') return { text: 'БЛАНК', ok: true };
    if (cost === 'pass') return { text: 'ДОПУСК', ok: true };
    return { text: 'БЕСПЛАТНО', ok: true };
  }
  if ((stash.kind === 'cell' || stash.kind === 'special') && deskClosed(w)) {
    return { text: 'СТОЛ ЗАКРЫТ', ok: false };
  }
  if (stash.kind === 'special') return { text: 'НУЖНА БЛАГОДАРНОСТЬ', ok: false };
  if (isService(stash.kind)) {
    const idle = servicePointless(w, stash.kind);
    if (idle !== '') return { text: idle, ok: false };
  }
  if (stash.kind === 'cell' || isService(stash.kind)) {
    return { text: `НУЖНО ${deskPrice(w, stash.kind)} ТАЛОНОВ`, ok: false };
  }
  // Замурованного бланком не выпустят: штат правят допуском.
  if (stash.kind === 'walled') return { text: 'НУЖЕН ДОПУСК', ok: false };
  return { text: 'НЕЧЕМ ОФОРМИТЬ', ok: false };
}

/**
 * Благодарность как валюта: отдавая её, субъект отдаёт и тот контейнер
 * здоровья, который она дала. Иначе особая выдача была бы бесплатной.
 */
function spendCommendation(w: World): void {
  const need = Math.max(1, Math.round(TUNING.clerk.specialCommendations));
  w.commendations = Math.max(0, w.commendations - need);
  const health = w.health.get(w.player);
  if (health === undefined) return;
  const container = TUNING.post.chief.commendationHp * need;
  health.max = Math.max(1, health.max - container);
  health.hp = Math.min(health.hp, health.max);
}

/**
 * Что лежит в опечатанном шкафу. Бросок тот же самый, что решает
 * содержимое при вскрытии, — просто прочитанный заранее и без побочных
 * действий.
 *
 * Названия приложения здесь нет и быть не может: приложение выбирается
 * делопроизводством ПО СОСТАВУ ДЕЛА в момент вскрытия, и заранее оно не
 * определено. Опись отвечает на тот вопрос, который решает судьбу
 * допуска: патроны, бланк или всё-таки приложение.
 */
export function safeContents(w: World, target: Entity): string {
  const stash = w.stashC.get(target);
  if (stash === undefined || stash.kind !== 'safe') return '';
  const rng = makeRng((w.seed + w.room * TUNING.stash.seedStride + target) >>> 0);
  const roll = rng.float();
  if (roll < TUNING.stash.safeAmmoShare) return 'ПАТРОНЫ';
  if (roll < TUNING.stash.safeAmmoShare + TUNING.stash.safeBlankShare) return 'БЛАНК';
  return 'ПРИЛОЖЕНИЕ';
}

/**
 * ОСВОБОЖДЕНИЕ. Правка штатного расписания снаружи.
 *
 * Здание этого не прощает: двери запираются заново, и в помещение
 * выставляется волна. Поэтому замурованный — это решение, а не подарок:
 * допуск потрачен, бой начался сначала, а взамен освобождённый отдаёт
 * своё до конца забега и открывается для будущих.
 */
function freeWalled(w: World, id: string, target: Entity): void {
  const spec = SUBJECTS_BY_ID.get(id);
  if (spec === undefined || w.freed.includes(id)) return;
  const cfg = TUNING.walled;
  w.freed.push(id);
  // Прецедент: он открывается для будущих забегов. Симуляция про
  // хранилище не знает — помечает, а подшивает точка входа.
  w.precedents.push(id);
  w.record.penalty = Math.min(TUNING.record.penaltyMax, w.record.penalty + cfg.penalty);

  const t = w.transform.get(target);
  const room = w.floor.rooms[w.room];
  if (room !== undefined) {
    room.cleared = false;
    w.map.doorsLocked = true;
    w.mapToken += 1;
  }

  // Волна встаёт вокруг проёма: здание не пускает подкрепление в дверь,
  // оно ставит его там, где расписание правили.
  const count = Math.max(0, Math.round(cfg.wave));
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    const x = (t?.x ?? 0) + Math.cos(angle) * cfg.waveSpread;
    const y = (t?.y ?? 0) + Math.sin(angle) * cfg.waveSpread;
    spawnStaff(w, POST_INSPECTOR, TUNING.post.registrar.hirePriority, x, y);
  }
  w.sounds.push('stamp');
}

export function issueSystem(w: World): void {
  if (!w.input.useQueued) return;
  w.input.useQueued = false;
  if (w.scene !== 'run' || w.status !== 'playing') return;

  const target = stashInReach(w);
  if (target < 0) return;
  const stash = w.stashC.get(target);
  if (stash === undefined || stash.opened) return;

  const cost = issueCost(w, target);
  if (cost === '') return;
  if (cost === 'pass') w.passes -= 1;
  else if (cost === 'blank') w.blanks -= 1;
  else if (cost === 'ticket') w.tickets -= deskPrice(w, stash.kind);
  else if (cost === 'commendation') spendCommendation(w);

  stash.opened = true;
  w.sounds.push('door.unlock');

  if (stash.kind === 'evac') {
    w.evacPlan = true;
    return;
  }

  if (stash.kind === 'walled') {
    freeWalled(w, stash.item, target);
    return;
  }

  if (stash.kind === 'case') {
    // Симуляция не знает, что лежит в архиве: она помечает, какое дело
    // открыли, а достаёт его точка входа.
    w.note = [];
    w.noteSlot = Number(stash.item);
    return;
  }

  if (stash.kind === 'cell') {
    const found = ITEMS_BY_ID.get(stash.item);
    if (found !== undefined) grantItem(w, found);
    return;
  }

  // Прилавок: талоны в расходники. Это и есть вторые стоки талона,
  // без которых он был валютой с одной покупкой.
  if (stash.kind === 'pass') {
    w.passes = Math.min(TUNING.stash.passesMax, w.passes + 1);
    return;
  }
  if (stash.kind === 'blank') {
    w.blanks = Math.min(TUNING.blank.carryMax, w.blanks + 1);
    return;
  }
  if (stash.kind === 'ammo') {
    const p = w.playerC.get(w.player);
    const form = p === undefined ? undefined : WEAPON_FORMS[p.form];
    if (p !== undefined && form !== undefined) p.reserve[p.form] = reserveMax(w, form.id);
    return;
  }
  if (stash.kind === 'heal') {
    const health = w.health.get(w.player);
    if (health !== undefined) {
      health.hp = Math.min(health.max, health.hp + health.max * TUNING.clerk.healShare);
    }
    return;
  }

  // Особая выдача: благодарность меняется на приложения. Контейнер
  // здоровья уходит вместе с ней — тем она и особая.
  if (stash.kind === 'special') {
    const rng = makeRng((w.seed + w.room * TUNING.stash.seedStride + target) >>> 0);
    const count = Math.max(1, Math.round(TUNING.clerk.specialItems));
    for (let i = 0; i < count; i++) {
      const item = pickItem(w, rng);
      if (item === undefined) break;
      grantItem(w, item);
    }
    return;
  }

  // Шкаф: содержимое решает свой бросок, привязанный к сущности, — то же
  // место на том же seed отдаёт то же самое.
  const rng = makeRng((w.seed + w.room * TUNING.stash.seedStride + target) >>> 0);
  const roll = rng.float();
  if (roll < TUNING.stash.safeAmmoShare) {
    // Выбор идёт среди тех форм, которым запас вообще нужен: бросок
    // тратится тот же самый, поэтому поток случайности не съезжает.
    const pool = WEAPON_FORMS.filter((f) => !infiniteReserve(w, f.id));
    const picked = pool[rng.int(Math.max(1, pool.length))];
    const index = WEAPON_FORMS.findIndex((f) => f.id === picked?.id);
    const form = WEAPON_FORMS[index];
    const p = w.playerC.get(w.player);
    if (form !== undefined && p !== undefined) {
      const add = Math.max(1, Math.round(formStat(w, form.id, 'pickup')));
      p.reserve[index] = Math.min(reserveMax(w, form.id), (p.reserve[index] ?? 0) + add);
      return;
    }
  }
  if (roll < TUNING.stash.safeAmmoShare + TUNING.stash.safeBlankShare) {
    w.blanks = Math.min(TUNING.blank.carryMax, w.blanks + 1);
    return;
  }
  const item = pickItem(w, rng);
  if (item !== undefined) grantItem(w, item);
}
