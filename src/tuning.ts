/**
 * ВСЕ числовые константы проекта.
 * В системах — только ссылки сюда. Магических чисел в коде быть не должно.
 *
 * Единицы: расстояние — пиксели мира, время — секунды, скорость — px/с,
 * ускорение — px/с², углы в полях *Deg — градусы.
 *
 * Объект намеренно изменяемый: значения правятся на живую.
 */
export const TUNING = {
  sim: {
    /** Частота фиксированного шага симуляции. */
    hz: 60,
    /** Больше этого за кадр не досимулировываем (защита от «спирали смерти»). */
    maxFrameMs: 100,
  },

  room: {
    /** Внутренние размеры помещения в клетках, без стен. */
    cols: 32,
    rows: 18,
    /** Сторона клетки. */
    tile: 32,
    /** Толщина стены в клетках. */
    wall: 1,
  },

  player: {
    radius: 9,
    maxHp: 6,
    /** Целевая скорость при полностью отклонённом вводе. */
    speed: 265,
    /** Разгон до целевой скорости. */
    accel: 3400,
    /** Торможение при отпущенном вводе. */
    friction: 2600,

    /** Рывок: дистанция и длительность задают его скорость. */
    dashDistance: 190,
    dashDuration: 0.16,
    dashCooldown: 0.7,
    /** Окно неуязвимости от начала рывка. */
    dashIFrames: 0.14,
    /** Скорость на выходе из рывка — доля от dash-скорости. */
    dashExitFactor: 0.35,

    /** Неуязвимость после получения урона. */
    hurtIFrames: 0.8,
    /** Отдача, толкающая субъекта назад при выстреле. */
    recoil: 85,
  },

  playerBullet: {
    speed: 900,
    radius: 3.5,
    damage: 1,
    /** Время жизни, если ни во что не попал. */
    life: 1.1,
    /** Разброс от линии прицела. */
    spreadDeg: 1.6,
    /** Интервал между выстрелами при зажатой ЛКМ. */
    interval: 0.13,
    /** Вынос точки вылета от центра субъекта. */
    muzzle: 16,
  },

  enemy: {
    /** Сколько заражённых в помещении. */
    count: 5,
    radius: 11,
    maxHp: 3,
    speed: 96,
    accel: 900,
    friction: 1200,

    /** Дистанция, на которой заражённый хочет держаться. */
    preferredRange: 260,
    /** Ближе preferredRange * backoffRatio — отходит. */
    backoffRatio: 0.62,
    /** Доля скорости, уходящая в боковое смещение. */
    strafeFactor: 0.4,
    /** Как долго держится в зоне обстрела, прежде чем начать каст. */
    aimDelay: 0.55,
    /** Каст: заражённый стоит и телеграфирует очередь. */
    castTime: 0.45,
    /** Очередь. */
    burstCount: 3,
    burstInterval: 0.12,
    /** Пауза после очереди. */
    recoverTime: 1.25,

    /** Сила расталкивания заражённых друг от друга. */
    separationForce: 240,
    /** Ближе этого к субъекту заражённые не появляются. */
    spawnMinDistance: 300,
    /** Отступ зоны появления от стен. */
    spawnMargin: 64,
  },

  enemyBullet: {
    speed: 340,
    radius: 5,
    damage: 1,
    life: 3,
    spreadDeg: 4,
  },

  feel: {
    /** Стоп-кадр: симуляция замирает на эти секунды. */
    hitstopEnemyHit: 0.035,
    hitstopEnemyKill: 0.07,
    hitstopPlayerHurt: 0.12,

    /** Тряска экрана: амплитуда в пикселях мира. */
    shakeShoot: 0.5,
    shakeEnemyHit: 1.2,
    shakeEnemyKill: 2.6,
    shakePlayerHurt: 5,
    /** Затухание тряски, единиц амплитуды в секунду. */
    shakeDecay: 18,
    shakeMax: 10,

    /** Белая вспышка на теле, получившем урон. */
    flashTime: 0.08,
    /** Мигание во время неуязвимости, полупериодов в секунду. */
    blinkRate: 22,
  },

  render: {
    /** Вырез внутренней грани бетонного блока — шов между блоками. */
    wallInset: 3,
    /** Толщина разметки пола. */
    floorGrid: 1,
    /** Указатель-ствол субъекта. */
    aimLength: 26,
    aimWidth: 3,
    /** Призраки, тянущиеся за рывком. */
    dashTrail: 3,
    /** Шаг между призраками по времени рывка. */
    dashTrailStep: 0.035,
    /** Рамка телеграфа заражённого. */
    telegraphInset: 5,
    telegraphWidth: 2,
    /** Длина луча наведения во время каста. */
    telegraphRay: 220,
    /** Толщина контуров хитбоксов. */
    hitboxWidth: 1,
  },

  debug: {
    /** Стартовое состояние отрисовки хитбоксов (переключается по F1). */
    hitboxes: false,
    /** Как часто обновляется числовая часть оверлея. */
    overlayInterval: 0.2,
  },
};

/** Шаг симуляции в секундах. */
export const STEP = 1 / TUNING.sim.hz;

/** Ширина помещения вместе со стенами, в пикселях. */
export const ROOM_WIDTH = (TUNING.room.cols + TUNING.room.wall * 2) * TUNING.room.tile;
/** Высота помещения вместе со стенами, в пикселях. */
export const ROOM_HEIGHT = (TUNING.room.rows + TUNING.room.wall * 2) * TUNING.room.tile;

export const DEG = Math.PI / 180;

// --------------------------------------------------------------------------
// Схема панели крутилок. Границы слайдеров — тоже числа, поэтому живут здесь.
// --------------------------------------------------------------------------

export interface TuningField {
  /** Путь внутри TUNING, например 'player.speed'. */
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Значение читается при рождении сущности — нужен повтор забега. */
  onRestart?: boolean;
}

export interface TuningGroup {
  title: string;
  fields: TuningField[];
}

export const PANEL: TuningGroup[] = [
  {
    title: 'СУБЪЕКТ',
    fields: [
      { path: 'player.speed', label: 'СКОРОСТЬ', min: 60, max: 600, step: 5 },
      { path: 'player.accel', label: 'УСКОРЕНИЕ', min: 200, max: 8000, step: 50 },
      { path: 'player.friction', label: 'ТРЕНИЕ', min: 100, max: 8000, step: 50 },
      { path: 'player.recoil', label: 'ОТДАЧА', min: 0, max: 400, step: 5 },
      { path: 'player.hurtIFrames', label: 'НЕУЯЗВИМОСТЬ ПОСЛЕ УРОНА', min: 0, max: 2.5, step: 0.05 },
      { path: 'player.maxHp', label: 'ЗАПАС ХОДА', min: 1, max: 16, step: 1, onRestart: true },
      { path: 'player.radius', label: 'ХИТБОКС', min: 4, max: 20, step: 0.5, onRestart: true },
    ],
  },
  {
    title: 'РЫВОК',
    fields: [
      { path: 'player.dashDistance', label: 'ДИСТАНЦИЯ', min: 40, max: 500, step: 5 },
      { path: 'player.dashDuration', label: 'ДЛИТЕЛЬНОСТЬ', min: 0.05, max: 0.6, step: 0.01 },
      { path: 'player.dashCooldown', label: 'ПЕРЕЗАРЯД', min: 0, max: 3, step: 0.05 },
      { path: 'player.dashIFrames', label: 'ОКНО НЕУЯЗВИМОСТИ', min: 0, max: 0.6, step: 0.01 },
      { path: 'player.dashExitFactor', label: 'ВЫНОС НА ВЫХОДЕ', min: 0, max: 1.5, step: 0.05 },
    ],
  },
  {
    title: 'ОГОНЬ СУБЪЕКТА',
    fields: [
      { path: 'playerBullet.speed', label: 'СКОРОСТЬ ПУЛИ', min: 150, max: 1800, step: 10 },
      { path: 'playerBullet.interval', label: 'ТЕМП', min: 0.03, max: 0.6, step: 0.01 },
      { path: 'playerBullet.spreadDeg', label: 'РАЗБРОС', min: 0, max: 25, step: 0.2 },
      { path: 'playerBullet.damage', label: 'УРОН', min: 1, max: 6, step: 1 },
      { path: 'playerBullet.life', label: 'ДАЛЬНОБОЙНОСТЬ', min: 0.2, max: 4, step: 0.1 },
      { path: 'playerBullet.radius', label: 'РАЗМЕР ПУЛИ', min: 1, max: 14, step: 0.5 },
    ],
  },
  {
    title: 'ЗАРАЖЁННЫЕ',
    fields: [
      { path: 'enemy.count', label: 'КОЛИЧЕСТВО', min: 1, max: 40, step: 1, onRestart: true },
      { path: 'enemy.maxHp', label: 'ПРОЧНОСТЬ', min: 1, max: 20, step: 1, onRestart: true },
      { path: 'enemy.speed', label: 'СКОРОСТЬ', min: 20, max: 400, step: 5 },
      { path: 'enemy.accel', label: 'УСКОРЕНИЕ', min: 100, max: 5000, step: 50 },
      { path: 'enemy.friction', label: 'ТРЕНИЕ', min: 100, max: 5000, step: 50 },
      { path: 'enemy.preferredRange', label: 'ДИСТАНЦИЯ БОЯ', min: 60, max: 600, step: 10 },
      { path: 'enemy.backoffRatio', label: 'ПОРОГ ОТХОДА', min: 0.1, max: 1, step: 0.02 },
      { path: 'enemy.strafeFactor', label: 'БОКОВОЕ СМЕЩЕНИЕ', min: 0, max: 1.5, step: 0.05 },
      { path: 'enemy.aimDelay', label: 'ЗАДЕРЖКА ПЕРЕД КАСТОМ', min: 0, max: 3, step: 0.05 },
      { path: 'enemy.castTime', label: 'ВРЕМЯ КАСТА', min: 0.05, max: 2.5, step: 0.05 },
      { path: 'enemy.burstCount', label: 'ПУЛЬ В ОЧЕРЕДИ', min: 1, max: 12, step: 1 },
      { path: 'enemy.burstInterval', label: 'ТЕМП ОЧЕРЕДИ', min: 0.03, max: 0.5, step: 0.01 },
      { path: 'enemy.recoverTime', label: 'ПАУЗА ПОСЛЕ ОЧЕРЕДИ', min: 0.1, max: 4, step: 0.05 },
      { path: 'enemy.separationForce', label: 'РАСТАЛКИВАНИЕ', min: 0, max: 900, step: 20 },
    ],
  },
  {
    title: 'ОГОНЬ ЗАРАЖЁННЫХ',
    fields: [
      { path: 'enemyBullet.speed', label: 'СКОРОСТЬ ПУЛИ', min: 60, max: 900, step: 10 },
      { path: 'enemyBullet.spreadDeg', label: 'РАЗБРОС', min: 0, max: 40, step: 0.5 },
      { path: 'enemyBullet.damage', label: 'УРОН', min: 1, max: 5, step: 1 },
      { path: 'enemyBullet.life', label: 'ДАЛЬНОБОЙНОСТЬ', min: 0.5, max: 8, step: 0.25 },
      { path: 'enemyBullet.radius', label: 'РАЗМЕР ПУЛИ', min: 2, max: 16, step: 0.5 },
    ],
  },
  {
    title: 'ОЩУЩЕНИЕ',
    fields: [
      { path: 'feel.hitstopEnemyHit', label: 'СТОП-КАДР: ПОПАДАНИЕ', min: 0, max: 0.25, step: 0.005 },
      { path: 'feel.hitstopEnemyKill', label: 'СТОП-КАДР: УБИЙСТВО', min: 0, max: 0.4, step: 0.005 },
      { path: 'feel.hitstopPlayerHurt', label: 'СТОП-КАДР: УРОН ПО НАМ', min: 0, max: 0.5, step: 0.005 },
      { path: 'feel.shakeShoot', label: 'ТРЯСКА: ВЫСТРЕЛ', min: 0, max: 8, step: 0.1 },
      { path: 'feel.shakeEnemyHit', label: 'ТРЯСКА: ПОПАДАНИЕ', min: 0, max: 12, step: 0.1 },
      { path: 'feel.shakeEnemyKill', label: 'ТРЯСКА: УБИЙСТВО', min: 0, max: 20, step: 0.2 },
      { path: 'feel.shakePlayerHurt', label: 'ТРЯСКА: УРОН ПО НАМ', min: 0, max: 30, step: 0.5 },
      { path: 'feel.shakeDecay', label: 'ЗАТУХАНИЕ ТРЯСКИ', min: 2, max: 60, step: 1 },
      { path: 'feel.shakeMax', label: 'ПОТОЛОК ТРЯСКИ', min: 0, max: 40, step: 0.5 },
      { path: 'feel.flashTime', label: 'ВСПЫШКА НА ТЕЛЕ', min: 0, max: 0.4, step: 0.01 },
      { path: 'feel.blinkRate', label: 'МИГАНИЕ В НЕУЯЗВИМОСТИ', min: 2, max: 60, step: 1 },
    ],
  },
];

// --------------------------------------------------------------------------
// Пресеты. Пресет — это просто набор пар «путь → число».
// --------------------------------------------------------------------------

export type TuningPatch = Record<string, number>;

export const PRESETS: Record<string, TuningPatch> = {
  /** Точный: короткий разгон, злой темп, почти без разброса. */
  tight: {
    'player.speed': 290,
    'player.accel': 6000,
    'player.friction': 5000,
    'player.recoil': 35,
    'player.hurtIFrames': 0.9,
    'player.dashDistance': 200,
    'player.dashDuration': 0.14,
    'player.dashCooldown': 0.6,
    'player.dashIFrames': 0.13,
    'player.dashExitFactor': 0.2,
    'playerBullet.speed': 1050,
    'playerBullet.interval': 0.11,
    'playerBullet.spreadDeg': 0.6,
    'enemy.count': 5,
    'enemy.speed': 110,
    'enemy.castTime': 0.4,
    'enemyBullet.speed': 400,
    'feel.hitstopEnemyHit': 0.03,
    'feel.hitstopEnemyKill': 0.06,
    'feel.shakeShoot': 0.4,
    'feel.shakeEnemyHit': 1,
    'feel.shakeEnemyKill': 2,
    'feel.shakePlayerHurt': 4,
    'feel.shakeDecay': 22,
  },

  /** Инерционный: разгоняется и тормозит долго, пуля тяжёлая, отдача толкает. */
  floaty: {
    'player.speed': 320,
    'player.accel': 850,
    'player.friction': 450,
    'player.recoil': 170,
    'player.hurtIFrames': 1,
    'player.dashDistance': 270,
    'player.dashDuration': 0.26,
    'player.dashCooldown': 0.95,
    'player.dashIFrames': 0.2,
    'player.dashExitFactor': 0.85,
    'playerBullet.speed': 700,
    'playerBullet.interval': 0.17,
    'playerBullet.spreadDeg': 3.5,
    'enemy.count': 5,
    'enemy.accel': 380,
    'enemy.friction': 380,
    'enemy.castTime': 0.55,
    'enemyBullet.speed': 300,
    'feel.hitstopEnemyHit': 0.05,
    'feel.hitstopEnemyKill': 0.1,
    'feel.shakeShoot': 1.2,
    'feel.shakeEnemyHit': 2,
    'feel.shakeEnemyKill': 4,
    'feel.shakePlayerHurt': 7,
    'feel.shakeDecay': 12,
  },

  /** Толпа: медленные пули, которые видно, много слабых заражённых. */
  horde: {
    'player.speed': 250,
    'player.maxHp': 8,
    'player.accel': 3000,
    'player.friction': 2400,
    'player.recoil': 60,
    'player.dashDistance': 210,
    'player.dashCooldown': 0.55,
    'player.dashIFrames': 0.16,
    'playerBullet.speed': 780,
    'playerBullet.interval': 0.1,
    'playerBullet.spreadDeg': 2.5,
    'playerBullet.radius': 4.5,
    'enemy.count': 16,
    'enemy.maxHp': 2,
    'enemy.speed': 78,
    'enemy.preferredRange': 200,
    'enemy.aimDelay': 0.7,
    'enemy.castTime': 0.6,
    'enemy.burstCount': 2,
    'enemy.burstInterval': 0.18,
    'enemy.recoverTime': 1.7,
    'enemy.separationForce': 320,
    'enemyBullet.speed': 185,
    'enemyBullet.spreadDeg': 6,
    'enemyBullet.life': 5,
    'enemyBullet.radius': 6.5,
    'feel.hitstopEnemyHit': 0.02,
    'feel.hitstopEnemyKill': 0.04,
    'feel.shakeShoot': 0.3,
    'feel.shakeEnemyHit': 0.8,
    'feel.shakeEnemyKill': 1.8,
    'feel.shakePlayerHurt': 5,
  },
};

// --------------------------------------------------------------------------
// Доступ по пути. Нужен панели, чтобы не знать про структуру TUNING.
// --------------------------------------------------------------------------

type Node = Record<string, unknown>;

export function getTuning(path: string): number {
  let node: unknown = TUNING;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return Number.NaN;
    node = (node as Node)[part];
  }
  return typeof node === 'number' ? node : Number.NaN;
}

export function setTuning(path: string, value: number): void {
  const parts = path.split('.');
  const last = parts.pop();
  if (last === undefined) return;
  let node: Node = TUNING as unknown as Node;
  for (const part of parts) {
    const next = node[part];
    if (next === null || typeof next !== 'object') return;
    node = next as Node;
  }
  node[last] = value;
}

/** Текущие значения всех полей панели. */
export function snapshotTuning(): TuningPatch {
  const patch: TuningPatch = {};
  for (const group of PANEL) {
    for (const field of group.fields) patch[field.path] = getTuning(field.path);
  }
  return patch;
}

/** Накатить набор значений. Незнакомые пути игнорируются. */
export function applyTuning(patch: TuningPatch): void {
  const known = new Set<string>();
  for (const group of PANEL) {
    for (const field of group.fields) known.add(field.path);
  }
  for (const [path, value] of Object.entries(patch)) {
    if (!known.has(path) || !Number.isFinite(value)) continue;
    setTuning(path, value);
  }
}

/** Значения, с которыми проект собран. Снимается один раз при загрузке модуля. */
export const BASELINE: TuningPatch = snapshotTuning();
