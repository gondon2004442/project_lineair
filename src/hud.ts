/** Служебный оверлей: состояние субъекта, схема этажа, отладка, seed. */
import { TEMPLATES_BY_ID } from './data/roomTemplates';
import { POST_REGISTRAR } from './data/posts';
import { STAFFING_BY_ID } from './data/staffing';
import { entityCount, type World } from './ecs';
import { PALETTE } from './palette';
import { DIRS } from './room';
import { formatSeed } from './rng';
import { TUNING } from './tuning';
import { hasRegistrar, vacancyCount } from './systems/staff';
import { clearedCount, currentRoom } from './world';

export interface Hud {
  update(w: World, fps: number, hitboxes: boolean, dt: number): void;
}

export function createHud(
  left: HTMLElement,
  right: HTMLElement,
  map: HTMLElement,
  banner: HTMLElement,
): Hud {
  let cooldown = 0;

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
      row('ВАКАНСИЙ', vacancyLine(w)),
      row('ДВЕРИ', w.map.doorsLocked ? '<span class="warn">ЗАПЕРТЫ</span>' : '<span class="ok">ОТКРЫТЫ</span>'),
    ].join('');

    right.innerHTML = [
      row('SEED', formatSeed(w.seed)),
      row('FPS', String(Math.round(fps))),
      row('СУЩНОСТЕЙ', String(entityCount(w))),
      row('ШАГ', String(w.tick)),
      row('F1 ХИТБОКСЫ', hitboxes ? '<span class="ok">ВКЛ</span>' : 'ВЫКЛ'),
      row('R', 'ПОВТОР'),
    ].join('');

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
      banner.innerHTML = '<b>СУБЪЕКТ ЛИКВИДИРОВАН</b><span>[R] ПОВТОРИТЬ ИСПЫТАНИЕ</span>';
    } else if (w.status === 'cleared') {
      banner.hidden = false;
      banner.innerHTML = '<b>ЭТАЖ ЗАЧИЩЕН</b><span>[R] ПОВТОРИТЬ ИСПЫТАНИЕ</span>';
    } else {
      banner.hidden = true;
    }
  };

  return {
    update(w, fps, hitboxes, dt) {
      cooldown -= dt;
      if (cooldown > 0) return;
      cooldown = TUNING.debug.overlayInterval;
      render(w, fps, hitboxes);
    },
  };
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
    // Посещённый, но не зачищенный участок с кадровым отделом — жёлтая метка.
    if (room.visited && !room.cleared && !current && hasRegistrarPost(room.staffing)) {
      const inset = TUNING.hud.mapEndInset;
      parts.push(
        `<rect x="${x + inset}" y="${y + inset}" width="${cell - inset * 2}" height="${cell - inset * 2}" fill="${hex(PALETTE.yellow)}"/>`,
      );
    }
    if (room.index === w.floor.end && !current) {
      const inset = TUNING.hud.mapEndInset;
      parts.push(
        `<rect x="${x + inset}" y="${y + inset}" width="${cell - inset * 2}" height="${cell - inset * 2}" fill="${hex(PALETTE.red)}"/>`,
      );
    }
  }

  return `<svg class="hud-schematic" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}

/** Есть ли в расписании участка ставка Регистратора. */
function hasRegistrarPost(staffing: string): boolean {
  const table = STAFFING_BY_ID.get(staffing);
  if (table === undefined) return false;
  return table.posts.some((post) => post.post === POST_REGISTRAR);
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
