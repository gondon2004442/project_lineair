/**
 * Точка входа: фиксированный шаг симуляции 60 Hz,
 * рендер идёт своим темпом и интерполирует между шагами.
 */
import './style.css';
import { caseNote, fileCase, filePrecedent, readArchive, readPrecedents } from './archive';
import { createAudio } from './audio';
import { createHud } from './hud';
import { createInput } from './input';
import { createPanel } from './panel';
import { profiler } from './profiler';
import { createRenderer } from './render';
import { createRenderer3D } from './render3d';
import { grantItem, pickItem, synergyFactor } from './paperwork';
import { makeRng, resolveSeed, seedPinned } from './rng';
import { step } from './step';
import { STEP, TUNING } from './tuning';
import { DIRECTIVES, issuedDirectives } from './data/directives';
import { ITEMS, ITEM_ID_CLASHES } from './data/items';
import { spawnProp, spawnStaff } from './spawn';
import { damageFactorAgainst, hasTrait, penaltyOf, statAt } from './weapon';
import { applyDamage } from './systems/damage';
import { ticketValue } from './systems/tickets';
import { counterInReach, counterOffer } from './systems/counter';
import { deskPrice, issueOffer, safeContents } from './systems/issue';
import { DECOR, DECOR_BY_ID, DECOR_TOO_LIGHT } from './data/decor';
import { TEMPLATES_BY_ID } from './data/roomTemplates';
import { isSolidPoint, liftOpen } from './room';
import { floorAt } from './data/floors';
import { SUBJECTS, SUBJECT_START, subjectAt } from './data/subjects';
import { shownRoom } from './hud';
import { createWorld, descend, enterLobby, enterRoom, startRun } from './world';
import type { World } from './ecs';

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

  // Тестовая ветка визуала: по умолчанию объём, плоский вид — по ?view=2d.
  const flat = new URLSearchParams(window.location.search).get('view') === '2d';
  const renderer = flat ? await createRenderer(host) : await createRenderer3D(host);
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

  /**
   * Открытые субъекты: стартовый плюс те, кого открыли прецеденты
   * прошлых забегов. Симуляция хранилища не знает, поэтому список
   * выкладывается ей снаружи — как архив и как звук.
   */
  function unlockedSubjects(): string[] {
    const filed = readPrecedents();
    return SUBJECTS.filter((s) => s.id === SUBJECT_START || filed.includes(s.id)).map((s) => s.id);
  }

  function newWorld(): World {
    const next = createWorld(seed, input.snapshot);
    next.unlocked = unlockedSubjects();
    next.filed = readPrecedents();
    // Кем играли в прошлый раз, тем и выходим, пока он ещё открыт.
    next.subject = next.unlocked.includes(chosen) ? chosen : SUBJECT_START;
    return next;
  }

  let seed = resolveSeed();
  let chosen = SUBJECT_START;
  let world = newWorld();

  /** Tab в вестибюле: следующий открытый субъект. */
  function cycleSubject(): void {
    if (world.scene !== 'lobby') return;
    const pool = world.unlocked;
    if (pool.length <= 1) return;
    const at = pool.indexOf(world.subject);
    chosen = pool[(at + 1) % pool.length] ?? SUBJECT_START;
    world.subject = chosen;
  }

  /** F2 — выход из забега обратно в вестибюль. Этаж остаётся тем же. */
  function toLobby(): void {
    enterLobby(world);
    panel.clearRestartFlag();
  }

  /** E в вестибюле — перевыдача seed, то есть другой этаж. */
  function rerollSeed(): void {
    if (world.scene !== 'lobby' || seedPinned()) return;
    seed = resolveSeed();
    world = newWorld();
    panel.clearRestartFlag();
  }

  /** Смена крутилок, читаемых при рождении: пересобираем этаж заново. */
  function rebuild(): void {
    world = newWorld();
    panel.clearRestartFlag();
  }

  input.setProjection((sx, sy) => renderer.screenToWorld(sx, sy));
  input.onRestart(toLobby);
  input.onReroll(rerollSeed);
  input.onCycleSubject(cycleSubject);
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
      // Вертикаль: стенд спускает мир руками и сверяет, что переехало.
      descend,
      startRun,
      liftOpen,
      // Бетон нужен стенду скобы: иначе не измерить, к чему пришило.
      isSolidPoint,
      // Описание уровня нужно стенду печатей: кто держит печать.
      floorAt,
      // Субъекты нужны стенду: иначе не проверить, что свойство доходит
      // до распоряжений, а освобождение — до путей тюнинга.
      subjectAt,
      subjects: SUBJECTS,
      // Свойство: стенд сверяет, что освобождённый отдаёт своё.
      hasTrait,
      // Искажение схемы проверяется только так: на экране это метка,
      // а числом — номер участка, который она показывает.
      shownRoom,
      step,
      spawnStaff,
      // Мебель нужна стенду скобы: к ней пришивают так же, как к стене.
      spawnProp,
      statAt,
      // Ось «против должности» проверяется только так: путь тюнинга
      // про цель ничего не знает.
      damageFactorAgainst,
      // Действующее взыскание: стенд сверяет его с заработанным.
      penaltyOf,
      // Урон нужен стенду: иначе не проверить, что множитель доходит
      // до здоровья, а не только до формулы.
      applyDamage,
      // Номинал ставки нужен стенду: по нему считается доход этажа,
      // а от дохода — цены прилавка.
      ticketValue,
      counterInReach,
      counterOffer,
      issueOffer,
      // Цены прилавка нужны стенду: иначе не сверить надпись со списанным.
      deskPrice,
      // Опись содержимого: стенд сверяет обещанное с выданным.
      safeContents,
      issuedDirectives,
      pickItem,
      // Выдача нужна стенду: иначе не проверить, что инвентарь ложится
      // в слот, а не в дело.
      grantItem,
      synergyFactor,
      makeRng,
      items: ITEMS,
      itemIdClashes: ITEM_ID_CLASHES,
      directives: DIRECTIVES,
      // Антураж и шаблоны нужны стенду: иначе слой декора нечем
      // нагрузить и правило светлоты нечем проверить.
      decor: DECOR,
      decorById: DECOR_BY_ID,
      decorTooLight: DECOR_TOO_LIGHT,
      templates: TEMPLATES_BY_ID,
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
    // Прецеденты: освобождённый открывается для будущих забегов. Список
    // открытых пересобирается тут же — иначе он обновился бы только со
    // следующим миром, и игрок не увидел бы, что открыл.
    if (world.precedents.length > 0) {
      for (const id of world.precedents) filePrecedent(id);
      world.precedents.length = 0;
      world.unlocked = unlockedSubjects();
      world.filed = readPrecedents();
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
    if (renderer.events !== undefined) {
      for (const id of renderer.events) audio.play(id);
      renderer.events.length = 0;
    }

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
