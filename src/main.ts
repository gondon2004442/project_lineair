/**
 * Точка входа: фиксированный шаг симуляции 60 Hz,
 * рендер идёт своим темпом и интерполирует между шагами.
 */
import './style.css';
import { createHud } from './hud';
import { createInput } from './input';
import { createPanel } from './panel';
import { createRenderer } from './render';
import { resolveSeed, seedPinned } from './rng';
import { step } from './step';
import { STEP, TUNING } from './tuning';
import { createWorld, enterLobby, enterRoom } from './world';

async function boot(): Promise<void> {
  const host = document.getElementById('stage');
  const hudLeft = document.getElementById('hud-left');
  const hudRight = document.getElementById('hud-right');
  const hudMap = document.getElementById('hud-map');
  const hudDossier = document.getElementById('hud-dossier');
  const hudBanner = document.getElementById('hud-banner');
  const panelHost = document.getElementById('panel');
  if (
    host === null ||
    hudLeft === null ||
    hudRight === null ||
    hudMap === null ||
    hudDossier === null ||
    hudBanner === null ||
    panelHost === null
  ) {
    throw new Error('Разметка оверлея не найдена');
  }

  const renderer = await createRenderer(host);
  const input = createInput(renderer.app.canvas);
  const hud = createHud(hudLeft, hudRight, hudMap, hudDossier, hudBanner);

  // Панель поднимается первой: она восстанавливает значения прошлого сеанса,
  // и первый же мир должен собираться уже по ним.
  const panel = createPanel(panelHost, {
    restart: () => rebuild(),
    resize: () => renderer.layout(),
  });

  let seed = resolveSeed();
  let world = createWorld(seed, input.snapshot);

  /** F2 — выход из забега обратно в вестибюль. Этаж остаётся тем же. */
  function toLobby(): void {
    enterLobby(world);
    panel.clearRestartFlag();
  }

  /** E в вестибюле — перевыдача seed, то есть другой этаж. */
  function rerollSeed(): void {
    if (world.scene !== 'lobby' || seedPinned()) return;
    seed = resolveSeed();
    world = createWorld(seed, input.snapshot);
    panel.clearRestartFlag();
  }

  /** Смена крутилок, читаемых при рождении: пересобираем этаж заново. */
  function rebuild(): void {
    world = createWorld(seed, input.snapshot);
    panel.clearRestartFlag();
  }

  input.setProjection((sx, sy) => renderer.screenToWorld(sx, sy));
  input.onRestart(toLobby);
  input.onReroll(rerollSeed);
  input.onToggleHitboxes(() => {
    renderer.showHitboxes = !renderer.showHitboxes;
  });
  input.onToggleDossier(() => hud.toggleDossier());

  // Отладочный доступ из консоли: ручной прогон симуляции и проверка детерминизма.
  Object.defineProperty(window, 'lineair', {
    value: { world: () => world, createWorld, enterRoom, step, tuning: TUNING },
  });

  renderer.layout();
  window.addEventListener('resize', () => renderer.layout());

  let accumulator = 0;
  renderer.app.ticker.add((ticker) => {
    const frame = Math.min(ticker.deltaMS, TUNING.sim.maxFrameMs) / 1000;
    accumulator += frame;
    while (accumulator >= STEP) {
      step(world);
      accumulator -= STEP;
    }
    renderer.draw(world, accumulator / STEP);
    hud.update(world, ticker.FPS, renderer.showHitboxes, frame);
  });
}

void boot();
