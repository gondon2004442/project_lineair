/**
 * Точка входа: фиксированный шаг симуляции 60 Hz,
 * рендер идёт своим темпом и интерполирует между шагами.
 */
import './style.css';
import { caseNote, fileCase, readArchive } from './archive';
import { createAudio } from './audio';
import { createHud } from './hud';
import { createInput } from './input';
import { createPanel } from './panel';
import { profiler } from './profiler';
import { createRenderer } from './render';
import { pickItem, synergyFactor } from './paperwork';
import { makeRng, resolveSeed, seedPinned } from './rng';
import { step } from './step';
import { STEP, TUNING } from './tuning';
import { DIRECTIVES, issuedDirectives } from './data/directives';
import { ITEMS } from './data/items';
import { spawnStaff } from './spawn';
import { statAt } from './weapon';
import { counterInReach, counterOffer } from './systems/counter';
import { createWorld, enterLobby, enterRoom } from './world';

/** Приоритеты тикера Pixi: наш проход до отрисовки и замер сразу после неё. */
const TICKER_BEFORE_RENDER = 0;
const TICKER_AFTER_RENDER = -100;

async function boot(): Promise<void> {
  const host = document.getElementById('stage');
  const hudLeft = document.getElementById('hud-left');
  const hudRight = document.getElementById('hud-right');
  const hudMap = document.getElementById('hud-map');
  const hudDossier = document.getElementById('hud-dossier');
  const hudProfile = document.getElementById('hud-profile');
  const hudBanner = document.getElementById('hud-banner');
  const panelHost = document.getElementById('panel');
  if (
    host === null ||
    hudLeft === null ||
    hudRight === null ||
    hudMap === null ||
    hudDossier === null ||
    hudProfile === null ||
    hudBanner === null ||
    panelHost === null
  ) {
    throw new Error('Разметка оверлея не найдена');
  }

  const renderer = await createRenderer(host);
  const input = createInput(renderer.app.canvas);
  const hud = createHud(hudLeft, hudRight, hudMap, hudDossier, hudProfile, hudBanner);
  const audio = createAudio();
  // Браузер не даст звучать раньше первого действия пользователя.
  for (const event of ['pointerdown', 'keydown']) {
    window.addEventListener(event, () => audio.resume());
  }

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
  input.onToggleProfiler(() => {
    profiler.enabled = !profiler.enabled;
  });

  // Отладочный доступ из консоли: ручной прогон симуляции и проверка детерминизма.
  Object.defineProperty(window, 'lineair', {
    // Отладочная ручка. spawnStaff нужен проверке силуэтов: поставить
    // все должности в ряд иначе нечем — в одной комнате они не встречаются.
    // statAt и issuedDirectives нужны проверке распоряжений: иначе
    // пришлось бы вычитывать числа с экрана.
    value: {
      world: () => world,
      createWorld,
      enterRoom,
      step,
      spawnStaff,
      statAt,
      counterInReach,
      counterOffer,
      issuedDirectives,
      pickItem,
      synergyFactor,
      makeRng,
      items: ITEMS,
      directives: DIRECTIVES,
      tuning: TUNING,
    },
  });

  renderer.layout();
  window.addEventListener('resize', () => renderer.layout());

  let accumulator = 0;
  let frameStart = performance.now();
  let buildDone = frameStart;

  renderer.app.ticker.add((ticker) => {
    frameStart = performance.now();
    const frame = Math.min(ticker.deltaMS, TUNING.sim.maxFrameMs) / 1000;
    // Замедление на бланк: тормозится только подача реального времени в
    // накопитель. Сам шаг остаётся фиксированным, поэтому симуляция и
    // её детерминизм не знают, что ход замедлился.
    const scale = world.fx.slowMo > 0 ? TUNING.blank.slowMoScale : 1;
    accumulator += frame * scale;

    profiler.begin('СИМУЛЯЦИЯ');
    while (accumulator >= STEP) {
      step(world);
      accumulator -= STEP;
    }
    profiler.end('СИМУЛЯЦИЯ');

    // Звук снимается после симуляции: системы её не знают, она — звука.
    // Архив живёт вне симуляции, как и звук: она только помечает, что
    // забег кончился или что дело достали с полки.
    if (world.runEnded !== '') {
      fileCase({
        seed: world.seed,
        room: world.room,
        rooms: world.floor.rooms.length,
        reason: world.runEnded === 'dead' ? 'отзыв допуска' : 'сектор сдан',
        attachments: world.build.length,
        commendations: world.commendations,
      });
      world.runEnded = '';
    }
    if (world.noteSlot >= 0) {
      const shelf = readArchive();
      world.note =
        shelf.length === 0
          ? ['ДЕЛО ИЗЪЯТО. ПРЕДЫДУЩИХ ЭКЗЕМПЛЯРОВ НЕ ЗАФИКСИРОВАНО.']
          : caseNote(shelf[world.noteSlot % shelf.length] ?? shelf[0]);
      world.noteSlot = -1;
    }

    profiler.begin('ЗВУК');
    for (const id of world.sounds) audio.play(id);
    world.sounds.length = 0;
    profiler.end('ЗВУК');

    profiler.begin('СБОРКА КАДРА');
    renderer.draw(world, accumulator / STEP);
    profiler.end('СБОРКА КАДРА');

    profiler.begin('ОВЕРЛЕЙ');
    hud.update(world, ticker.FPS, renderer.showHitboxes, frame);
    profiler.end('ОВЕРЛЕЙ');

    // Панель профайлера считается отдельно от игрового оверлея. В одном
    // ведре это была смесь измеряемого с измеряющим: игровой оверлей
    // перестраивается раз в debug.overlayInterval, панель — каждый кадр,
    // и её цена исчезает вместе с F3.
    profiler.begin('ПАНЕЛЬ ЗАМЕРОВ');
    hud.profile(profiler, world);
    profiler.end('ПАНЕЛЬ ЗАМЕРОВ');

    buildDone = performance.now();
  }, undefined, TICKER_BEFORE_RENDER);

  // Отдельный проход с самым низким приоритетом: он идёт уже после того,
  // как Pixi отправил кадр в GPU, поэтому здесь видно цену самой отправки.
  renderer.app.ticker.add(() => {
    const now = performance.now();
    profiler.addSubmit(now - buildDone);
    profiler.endFrame(now - frameStart);
  }, undefined, TICKER_AFTER_RENDER);
}

void boot();
