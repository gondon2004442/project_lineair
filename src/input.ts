/**
 * Ввод. Слушатели пишут в один изменяемый снимок,
 * симуляция только читает его на своём шаге.
 */
import { isPanelTarget } from './panel';

export interface InputSnapshot {
  /** Направление движения, компоненты в [-1, 1]. */
  moveX: number;
  moveY: number;
  /** Курсор в координатах мира. */
  aimX: number;
  aimY: number;
  fireHeld: boolean;
  /** ПКМ зажата: телекинез держит объект. */
  grabHeld: boolean;
  /** Рывок запрошен и ещё не израсходован. */
  dashQueued: boolean;
  /** На сколько форм провернули колесо и ещё не отработали. */
  formStep: number;
  /** Перезарядка запрошена и ещё не отработана. */
  reloadQueued: boolean;
  /** Бланк подан и ещё не отработан. */
  blankQueued: boolean;
  /** Оформление добычи запрошено и ещё не отработано. */
  useQueued: boolean;
}

export interface InputDevice {
  snapshot: InputSnapshot;
  /** Экран -> мир. Ставится рендером, знающим текущую посадку сцены. */
  setProjection(project: (sx: number, sy: number) => { x: number; y: number }): void;
  /** Подписки на служебные клавиши: рестарт и хитбоксы. */
  onRestart(handler: () => void): void;
  onToggleHitboxes(handler: () => void): void;
  onToggleDossier(handler: () => void): void;
  onReroll(handler: () => void): void;
  onToggleProfiler(handler: () => void): void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export function createInput(target: HTMLElement): InputDevice {
  const snapshot: InputSnapshot = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    fireHeld: false,
    grabHeld: false,
    dashQueued: false,
    formStep: 0,
    reloadQueued: false,
    blankQueued: false,
    useQueued: false,
  };
  const held = new Set<string>();
  let project = (sx: number, sy: number): { x: number; y: number } => ({ x: sx, y: sy });
  let restart = (): void => {};
  let toggleHitboxes = (): void => {};
  let toggleDossier = (): void => {};
  let reroll = (): void => {};
  let toggleProfiler = (): void => {};

  const recomputeMove = (): void => {
    let mx = 0;
    let my = 0;
    for (const code of held) {
      const dir = MOVE_KEYS[code];
      if (dir === undefined) continue;
      mx += dir[0];
      my += dir[1];
    }
    const len = Math.hypot(mx, my);
    snapshot.moveX = len > 0 ? mx / len : 0;
    snapshot.moveY = len > 0 ? my / len : 0;
  };

  window.addEventListener('keydown', (ev) => {
    if (isPanelTarget(ev.target)) return;
    if (ev.code === 'F1') {
      ev.preventDefault();
      toggleHitboxes();
      return;
    }
    if (ev.code === 'F3') {
      ev.preventDefault();
      toggleProfiler();
      return;
    }
    if (ev.repeat) return;
    if (ev.code === 'F2') {
      ev.preventDefault();
      restart();
      return;
    }
    if (ev.code === 'KeyR') {
      snapshot.reloadQueued = true;
      return;
    }
    if (ev.code === 'KeyQ') {
      snapshot.blankQueued = true;
      return;
    }
    if (ev.code === 'KeyF') {
      snapshot.useQueued = true;
      return;
    }
    if (ev.code === 'KeyI') {
      toggleDossier();
      return;
    }
    if (ev.code === 'KeyE') {
      reroll();
      return;
    }
    if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') {
      snapshot.dashQueued = true;
      return;
    }
    if (MOVE_KEYS[ev.code] !== undefined) {
      held.add(ev.code);
      recomputeMove();
    }
  });

  window.addEventListener('keyup', (ev) => {
    if (isPanelTarget(ev.target)) return;
    if (held.delete(ev.code)) recomputeMove();
  });

  window.addEventListener('blur', () => {
    held.clear();
    recomputeMove();
    snapshot.fireHeld = false;
    snapshot.grabHeld = false;
    snapshot.formStep = 0;
    snapshot.reloadQueued = false;
    snapshot.blankQueued = false;
    snapshot.useQueued = false;
  });

  target.addEventListener('pointermove', (ev) => {
    const p = project(ev.clientX, ev.clientY);
    snapshot.aimX = p.x;
    snapshot.aimY = p.y;
  });

  target.addEventListener('pointerdown', (ev) => {
    if (ev.button === 0) snapshot.fireHeld = true;
    if (ev.button === 2) snapshot.grabHeld = true;
    const p = project(ev.clientX, ev.clientY);
    snapshot.aimX = p.x;
    snapshot.aimY = p.y;
  });

  window.addEventListener('pointerup', (ev) => {
    if (ev.button === 0) snapshot.fireHeld = false;
    if (ev.button === 2) snapshot.grabHeld = false;
  });

  target.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      if (ev.deltaY === 0) return;
      snapshot.formStep += ev.deltaY > 0 ? 1 : -1;
    },
    { passive: false },
  );

  window.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return {
    snapshot,
    setProjection(next) {
      project = next;
    },
    onRestart(handler) {
      restart = handler;
    },
    onToggleHitboxes(handler) {
      toggleHitboxes = handler;
    },
    onToggleDossier(handler) {
      toggleDossier = handler;
    },
    onReroll(handler) {
      reroll = handler;
    },
    onToggleProfiler(handler) {
      toggleProfiler = handler;
    },
  };
}
