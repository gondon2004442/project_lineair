/** Служебный оверлей: состояние субъекта, отладка, seed. */
import type { World } from './ecs';
import { entityCount } from './ecs';
import { formatSeed } from './rng';
import { TUNING } from './tuning';

export interface Hud {
  update(w: World, fps: number, hitboxes: boolean, dt: number): void;
}

export function createHud(left: HTMLElement, right: HTMLElement, banner: HTMLElement): Hud {
  let cooldown = 0;

  const render = (w: World, fps: number, hitboxes: boolean): void => {
    const h = w.health.get(w.player);
    const p = w.playerC.get(w.player);
    const hp = h === undefined ? 0 : Math.max(0, h.hp);
    const max = h === undefined ? 0 : h.max;
    const dashReady = p === undefined || p.dashCooldown <= 0;

    left.innerHTML = [
      row('СУБЪЕКТ', bar(hp, max)),
      row('РЫВОК', dashReady ? '<span class="ok">ГОТОВ</span>' : '<span class="warn">ПЕРЕЗАРЯД</span>'),
      row('ЗАРАЖЁННЫХ', String(w.enemyC.size)),
    ].join('');

    right.innerHTML = [
      row('SEED', formatSeed(w.seed)),
      row('FPS', String(Math.round(fps))),
      row('СУЩНОСТЕЙ', String(entityCount(w))),
      row('ШАГ', String(w.tick)),
      row('F1 ХИТБОКСЫ', hitboxes ? '<span class="ok">ВКЛ</span>' : 'ВЫКЛ'),
      row('R', 'ПОВТОР'),
    ].join('');

    if (w.status === 'dead') {
      banner.hidden = false;
      banner.innerHTML = '<b>СУБЪЕКТ ЛИКВИДИРОВАН</b><span>[R] ПОВТОРИТЬ ИСПЫТАНИЕ</span>';
    } else if (w.status === 'cleared') {
      banner.hidden = false;
      banner.innerHTML = '<b>СЕКТОР ЗАЧИЩЕН</b><span>[R] ПОВТОРИТЬ ИСПЫТАНИЕ</span>';
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

function row(label: string, value: string): string {
  return `<div class="row"><span class="key">${label}</span><span class="val">${value}</span></div>`;
}

function bar(current: number, max: number): string {
  let out = '';
  for (let i = 0; i < max; i++) out += i < current ? '#' : '.';
  return `<span class="${current <= 1 ? 'warn' : 'ok'}">${out}</span>`;
}
