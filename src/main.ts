/**
 * Точка входа: фиксированный шаг симуляции 60 Hz,
 * рендер идёт своим темпом и интерполирует между шагами.
 */
import './style.css';
import { createHud } from './hud';
import { createInput } from './input';
import { createPanel } from './panel';
import { createRenderer } from './render';
import { resolveSeed } from './rng';
import { step } from './step';
import { STEP, TUNING } from './tuning';
import { createWorld } from './world';

async function boot(): Promise<void> {
  const host = document.getElementById('stage');
  const hudLeft = document.getElementById('hud-left');
  const hudRight = document.getElementById('hud-right');
  const hudMap = document.getElementById('hud-map');
  const hudBanner = document.getElementById('hud-banner');
  const panelHost = document.getElementById('panel');
  if (
    host === null ||
    hudLeft === null ||
    hudRight === null ||
    hudMap === null ||
    hudBanner === null ||
    panelHost === null
  ) {
    throw new Error('Разметка оверлея не найдена');
  }

  const renderer = await createRenderer(host);
  const input = createInput(renderer.app.canvas);
  const hud = createHud(hudLeft, hudRight, hudMap, hudBanner);

  // Панель поднимается первой: она восстанавливает значения прошлого сеанса,
  // и первый же мир должен собираться уже по ним.
  const panel = createPanel(panelHost, {
    restart: () => restartRun(),
    resize: () => renderer.layout(),
  });

  const seed = resolveSeed();
  let world = createWorld(seed, input.snapshot);

  function restartRun(): void {
    // Тот же seed — тот же этаж.
    world = createWorld(seed, input.snapshot);
    panel.clearRestartFlag();
  }

  input.setProjection((sx, sy) => renderer.screenToWorld(sx, sy));
  input.onRestart(restartRun);
  input.onToggleHitboxes(() => {
    renderer.showHitboxes = !renderer.showHitboxes;
  });

  // Отладочный доступ из консоли: ручной прогон симуляции и проверка детерминизма.
  Object.defineProperty(window, 'lineair', {
    value: { world: () => world, createWorld, step },
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
