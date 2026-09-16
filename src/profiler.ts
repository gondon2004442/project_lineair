/**
 * Профайлер. Только измеряет и ничего не чинит.
 *
 * Показания усредняются по окну кадров, иначе на глаз читать нечего:
 * один кадр прыгает от 0.1 до 3 мс на ровном месте.
 *
 * Честно про две метрики:
 *   - Вызовы отрисовки считаются перехватом самого WebGL, а не расспросом
 *     Pixi: так число верное независимо от его внутренностей.
 *   - Сборок мусора браузер не сообщает никому. Мы считаем провалы кучи
 *     через performance.memory, и это догадка, а не событие GC. В не-Chrome
 *     этого поля нет вовсе, тогда в строке стоит прочерк.
 */
import { TUNING } from './tuning';

export interface ProfileRow {
  key: string;
  ms: number;
  share: number;
}

export interface ProfileStats {
  frameMs: number;
  /**
   * Ровность хода. Среднее время кадра ничего не говорит о рывках: сто
   * ровных кадров и один вчетверо длиннее дают то же среднее, а глаз
   * видит рывок. Поэтому середина, хвост и самый долгий кадр по окну.
   */
  frameP50: number;
  frameP95: number;
  frameMax: number;
  /** Кадров длиннее двух серединных — их и видно как рывки. */
  longFrames: number;
  simMs: number;
  buildMs: number;
  submitMs: number;
  hudMs: number;
  /** Цена самой панели профайлера. Не игра: без F3 её нет. */
  panelMs: number;
  drawCalls: number;
  spawned: number;
  destroyed: number;
  steps: number;
  /** Уборок мусора замечено с момента включения. Счётчик накопительный. */
  gc: number;
  heapMb: number | null;
}

interface HeapWindow {
  memory?: { usedJSHeapSize: number };
}

export interface Profiler {
  enabled: boolean;
  begin(key: string): void;
  end(key: string): void;
  /** Сколько сущностей родилось и умерло за кадр. */
  countSpawn(n: number): void;
  countDestroy(n: number): void;
  countStep(): void;
  /** Цена отправки кадра в GPU: замеряется снаружи, после отрисовки Pixi. */
  addSubmit(ms: number): void;
  /** Счётчик вызовов отрисовки: сюда подключается перехват WebGL. */
  bumpDrawCalls(n: number): void;
  endFrame(frameMs: number): void;
  rows(): ProfileRow[];
  stats(): ProfileStats;
}

/**
 * Единственный экземпляр. Отладочному инструменту разрешено быть
 * глобальным: тащить его параметром через все системы значило бы
 * переписать сигнатуры ради того, что по умолчанию выключено.
 */
export function createProfiler(): Profiler {
  const open = new Map<string, number>();
  const frame = new Map<string, number>();
  const totals = new Map<string, number>();
  const order: string[] = [];

  let frames = 0;
  let frameMsTotal = 0;
  let drawCalls = 0;
  let drawCallsTotal = 0;
  let spawned = 0;
  let spawnedTotal = 0;
  let destroyed = 0;
  let destroyedTotal = 0;
  let steps = 0;
  let stepsTotal = 0;

  let gc = 0;
  let lastHeap = 0;
  let heapMb: number | null = null;

  let shown: ProfileRow[] = [];
  let frameTimes: number[] = [];
  let shownStats: ProfileStats = {
    frameMs: 0,
    frameP50: 0,
    frameP95: 0,
    frameMax: 0,
    longFrames: 0,
    simMs: 0,
    buildMs: 0,
    submitMs: 0,
    hudMs: 0,
    panelMs: 0,
    drawCalls: 0,
    spawned: 0,
    destroyed: 0,
    steps: 0,
    gc: 0,
    heapMb: null,
  };

  const profiler: Profiler = {
    enabled: TUNING.debug.profiler,

    begin(key) {
      if (!profiler.enabled) return;
      if (!order.includes(key)) order.push(key);
      open.set(key, performance.now());
    },

    end(key) {
      if (!profiler.enabled) return;
      const started = open.get(key);
      if (started === undefined) return;
      frame.set(key, (frame.get(key) ?? 0) + (performance.now() - started));
      open.delete(key);
    },

    countSpawn(n) {
      if (!profiler.enabled) return;
      spawned += n;
    },
    countDestroy(n) {
      if (!profiler.enabled) return;
      destroyed += n;
    },
    countStep() {
      if (!profiler.enabled) return;
      steps += 1;
    },
    addSubmit(ms) {
      if (!profiler.enabled) return;
      if (!order.includes('ОТПРАВКА В GPU')) order.push('ОТПРАВКА В GPU');
      frame.set('ОТПРАВКА В GPU', ms);
    },
    bumpDrawCalls(n) {
      if (!profiler.enabled) return;
      drawCalls += n;
    },

    endFrame(frameMs) {
      // Выключенный профайлер не стоит ничего: ни замеров, ни счётчиков.
      if (!profiler.enabled) return;
      frames += 1;
      frameMsTotal += frameMs;
      frameTimes.push(frameMs);
      drawCallsTotal += drawCalls;
      spawnedTotal += spawned;
      destroyedTotal += destroyed;
      stepsTotal += steps;
      for (const [key, ms] of frame) totals.set(key, (totals.get(key) ?? 0) + ms);

      // Провал кучи между кадрами — след уборки.
      const memory = (performance as unknown as HeapWindow).memory;
      if (memory !== undefined) {
        const used = memory.usedJSHeapSize;
        heapMb = used / (1024 * 1024);
        if (lastHeap > 0 && lastHeap - used > TUNING.debug.gcDropBytes) gc += 1;
        lastHeap = used;
      }

      frame.clear();
      open.clear();
      drawCalls = 0;
      spawned = 0;
      destroyed = 0;
      steps = 0;

      if (frames < TUNING.debug.profileWindow) return;

      const frameAvg = frameMsTotal / frames;
      const sorted = frameTimes.slice().sort((a, b) => a - b);
      const pick50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const pick95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      const longest = sorted[sorted.length - 1] ?? 0;
      const long = sorted.filter((ms) => ms > pick50 * 2).length;
      const pick = (key: string): number => (totals.get(key) ?? 0) / frames;
      shown = order.map((key) => ({
        key,
        ms: pick(key),
        share: frameAvg > 0 ? pick(key) / frameAvg : 0,
      }));
      shownStats = {
        frameMs: frameAvg,
        frameP50: pick50,
        frameP95: pick95,
        frameMax: longest,
        longFrames: long,
        simMs: pick('СИМУЛЯЦИЯ'),
        buildMs: pick('СБОРКА КАДРА'),
        submitMs: pick('ОТПРАВКА В GPU'),
        hudMs: pick('ОВЕРЛЕЙ'),
        panelMs: pick('ПАНЕЛЬ ЗАМЕРОВ'),
        drawCalls: drawCallsTotal / frames,
        spawned: spawnedTotal / frames,
        destroyed: destroyedTotal / frames,
        steps: stepsTotal / frames,
        gc,
        heapMb,
      };

      frames = 0;
      frameMsTotal = 0;
      frameTimes = [];
      drawCallsTotal = 0;
      spawnedTotal = 0;
      destroyedTotal = 0;
      stepsTotal = 0;
      totals.clear();
    },

    rows: () => shown,
    stats: () => shownStats,
  };

  return profiler;
}

export const profiler = createProfiler();

/**
 * Перехват WebGL: считаем настоящие вызовы отрисовки.
 * Ставится один раз на контекст и живёт до конца сеанса.
 */
export function countDrawCalls(gl: WebGL2RenderingContext, profiler: Profiler): void {
  const names = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const;
  for (const name of names) {
    const original = gl[name];
    if (typeof original !== 'function') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gl as any)[name] = function patched(this: WebGL2RenderingContext, ...args: unknown[]): unknown {
      profiler.bumpDrawCalls(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}
