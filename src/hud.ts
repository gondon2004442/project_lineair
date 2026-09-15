/** Служебный оверлей: состояние субъекта, схема этажа, отладка, seed. */
import { TEMPLATES_BY_ID } from './data/roomTemplates';
import { ITEMS_BY_ID } from './data/items';
import { WEAPON_FORMS } from './data/weaponForms';
import { STAFFING_BY_ID } from './data/staffing';
import { entityCount, type World } from './ecs';
import { PALETTE } from './palette';
import { DIRS } from './room';
import { formatSeed } from './rng';
import { TUNING } from './tuning';
import { auditInProgress, pendingItems } from './systems/postAuditor';
import { hasChief } from './systems/postChief';
import { courierTarget } from './systems/postCourier';
import { hasRegistrar, vacancyCount } from './systems/staff';
import { ammoMax, currentForm, formStat } from './weapon';
import { clearedCount, currentRoom } from './world';

export interface Hud {
  update(w: World, fps: number, hitboxes: boolean, dt: number): void;
  toggleDossier(): void;
}

export function createHud(
  left: HTMLElement,
  right: HTMLElement,
  map: HTMLElement,
  dossier: HTMLElement,
  banner: HTMLElement,
): Hud {
  let cooldown = 0;
  let dossierOpen = false;

  const renderLobby = (w: World, fps: number, hitboxes: boolean): void => {
    left.innerHTML = [
      '<div class="title">ОБЪЕКТ / LINEAIR</div>',
      '<div class="subtitle">ВЕСТИБЮЛЬ. ДОПУСК ОФОРМЛЕН</div>',
      row('ЭТАЖ', `${w.floor.rooms.length} УЧАСТКОВ`),
      row('ПРИЁМНАЯ', `УЧАСТОК ${w.floor.end + 1}`),
      '<div class="call">ШАГНИ В ПРОЁМ, ЧТОБЫ НАЧАТЬ</div>',
    ].join('');

    right.innerHTML = [
      row('SEED', formatSeed(w.seed)),
      row('E', 'ДРУГОЙ SEED'),
      row('FPS', String(Math.round(fps))),
      row('F1 ХИТБОКСЫ', hitboxes ? '<span class="ok">ВКЛ</span>' : 'ВЫКЛ'),
      row('` ', 'КРУТИЛКИ'),
    ].join('');

    map.innerHTML = [
      '<div class="subtitle">ПАМЯТКА СОТРУДНИКА</div>',
      row('WASD', 'ХОД'),
      row('МЫШЬ', 'ПРИЦЕЛ'),
      row('ЛКМ', 'ОГОНЬ'),
      row('КОЛЕСО', 'ФОРМА ОРУЖИЯ'),
      row('ПКМ', 'ТЕЛЕКИНЕЗ'),
      row('SHIFT', 'РЫВОК'),
      row('R', 'ПЕРЕЗАРЯДКА'),
      row('I', 'ЛИЧНОЕ ДЕЛО'),
      row('F2', 'ВЕРНУТЬСЯ СЮДА'),
    ].join('');

    banner.hidden = true;
    dossier.hidden = !dossierOpen;
    if (dossierOpen) dossier.innerHTML = dossierBody(w);
  };

  const render = (w: World, fps: number, hitboxes: boolean): void => {
    const health = w.health.get(w.player);
    const player = w.playerC.get(w.player);
    const hp = health === undefined ? 0 : Math.max(0, health.hp);
    const maxHp = health === undefined ? 0 : health.max;
    const dashReady = player === undefined || player.dashCooldown <= 0;
    const room = currentRoom(w);

    left.innerHTML = [
      row('СУБЪЕКТ', bar(hp, maxHp)),
      row('РЫВОК', dashReady ? '<span class="ok">ГОТОВ</span>' : '<span class="warn">ПЕРЕЗАРЯД</span>'),
      row('ШТАТ НА УЧАСТКЕ', String(w.staffC.size)),
      rankRow(w),
      courierRow(w),
      row('ВАКАНСИЙ', vacancyLine(w)),
      auditRow(w),
      row('ДВЕРИ', w.map.doorsLocked ? '<span class="warn">ЗАПЕРТЫ</span>' : '<span class="ok">ОТКРЫТЫ</span>'),
      weaponRows(w),
      energyRow(w),
    ].join('');

    right.innerHTML = [
      row('SEED', formatSeed(w.seed)),
      row('FPS', String(Math.round(fps))),
      row('СУЩНОСТЕЙ', String(entityCount(w))),
      row('ШАГ', String(w.tick)),
      row('F1 ХИТБОКСЫ', hitboxes ? '<span class="ok">ВКЛ</span>' : 'ВЫКЛ'),
      row('F2', 'ПОВТОР'),
      row('I ЛИЧНОЕ ДЕЛО', `${w.build.length} ПРЕДМЕТОВ`),
    ].join('');

    dossier.hidden = !dossierOpen;
    if (dossierOpen) dossier.innerHTML = dossierBody(w);

    const template = room === undefined ? undefined : TEMPLATES_BY_ID.get(room.template);
    const staffing = room === undefined ? undefined : STAFFING_BY_ID.get(room.staffing);
    map.innerHTML =
      [
        row('УЧАСТОК', `${w.room + 1} / ${w.floor.rooms.length}`),
        row('ЗАЧИЩЕНО', `${clearedCount(w)} / ${w.floor.rooms.length}`),
        row('ПЛАНИРОВКА', template === undefined ? '—' : template.label),
        row('РАСПИСАНИЕ', staffing === undefined ? '—' : staffing.label),
      ].join('') + schematic(w);

    if (w.status === 'dead') {
      banner.hidden = false;
      banner.innerHTML = '<b>СУБЪЕКТ ЛИКВИДИРОВАН</b><span>[F2] ВЕРНУТЬСЯ В ВЕСТИБЮЛЬ</span>';
    } else if (w.status === 'cleared') {
      banner.hidden = false;
      banner.innerHTML = '<b>СЕКТОР СДАН</b><span>ЗАВЕДУЮЩИЙ ОТСТРАНЁН · [F2] В ВЕСТИБЮЛЬ</span>';
    } else {
      banner.hidden = true;
    }
  };

  return {
    update(w, fps, hitboxes, dt) {
      cooldown -= dt;
      if (cooldown > 0) return;
      cooldown = TUNING.debug.overlayInterval;
      if (w.scene === 'lobby') renderLobby(w, fps, hitboxes);
      else render(w, fps, hitboxes);
    },
    toggleDossier() {
      dossierOpen = !dossierOpen;
      dossier.hidden = !dossierOpen;
      // Следующий кадр оверлея соберёт содержимое.
      cooldown = 0;
    },
  };
}

/** Текущая форма, её боезапас и заряд. */
function weaponRows(w: World): string {
  const player = w.playerC.get(w.player);
  if (player === undefined) return '';
  const form = currentForm(w);
  const index = WEAPON_FORMS.findIndex((f) => f.id === form.id);
  const max = ammoMax(w, form.id);
  const have = Math.floor(player.ammo[index] ?? 0);
  const cost = Math.max(0, formStat(w, form.id, 'cost'));
  const ready = have >= cost;

  const rows = [row('ФОРМА (КОЛЕСО)', `<span class="ok">${form.code} · ${form.title}</span>`)];

  if (player.reloading) {
    const full = formStat(w, form.id, 'reloadTime');
    const done = full <= 0 ? 1 : Math.max(0, Math.min(1, 1 - player.reloadTimer / full));
    rows.push(
      row('ПЕРЕЗАРЯДКА', `<span class="warn">${gauge(Math.round(done * 10), 10)}</span>`),
    );
  } else {
    rows.push(
      row('ОБОЙМА (R)', `<span class="${ready ? 'ok' : 'warn'}">${gauge(have, max)} ${have}/${max}</span>`),
    );
  }
  if (form.id === 'lance' && !player.reloading) {
    const full = formStat(w, 'lance', 'chargeTime');
    const ratio = full <= 0 ? 1 : Math.min(1, player.charge / full);
    rows.push(row('ЗАРЯД', `<span class="ok">${gauge(Math.round(ratio * 10), 10)}</span>`));
  }
  return rows.join('');
}

/** Кто на участке старше рядового: мини-босс или сам Заведующий. */
function rankRow(w: World): string {
  if (hasChief(w)) return row('НА УЧАСТКЕ', '<span class="warn">ЗАВЕДУЮЩИЙ СЕКТОРОМ</span>');
  for (const [, staff] of w.staffC) {
    if (staff.priority > 1) continue;
    return row('НА УЧАСТКЕ', `<span class="warn">${staff.title}</span>`);
  }
  return '';
}

/** Курьер в пути — сигнал бросить перестрелку и бежать на перехват. */
function courierRow(w: World): string {
  if (w.courierC.size === 0) return '';
  const runner = courierTarget(w);
  const courier = runner === null ? undefined : w.courierC.get(runner.entity);
  if (courier !== undefined && courier.phase === 'deliver') {
    return row('КУРЬЕР', '<span class="warn">ВЫЗЫВАЕТ ПОДКРЕПЛЕНИЕ</span>');
  }
  return row('КУРЬЕР', '<span class="warn">БЕЖИТ К ДВЕРИ</span>');
}

/** Опись Ревизора: пока она идёт, он неуязвим. */
function auditRow(w: World): string {
  if (w.auditorC.size === 0) return '';
  if (!auditInProgress(w)) {
    return row('ОПИСЬ', '<span class="ok">ЗАКОНЧЕНА · РЕВИЗОР ОТКРЫТ</span>');
  }
  const left = pendingItems(w);
  return row('ОПИСЬ', `<span class="warn">ОСТАЛОСЬ ${left} · НЕУЯЗВИМ</span>`);
}

/** Телекинез: запас энергии и что сейчас в руках. */
function energyRow(w: World): string {
  const player = w.playerC.get(w.player);
  if (player === undefined) return '';
  const max = Math.max(1, TUNING.telekinesis.energyMax);
  const ratio = Math.max(0, Math.min(1, player.energy / max));
  const enough = player.energy >= TUNING.telekinesis.grabCost;
  const held = w.propC.get(player.held);
  return (
    row('ЭНЕРГИЯ (ПКМ)', `<span class="${enough ? 'ok' : 'warn'}">${gauge(Math.round(ratio * 10), 10)}</span>`) +
    (held === undefined ? '' : row('В ЗАХВАТЕ', `<span class="ok">${held.title}</span>`))
  );
}

/** Личное дело: служебные отчёты по выданным предметам. */
function dossierBody(w: World): string {
  const head = '<b>ЛИЧНОЕ ДЕЛО СУБЪЕКТА</b><span class="dossier-hint">[I] ЗАКРЫТЬ</span>';
  if (w.build.length === 0) {
    return `${head}<div class="dossier-item"><div class="dossier-line">ВЫДАЧ НЕ ЗАФИКСИРОВАНО.</div></div>`;
  }
  const blocks = w.build.map((id) => {
    const item = ITEMS_BY_ID.get(id);
    if (item === undefined) return '';
    const lines = item.report.map((line) => `<div class="dossier-line">${line}</div>`).join('');
    return `<div class="dossier-item"><div class="dossier-code">${item.code} · ${item.title}</div>${lines}</div>`;
  });
  return head + blocks.join('');
}

function gauge(current: number, max: number): string {
  const width = Math.min(max, TUNING.hud.gaugeWidth);
  const filled = max <= 0 ? 0 : Math.round((current / max) * width);
  let out = '';
  for (let i = 0; i < width; i++) out += i < filled ? '#' : '.';
  return out;
}

/** Схема этажа: квадрат — помещение, черта — дверь. */
function schematic(w: World): string {
  const step = TUNING.hud.mapStep;
  const cell = TUNING.hud.mapCell;
  const half = cell / 2;
  const width = w.floor.width * step;
  const height = w.floor.height * step;
  const parts: string[] = [];

  for (const room of w.floor.rooms) {
    const cx = room.gx * step + half;
    const cy = room.gy * step + half;
    for (const dir of DIRS) {
      const other = w.floor.rooms[room.neighbors[dir]];
      if (other === undefined || other.index < room.index) continue;
      const ox = other.gx * step + half;
      const oy = other.gy * step + half;
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${ox}" y2="${oy}" stroke="${hex(PALETTE.concreteMid)}" stroke-width="${TUNING.hud.mapLink}"/>`,
      );
    }
  }

  for (const room of w.floor.rooms) {
    const x = room.gx * step;
    const y = room.gy * step;
    const current = room.index === w.room;
    let fill = hex(PALETTE.black);
    let stroke = hex(PALETTE.concrete);
    if (current) {
      fill = hex(PALETTE.yellow);
      stroke = hex(PALETTE.yellow);
    } else if (room.cleared) {
      fill = hex(PALETTE.concrete);
      stroke = hex(PALETTE.concreteMid);
    } else if (room.visited) {
      stroke = hex(PALETTE.red);
    }
    parts.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="${stroke}" stroke-width="${TUNING.hud.mapStroke}"/>`,
    );
    // Посещённый, но не зачищенный участок со старшей ставкой — жёлтая метка.
    if (room.visited && !room.cleared && !current && room.miniBoss !== '') {
      const inset = TUNING.hud.mapEndInset;
      parts.push(
        `<rect x="${x + inset}" y="${y + inset}" width="${cell - inset * 2}" height="${cell - inset * 2}" fill="${hex(PALETTE.yellow)}"/>`,
      );
    }
    // Приёмная видна на схеме всегда: этаж кончается там.
    if (room.index === w.floor.end && !current) {
      const inset = TUNING.hud.mapEndInset;
      parts.push(
        `<rect x="${x + inset}" y="${y + inset}" width="${cell - inset * 2}" height="${cell - inset * 2}" fill="${hex(PALETTE.red)}"/>`,
      );
    }
  }

  return `<svg class="hud-schematic" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Пока Регистратор жив, вакансии закрываются — это и есть угроза. */
function vacancyLine(w: World): string {
  const open = vacancyCount(w);
  if (!hasRegistrar(w)) return `<span>${open} · НЕКОМУ</span>`;
  return `<span class="${open > 0 ? 'warn' : 'ok'}">${open} · ОТДЕЛ РАБОТАЕТ</span>`;
}

function row(label: string, value: string): string {
  return `<div class="row"><span class="key">${label}</span><span class="val">${value}</span></div>`;
}

function bar(current: number, max: number): string {
  let out = '';
  for (let i = 0; i < max; i++) out += i < current ? '#' : '.';
  return `<span class="${current <= 1 ? 'warn' : 'ok'}">${out}</span>`;
}
