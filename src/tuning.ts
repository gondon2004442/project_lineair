/**
 * ВСЕ числовые константы проекта.
 * В системах — только ссылки сюда. Магических чисел в коде быть не должно.
 *
 * Единицы: расстояние — пиксели мира, время — секунды, скорость — px/с,
 * ускорение — px/с², углы в полях *Deg — градусы.
 *
 * Объект намеренно изменяемый: значения правятся на живую через панель
 * крутилок (тильда). База ниже — набор, отобранный вручную на ощупь.
 */
export const TUNING = {
  sim: {
    /** Частота фиксированного шага симуляции. */
    hz: 60,
    /** Больше этого за кадр не досимулировываем (защита от «спирали смерти»). */
    maxFrameMs: 100,
    /**
     * Тело за один разбор столкновений не смещается больше, чем на эту долю
     * клетки. Быстрый рывок иначе перепрыгивает стену насквозь.
     */
    maxMoveFraction: 0.4,
  },

  room: {
    /** Внутренние размеры помещения в клетках, без стен. */
    cols: 32,
    rows: 18,
    /** Сторона клетки. */
    tile: 32,
    /** Толщина стены в клетках. */
    wall: 1,
    /** Прочность разрушаемой перегородки. */
    weakWallHp: 6,
  },

  player: {
    radius: 9,
    maxHp: 12,
    /** Целевая скорость при полностью отклонённом вводе. */
    speed: 290,
    /** Разгон до целевой скорости. */
    accel: 6000,
    /** Торможение при отпущенном вводе. */
    friction: 5000,

    /** Рывок: дистанция и длительность задают его скорость. */
    dashDistance: 110,
    dashDuration: 0.05,
    dashCooldown: 0.6,
    /** Окно неуязвимости от начала рывка. */
    dashIFrames: 0.13,
    /** Скорость на выходе из рывка — доля от dash-скорости. */
    dashExitFactor: 0.2,

    /** Неуязвимость после получения урона. */
    hurtIFrames: 0.9,
    /** Отдача, толкающая субъекта назад при выстреле. */
    recoil: 35,
  },

  /**
   * Одно оружие, четыре формы. Переключение колесом мыши.
   * У каждой формы своя обойма: перезарядка по R, запас патронов не
   * ограничен. Обоймы не общие, поэтому переключиться на заряженную форму —
   * это всегда быстрее, чем перезарядить текущую.
   */
  weapon: {
    /** Вынос точки вылета от центра субъекта. */
    muzzle: 16,
    /** Пауза после переключения формы. */
    switchCooldown: 0.12,

    /** Точная одиночная. */
    precise: {
      damage: 1,
      speed: 1050,
      radius: 3.5,
      life: 1.1,
      spreadDeg: 0.6,
      interval: 0.11,
      cost: 1,
      ammoMax: 14,
      /** Сколько длится перезарядка обоймы. */
      reloadTime: 0.95,
    },

    /** Дробовая: сноп на короткую дистанцию. */
    scatter: {
      damage: 1,
      speed: 760,
      /** Разнобой скоростей внутри снопа. */
      speedJitter: 120,
      radius: 3,
      life: 0.34,
      spreadDeg: 26,
      pellets: 7,
      interval: 0.5,
      cost: 4,
      ammoMax: 14,
      /** Сколько длится перезарядка обоймы. */
      reloadTime: 1.4,
    },

    /** Зарядная пробивающая: держишь ЛКМ, отпускаешь — бьёшь насквозь. */
    lance: {
      /** Урон без заряда и на полном заряде. */
      damage: 2,
      damageCharged: 7,
      speed: 1400,
      radius: 6,
      life: 1.4,
      /** Сколько тел пробивает. */
      pierce: 4,
      /** Время полного заряда. */
      chargeTime: 0.8,
      /** Раньше этого заряда выстрела не будет и боезапас не тратится. */
      minCharge: 0.18,
      cost: 6,
      ammoMax: 14,
      /** Сколько длится перезарядка обоймы. */
      reloadTime: 1.6,
    },

    /** Залповая с самонаведением. */
    volley: {
      damage: 1,
      speed: 540,
      radius: 4,
      life: 2.4,
      /** Снарядов в залпе и промежуток между ними. */
      count: 5,
      gap: 0.07,
      /** Скорость доворота на цель, градусов в секунду. */
      homingDeg: 260,
      spreadDeg: 40,
      interval: 0.85,
      cost: 5,
      ammoMax: 14,
      /** Сколько длится перезарядка обоймы. */
      reloadTime: 1.45,
    },
  },


  floor: {
    /** Сколько помещений на этаже. */
    roomsMin: 8,
    roomsMax: 12,
    /** Основной путь не короче этого. */
    mainPathMin: 5,
    /** Ответвлений от основного пути. */
    branchesMin: 1,
    branchesMax: 2,
    /** Длина одного ответвления в помещениях. */
    branchLengthMin: 1,
    branchLengthMax: 2,
    /**
     * Множитель квоты штата: во сколько раз штатное расписание участка
     * плотнее или реже, чем записано в данных.
     */
    staffScale: 1,
    /** Смещение seed для каждого помещения: порядок обхода не влияет на расстановку. */
    roomSeedStride: 0x9e3779b1,
    /** Смещение seed для расстановки мебели участка. */
    propSeedStride: 0xc2b2ae35,
    /** Смещение seed для выдачи предмета за участок. */
    itemSeedStride: 0x85ebca6b,
    /** Сколько раз пытаться подобрать точку появления, прежде чем взять любую. */
    spawnAttempts: 200,
  },

  /** Физические объекты: что можно поднять телекинезом и бросить. */
  prop: {
    /** Ниже этой скорости брошенный предмет никого не задевает. */
    minImpactSpeed: 140,
    /** Урон = impulseDamage * масса * скорость / 1000. */
    impulseDamage: 4,
    /** Сколько прочности теряет сам предмет от удара. */
    impactSelfDamage: 1,
    /** Трение катящегося предмета. Делится на массу: тяжёлое несёт дальше. */
    friction: 900,
    /** Сила, которой предмет расталкивает тела вокруг себя. */
    pushForce: 260,
    /** Ближе этого ко входу мебель не появляется. */
    spawnClearance: 60,

    chair: {
      radius: 10,
      hp: 2,
      mass: 1,
      /** Во сколько раз быстрее базовой скорости броска летит. */
      speedFactor: 1.25,
    },
    cabinet: {
      radius: 18,
      hp: 5,
      mass: 2.6,
      speedFactor: 0.65,
    },
    rubble: {
      radius: 12,
      hp: 3,
      mass: 1.7,
      speedFactor: 0.95,
    },
  },

  /** Телекинез: захват по ПКМ, бросок на отпускании. */
  telekinesis: {
    /** Дальше этого предмет не поднять. */
    grabRange: 260,
    /** На каком расстоянии перед субъектом висит поднятое. */
    holdDistance: 52,
    /** Как быстро поднятое подтягивается к точке удержания. */
    holdPull: 14,
    /** Базовая скорость броска, умножается на speedFactor предмета. */
    throwSpeed: 900,

    /** Энергия. */
    energyMax: 100,
    /** Разовая плата за захват. */
    grabCost: 15,
    /** Расход на удержание, в секунду. */
    holdDrain: 14,
    /** Восполнение энергии в секунду и пауза после траты. */
    energyRegen: 24,
    energyRegenDelay: 0.5,
  },

  /** Общее для всего штата, независимо от должности. */
  staff: {
    /** Сила расталкивания сотрудников друг от друга. */
    separationForce: 240,
    /** Ближе этого к точке входа штат не появляется. */
    spawnMinDistance: 300,
  },

  /** Числа по должностям. Опознание — в src/data/posts.ts. */
  post: {
    intern: {
      hp: 1,
      radius: 9,
      speed: 74,
      accel: 700,
      friction: 900,
      /** Пауза на точке маршрута. */
      waypointPause: 0.7,
      /** Насколько близко к точке считается «дошёл». */
      waypointReach: 22,
      /** Сколько идёт переназначение на должность. */
      promotionTime: 1.2,
    },

    inspector: {
      hp: 3,
      radius: 11,
      /** Ходит только по осям, поворот на 90 градусов. */
      speed: 110,
      accel: 900,
      friction: 1200,
      /**
       * Насколько сильно надо разойтись по оси, чтобы инспектор
       * переключился на неё. Меньше — суетливее мечется на углах.
       */
      axisSwitchBias: 40,
      /** Дистанция, на которой инспектор держится от субъекта. */
      standoff: 220,
      /** Ближе standoff * backoffRatio — отходит по своей оси. */
      backoffRatio: 0.65,
      /** Метроном участка: доля такта в секундах. */
      metronomeInterval: 1.8,
      /** Выстрелов за такт. */
      shotsPerBeat: 3,
      /** Промежуток между выстрелами внутри такта. */
      shotGap: 0.12,
      /** За сколько до доли вспыхивает табличка. */
      telegraphLead: 0.4,
    },

    registrar: {
      hp: 8,
      radius: 14,
      /** Сидит за столом: не ходит, но расталкивание его двигать не должно. */
      speed: 0,
      accel: 0,
      friction: 4000,
      /** Веер картотечных карточек. */
      fanCount: 5,
      fanSpreadDeg: 34,
      fanInterval: 2.4,
      /** Замах перед веером. */
      fanTelegraph: 0.45,
      /** Карточка. */
      cardSpeed: 250,
      cardRadius: 6,
      cardDamage: 1,
      cardLife: 3.5,
      /** Пауза между приказами о закрытии ставок. */
      orderInterval: 1.8,
      /** Сколько идёт добор штата со стороны, когда повышать некого. */
      hireDelay: 3.2,
      /** Потолок добора за участок: без него живой Регистратор бесконечен. */
      hireCap: 6,
      /** Приоритет ставки, на которую приходит добор. */
      hirePriority: 3,
    },
  },


  enemyBullet: {
    speed: 400,
    radius: 5,
    damage: 1,
    life: 3,
    spreadDeg: 4,
  },

  feel: {
    /** Стоп-кадр: симуляция замирает на эти секунды. */
    hitstopEnemyHit: 0.03,
    hitstopEnemyKill: 0.06,
    hitstopPlayerHurt: 0.12,

    /** Тряска экрана: амплитуда в пикселях мира. */
    shakeShoot: 0.4,
    shakeEnemyHit: 1,
    shakeEnemyKill: 2,
    shakePlayerHurt: 4,
    /** Затухание тряски, единиц амплитуды в секунду. */
    shakeDecay: 22,
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
    /** Толщина порога в открытом проёме. */
    doorThreshold: 5,
    /** Полоса на запертой двери. */
    doorBarInset: 9,
    /** Табличка на груди: высота, ширина как доля от силуэта. */
    plateHeight: 5,
    plateWidthFactor: 1.3,
    /** Насечка на табличке. */
    plateMarkSize: 2,
    plateMarkGap: 2,
    /** Насколько стол Регистратора шире его силуэта. */
    deskExtra: 6,
    /** Счётчик незакрытых ставок над Регистратором. */
    vacancyMark: 4,
    vacancyGap: 3,
    vacancyLift: 12,
    /** Зазор между панелями разрушаемой перегородки. */
    weakPanelGap: 2,
    /** Во сколько раз стрела зарядной формы длиннее своей ширины. */
    barLengthFactor: 3,
    /** Толщина контура полого силуэта. */
    hollowWidth: 2,
    /** Толщина контуров хитбоксов. */
    hitboxWidth: 1,
  },

  hud: {
    /** Схема этажа: сторона квадрата-помещения и шаг сетки. */
    mapCell: 14,
    mapStep: 20,
    mapStroke: 1,
    mapLink: 2,
    /** Длина полоски боезапаса в знаках. */
    gaugeWidth: 14,
    /** Отступ метки конечного помещения. */
    mapEndInset: 4,
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
    title: 'ФОРМА: ТОЧНАЯ',
    fields: [
      { path: 'weapon.precise.damage', label: 'УРОН', min: 1, max: 10, step: 1 },
      { path: 'weapon.precise.speed', label: 'СКОРОСТЬ', min: 150, max: 1800, step: 10 },
      { path: 'weapon.precise.interval', label: 'ТЕМП', min: 0.03, max: 0.6, step: 0.01 },
      { path: 'weapon.precise.spreadDeg', label: 'РАЗБРОС', min: 0, max: 25, step: 0.2 },
      { path: 'weapon.precise.life', label: 'ДАЛЬНОБОЙНОСТЬ', min: 0.2, max: 4, step: 0.1 },
      { path: 'weapon.precise.radius', label: 'РАЗМЕР', min: 1, max: 14, step: 0.5 },
      { path: 'weapon.precise.cost', label: 'РАСХОД', min: 0, max: 10, step: 1 },
      { path: 'weapon.precise.ammoMax', label: 'ОБОЙМА', min: 1, max: 60, step: 1 },
      { path: 'weapon.precise.reloadTime', label: 'ПЕРЕЗАРЯДКА', min: 0.1, max: 5, step: 0.05 },
    ],
  },
  {
    title: 'ФОРМА: ДРОБОВАЯ',
    fields: [
      { path: 'weapon.scatter.damage', label: 'УРОН ДРОБИНЫ', min: 1, max: 10, step: 1 },
      { path: 'weapon.scatter.pellets', label: 'ДРОБИН В СНОПЕ', min: 1, max: 24, step: 1 },
      { path: 'weapon.scatter.spreadDeg', label: 'РАСКРЫВ СНОПА', min: 2, max: 120, step: 1 },
      { path: 'weapon.scatter.speed', label: 'СКОРОСТЬ', min: 150, max: 1600, step: 10 },
      { path: 'weapon.scatter.speedJitter', label: 'РАЗНОБОЙ СКОРОСТЕЙ', min: 0, max: 400, step: 10 },
      { path: 'weapon.scatter.life', label: 'ДАЛЬНОБОЙНОСТЬ', min: 0.1, max: 2, step: 0.02 },
      { path: 'weapon.scatter.interval', label: 'ТЕМП', min: 0.1, max: 2, step: 0.05 },
      { path: 'weapon.scatter.cost', label: 'РАСХОД', min: 0, max: 14, step: 1 },
      { path: 'weapon.scatter.ammoMax', label: 'ОБОЙМА', min: 1, max: 60, step: 1 },
      { path: 'weapon.scatter.reloadTime', label: 'ПЕРЕЗАРЯДКА', min: 0.1, max: 5, step: 0.05 },
    ],
  },
  {
    title: 'ФОРМА: ЗАРЯДНАЯ',
    fields: [
      { path: 'weapon.lance.damage', label: 'УРОН БЕЗ ЗАРЯДА', min: 1, max: 20, step: 1 },
      { path: 'weapon.lance.damageCharged', label: 'УРОН НА ПОЛНОМ', min: 1, max: 40, step: 1 },
      { path: 'weapon.lance.pierce', label: 'ПРОБИВАЕТ ТЕЛ', min: 0, max: 20, step: 1 },
      { path: 'weapon.lance.chargeTime', label: 'ВРЕМЯ ЗАРЯДА', min: 0.1, max: 3, step: 0.05 },
      { path: 'weapon.lance.minCharge', label: 'ПОРОГ ВЫСТРЕЛА', min: 0, max: 1, step: 0.02 },
      { path: 'weapon.lance.speed', label: 'СКОРОСТЬ', min: 200, max: 2500, step: 20 },
      { path: 'weapon.lance.life', label: 'ДАЛЬНОБОЙНОСТЬ', min: 0.2, max: 4, step: 0.1 },
      { path: 'weapon.lance.cost', label: 'РАСХОД', min: 0, max: 14, step: 1 },
      { path: 'weapon.lance.ammoMax', label: 'ОБОЙМА', min: 1, max: 60, step: 1 },
      { path: 'weapon.lance.reloadTime', label: 'ПЕРЕЗАРЯДКА', min: 0.1, max: 5, step: 0.05 },
    ],
  },
  {
    title: 'ФОРМА: ЗАЛПОВАЯ',
    fields: [
      { path: 'weapon.volley.damage', label: 'УРОН', min: 1, max: 10, step: 1 },
      { path: 'weapon.volley.count', label: 'СНАРЯДОВ В ЗАЛПЕ', min: 1, max: 16, step: 1 },
      { path: 'weapon.volley.homingDeg', label: 'ДОВОРОТ, ГРАД/С', min: 0, max: 900, step: 10 },
      { path: 'weapon.volley.speed', label: 'СКОРОСТЬ', min: 100, max: 1200, step: 10 },
      { path: 'weapon.volley.spreadDeg', label: 'РАЗЛЁТ ЗАЛПА', min: 0, max: 180, step: 2 },
      { path: 'weapon.volley.gap', label: 'ПРОМЕЖУТОК В ЗАЛПЕ', min: 0, max: 0.5, step: 0.01 },
      { path: 'weapon.volley.life', label: 'ДАЛЬНОБОЙНОСТЬ', min: 0.2, max: 6, step: 0.1 },
      { path: 'weapon.volley.interval', label: 'ТЕМП', min: 0.2, max: 3, step: 0.05 },
      { path: 'weapon.volley.cost', label: 'РАСХОД', min: 0, max: 14, step: 1 },
      { path: 'weapon.volley.ammoMax', label: 'ОБОЙМА', min: 1, max: 60, step: 1 },
      { path: 'weapon.volley.reloadTime', label: 'ПЕРЕЗАРЯДКА', min: 0.1, max: 5, step: 0.05 },
    ],
  },
  {
    title: 'ТЕЛЕКИНЕЗ',
    fields: [
      { path: 'telekinesis.grabRange', label: 'ДАЛЬНОСТЬ ЗАХВАТА', min: 40, max: 700, step: 10 },
      { path: 'telekinesis.holdDistance', label: 'ДИСТАНЦИЯ УДЕРЖАНИЯ', min: 20, max: 200, step: 2 },
      { path: 'telekinesis.holdPull', label: 'ЖЁСТКОСТЬ УДЕРЖАНИЯ', min: 1, max: 40, step: 1 },
      { path: 'telekinesis.throwSpeed', label: 'СИЛА БРОСКА', min: 100, max: 2200, step: 20 },
      { path: 'telekinesis.energyMax', label: 'ЗАПАС ЭНЕРГИИ', min: 10, max: 400, step: 5 },
      { path: 'telekinesis.grabCost', label: 'ПЛАТА ЗА ЗАХВАТ', min: 0, max: 100, step: 1 },
      { path: 'telekinesis.holdDrain', label: 'РАСХОД НА УДЕРЖАНИЕ', min: 0, max: 80, step: 1 },
      { path: 'telekinesis.energyRegen', label: 'ВОСПОЛНЕНИЕ ЭНЕРГИИ', min: 1, max: 120, step: 1 },
      { path: 'telekinesis.energyRegenDelay', label: 'ПАУЗА ВОСПОЛНЕНИЯ', min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    title: 'ОБЪЕКТЫ',
    fields: [
      { path: 'prop.impulseDamage', label: 'УРОН ОТ ИМПУЛЬСА', min: 0, max: 20, step: 0.5 },
      { path: 'prop.minImpactSpeed', label: 'ПОРОГ УДАРА', min: 0, max: 600, step: 10 },
      { path: 'prop.impactSelfDamage', label: 'ИЗНОС ОТ УДАРА', min: 0, max: 5, step: 1 },
      { path: 'prop.friction', label: 'ТРЕНИЕ', min: 100, max: 4000, step: 50 },
      { path: 'prop.pushForce', label: 'РАСТАЛКИВАНИЕ ТЕЛ', min: 0, max: 900, step: 20 },
      { path: 'prop.spawnClearance', label: 'ОТСТУП МЕБЕЛИ ОТ ВХОДА', min: 0, max: 400, step: 10, onRestart: true },
      { path: 'prop.chair.hp', label: 'СТУЛ: ПРОЧНОСТЬ', min: 1, max: 20, step: 1, onRestart: true },
      { path: 'prop.chair.mass', label: 'СТУЛ: МАССА', min: 0.2, max: 8, step: 0.1 },
      { path: 'prop.chair.speedFactor', label: 'СТУЛ: РАЗГОН', min: 0.2, max: 3, step: 0.05 },
      { path: 'prop.cabinet.hp', label: 'ШКАФ: ПРОЧНОСТЬ', min: 1, max: 30, step: 1, onRestart: true },
      { path: 'prop.cabinet.mass', label: 'ШКАФ: МАССА', min: 0.2, max: 12, step: 0.1 },
      { path: 'prop.cabinet.speedFactor', label: 'ШКАФ: РАЗГОН', min: 0.2, max: 3, step: 0.05 },
      { path: 'prop.rubble.hp', label: 'ОБЛОМОК: ПРОЧНОСТЬ', min: 1, max: 20, step: 1, onRestart: true },
      { path: 'prop.rubble.mass', label: 'ОБЛОМОК: МАССА', min: 0.2, max: 8, step: 0.1 },
      { path: 'prop.rubble.speedFactor', label: 'ОБЛОМОК: РАЗГОН', min: 0.2, max: 3, step: 0.05 },
      { path: 'room.weakWallHp', label: 'ПЕРЕГОРОДКА: ПРОЧНОСТЬ', min: 1, max: 40, step: 1, onRestart: true },
    ],
  },
  {
    title: 'ШТАТ',
    fields: [
      { path: 'floor.staffScale', label: 'КВОТА ШТАТА', min: 0.2, max: 4, step: 0.1, onRestart: true },
      { path: 'staff.separationForce', label: 'РАСТАЛКИВАНИЕ', min: 0, max: 900, step: 20 },
      { path: 'staff.spawnMinDistance', label: 'ОТСТУП ОТ ВХОДА', min: 0, max: 600, step: 20, onRestart: true },
    ],
  },
  {
    title: 'СТАЖЁР',
    fields: [
      { path: 'post.intern.hp', label: 'ПРОЧНОСТЬ', min: 1, max: 10, step: 1, onRestart: true },
      { path: 'post.intern.radius', label: 'ХИТБОКС', min: 4, max: 20, step: 0.5, onRestart: true },
      { path: 'post.intern.speed', label: 'СКОРОСТЬ', min: 10, max: 300, step: 2 },
      { path: 'post.intern.waypointPause', label: 'ПАУЗА НА ТОЧКЕ', min: 0, max: 3, step: 0.1 },
      { path: 'post.intern.promotionTime', label: 'ВРЕМЯ ПЕРЕНАЗНАЧЕНИЯ', min: 0.1, max: 5, step: 0.1 },
    ],
  },
  {
    title: 'ИНСПЕКТОР',
    fields: [
      { path: 'post.inspector.hp', label: 'ПРОЧНОСТЬ', min: 1, max: 20, step: 1, onRestart: true },
      { path: 'post.inspector.radius', label: 'ХИТБОКС', min: 4, max: 24, step: 0.5, onRestart: true },
      { path: 'post.inspector.speed', label: 'СКОРОСТЬ ПО ОСИ', min: 20, max: 400, step: 5 },
      { path: 'post.inspector.accel', label: 'УСКОРЕНИЕ', min: 100, max: 5000, step: 50 },
      { path: 'post.inspector.friction', label: 'ТРЕНИЕ', min: 100, max: 5000, step: 50 },
      { path: 'post.inspector.axisSwitchBias', label: 'ПОРОГ СМЕНЫ ОСИ', min: 0, max: 200, step: 5 },
      { path: 'post.inspector.standoff', label: 'ДИСТАНЦИЯ БОЯ', min: 60, max: 600, step: 10 },
      { path: 'post.inspector.backoffRatio', label: 'ПОРОГ ОТХОДА', min: 0.1, max: 1, step: 0.02 },
      { path: 'post.inspector.metronomeInterval', label: 'ДОЛЯ МЕТРОНОМА', min: 0.3, max: 5, step: 0.05 },
      { path: 'post.inspector.shotsPerBeat', label: 'ВЫСТРЕЛОВ ЗА ТАКТ', min: 1, max: 8, step: 1 },
      { path: 'post.inspector.shotGap', label: 'ПРОМЕЖУТОК В ТАКТЕ', min: 0.03, max: 0.5, step: 0.01 },
      { path: 'post.inspector.telegraphLead', label: 'УПРЕЖДЕНИЕ ТЕЛЕГРАФА', min: 0.05, max: 1.5, step: 0.05 },
    ],
  },
  {
    title: 'РЕГИСТРАТОР',
    fields: [
      { path: 'post.registrar.hp', label: 'ПРОЧНОСТЬ', min: 1, max: 40, step: 1, onRestart: true },
      { path: 'post.registrar.radius', label: 'ХИТБОКС', min: 6, max: 28, step: 0.5, onRestart: true },
      { path: 'post.registrar.fanCount', label: 'КАРТОЧЕК В ВЕЕРЕ', min: 1, max: 15, step: 1 },
      { path: 'post.registrar.fanSpreadDeg', label: 'РАСКРЫВ ВЕЕРА', min: 4, max: 180, step: 2 },
      { path: 'post.registrar.fanInterval', label: 'ИНТЕРВАЛ ВЕЕРА', min: 0.4, max: 8, step: 0.1 },
      { path: 'post.registrar.fanTelegraph', label: 'ЗАМАХ', min: 0.05, max: 2, step: 0.05 },
      { path: 'post.registrar.cardSpeed', label: 'СКОРОСТЬ КАРТОЧКИ', min: 60, max: 900, step: 10 },
      { path: 'post.registrar.cardRadius', label: 'РАЗМЕР КАРТОЧКИ', min: 2, max: 16, step: 0.5 },
      { path: 'post.registrar.orderInterval', label: 'ПАУЗА МЕЖДУ ПРИКАЗАМИ', min: 0.2, max: 8, step: 0.1 },
      { path: 'post.registrar.hireDelay', label: 'ДОБОР СО СТОРОНЫ', min: 0.5, max: 12, step: 0.1 },
      { path: 'post.registrar.hireCap', label: 'ПОТОЛОК ДОБОРА', min: 0, max: 30, step: 1, onRestart: true },
    ],
  },
  {
    title: 'ОГОНЬ ИНСПЕКТОРОВ',
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
    'weapon.precise.speed': 1050,
    'weapon.precise.interval': 0.11,
    'weapon.precise.spreadDeg': 0.6,
    'post.inspector.metronomeInterval': 1.5,
    'post.inspector.telegraphLead': 0.3,
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
    'weapon.precise.speed': 700,
    'weapon.precise.interval': 0.17,
    'weapon.precise.spreadDeg': 3.5,
    'post.inspector.accel': 380,
    'post.inspector.friction': 380,
    'post.inspector.metronomeInterval': 2.2,
    'post.inspector.telegraphLead': 0.55,
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
    'weapon.precise.speed': 780,
    'weapon.precise.interval': 0.1,
    'weapon.precise.spreadDeg': 2.5,
    'weapon.precise.radius': 4.5,
    'floor.staffScale': 2.4,
    'post.inspector.hp': 2,
    'post.inspector.speed': 78,
    'post.inspector.metronomeInterval': 2.4,
    'post.inspector.telegraphLead': 0.6,
    'post.inspector.shotsPerBeat': 2,
    'post.inspector.shotGap': 0.18,
    'post.registrar.fanCount': 3,
    'post.registrar.fanInterval': 3.2,
    'staff.separationForce': 320,
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
