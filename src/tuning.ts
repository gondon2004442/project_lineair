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
    /** Вероятность курьера на рядовом участке. */
    courierChance: 0.33,
    /** Смещение seed для розыгрыша курьера. */
    courierSeedStride: 0x165667b1,
    /** Вероятность, что на рядовой участок введут старшую ставку. */
    miniBossChance: 0.38,
    /** Смещение seed для розыгрыша мини-босса. */
    miniBossSeedStride: 0x27d4eb2f,
    /** Смещение seed для расстановки мебели участка. */
    propSeedStride: 0xc2b2ae35,
    /** Смещение seed для выдачи предмета за участок. */
    itemSeedStride: 0x85ebca6b,
    /** Сколько раз пытаться подобрать точку появления, прежде чем взять любую. */
    spawnAttempts: 200,
  },

  /**
   * Звук. Рецепты — данные в src/data/sounds.ts, здесь только общий микс.
   */
  audio: {
    /** Общая громкость. Ноль — тишина, и ни один голос не создаётся. */
    master: 0.5,
    /** Сколько звуков за кадр: на залпах иначе получается белый шум. */
    voicesPerFrame: 4,
    /** Доля длительности на атаку, если рецепт не задал свою. */
    attack: 0.06,
    /** До какого уровня уводится хвост. Нулём нельзя: там экспонента. */
    tailFloor: 0.0008,
    /** Срез фильтра шума по умолчанию. */
    defaultCutoff: 2000,
    /** Длина заготовки шума в секундах. */
    noiseSeconds: 1,
  },

  /** Вестибюль: комната-меню, из которой начинается забег. */
  lobby: {
    /** На сколько клеток ниже проёма стоит субъект на старте. */
    spawnOffsetTiles: 4,
    /** Ближе этого к центру мебель вестибюля не ставится. */
    gateClearance: 150,
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

    /**
     * Ревизор. Пока ведёт опись имущества участка — неуязвим.
     * Опись кончилась — открывается на время окна, потом начинает заново.
     * Ломай мебель быстрее, чем он её описывает.
     */
    auditor: {
      hp: 10,
      radius: 15,
      speed: 108,
      accel: 700,
      friction: 1100,
      /** Насколько близко надо подойти к предмету, чтобы начать опись. */
      reach: 46,
      /** Сколько занимает описание одного предмета. */
      inventoryTime: 0.9,
      /**
       * Сколько Ревизор пытается дойти до предмета, прежде чем внести его
       * издалека. Без этого один предмет за бетоном вешал бы опись навсегда,
       * а Ревизора делал бы неуязвимым до конца забега.
       */
      reachTimeout: 5,
      /** Сколько Ревизор открыт после того, как опись закончена. */
      openTime: 4,
      /** Выписывает предписание раз в столько секунд. */
      shotInterval: 2.6,
      /** Замах перед предписанием. */
      shotTelegraph: 0.5,
    },

    /**
     * Заведующий сектором. Сидит в приёмной, дальше этажа нет.
     * Право переназначения: на ходу меняет должности подчинённых,
     * так что заученный набор паттернов посреди боя перетасовывается.
     */
    chief: {
      hp: 44,
      radius: 20,
      speed: 72,
      accel: 600,
      friction: 1400,
      /** Дистанция, на которой держится от субъекта. */
      standoff: 210,
      backoffRatio: 0.7,

      /** Циркуляр: кольцо снарядов во все стороны. */
      ringCount: 14,
      ringInterval: 3.2,
      ringTelegraph: 0.7,
      /** Каждое следующее кольцо провёрнуто на этот угол. */
      ringTwistDeg: 13,

      /** Переназначение подчинённых. */
      reshuffleInterval: 5,
      reshuffleCount: 2,
      reshuffleTelegraph: 0.6,
    },

    /**
     * Курьер. Не бьёт вообще. Бежит к ближайшей двери и вызывает
     * подкрепление из соседнего сектора.
     *
     * Нарочно медленный: он должен быть заметой задачей на перехват,
     * а не внезапным удвоением участка. Субъект быстрее его вчетверо,
     * так что успеть можно всегда — вопрос только в том, бросишь ли
     * ты ради этого текущую перестрелку.
     */
    courier: {
      hp: 2,
      radius: 9,
      speed: 62,
      accel: 500,
      friction: 800,
      /** На каком расстоянии от двери считается, что добежал. */
      reach: 44,
      /** Не дошёл за это время — выбирает другую дверь. */
      reachTimeout: 7,
      /** Стоит у двери и вызывает: последнее окно на перехват. */
      deliverTime: 2.2,
      /** Сколько человек приводит. */
      reinforceCount: 2,
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

  /**
   * Визуальный проход. Только рендер: ни один параметр отсюда
   * не влияет на симуляцию и не трогает её PRNG.
   */
  fx: {
    /**
     * Свечение акцентного красного: непрозрачность слоя и размытие.
     * На нуле слой выключается, и размытие не считается.
     */
    bloomAlpha: 0.85,
    bloomBlur: 11,
    bloomQuality: 3,

    /**
     * Хроматическая аберрация: в центре нуль, к краям растёт.
     * На нуле фильтр снимается со сцены совсем, а не считается впустую.
     */
    aberration: 0.15,

    /** Слой пыли. */
    dustCount: 110,
    dustSize: 1.6,
    dustSpeed: 11,
    dustAlpha: 0.22,
    /** Как быстро пылинку сносит по синусоиде. */
    dustDrift: 0.6,

    /** Векторный дым вокруг заражённых. */
    smokePuffs: 3,
    smokeRadius: 16,
    smokeSpread: 7,
    smokeSpin: 0.55,
    smokeAlpha: 0.3,
    smokeWidth: 1,

    /** Вспышка на стоп-кадре. */
    hitstopFlash: 0.14,
  },

  render: {
    /**
     * Стена — не кладка из блоков, а одна залитая масса. Швов между
     * тайлами нет вовсе; вместо них редкие технологические швы опалубки,
     * раз в wallJointStep тайлов, и только они напоминают, что стену
     * заливали частями.
     */
    wallJointStep: 4,
    wallJointWidth: 2,
    wallJointDepth: 0.55,
    /** Толщина шва между плитками ковролина. */
    floorGrid: 1,
    /** Светлая фаска по внутренней грани стены — непрерывная, на всю стену. */
    wainscotBand: 7,
    /** Волосяной кант поверх фаски. */
    brassRail: 2,
    /** Рама стеклянной перегородки и её импост. */
    glassSill: 3,
    glassMullion: 1,
    glassAlpha: 0.5,
    /** Наличник открытого проёма. */
    doorJamb: 5,
    /** Указатель-ствол субъекта. */
    aimLength: 26,
    aimWidth: 3,
    /**
     * Во сколько раз силуэт субъекта крупнее его хитбокса. Хитбокс остаётся
     * тем, под который отобрано ощущение; крупнее рисуется только силуэт,
     * потому что красное пятно обязано читаться первым. Правда про хитбокс
     * всегда доступна по F1.
     */
    playerSizeFactor: 1.4,
    /**
     * Светлый кант вокруг субъекта. Красный #C8102E по светлоте почти
     * равен полу, и на обесцвеченном кадре субъект в полу тонет — это
     * измерено, а не предположено. Кант возвращает ему контраст, не
     * добавляя в кадр ни красного, ни жёлтого.
     */
    playerRim: 2,
    /** Призраки, тянущиеся за рывком. */
    dashTrail: 3,
    dashGhostAlpha: 0.55,
    /** Во сколько раз сжимается контактная тень на рывке. */
    contactDashScale: 0.55,
    /** Шаг между призраками по времени рывка. */
    dashTrailStep: 0.035,
    /** Рамка телеграфа заражённого. */
    telegraphInset: 5,
    telegraphWidth: 2,
    /**
     * Телеграф больше не носит жёлтый: жёлтый по брифу принадлежит
     * должностям и разметке. Носитель — толщина и мигание. За
     * telegraphNear секунд до выстрела контур толстеет и мигает чаще;
     * всё остальное время он тонкий и ровный.
     */
    telegraphNear: 0.15,
    telegraphNearFactor: 2.5,
    telegraphBlinkSlow: 5,
    telegraphBlinkFast: 16,
    telegraphAlpha: 1,
    telegraphAlphaOff: 0.6,
    /** Служебные лучи: опись Ревизора и нить телекинеза. */
    serviceRayAlpha: 0.5,
    holdRayAlpha: 0.35,
    /** Длина луча наведения во время каста. */
    telegraphRay: 220,
    /** Толщина порога в открытом проёме. */
    doorThreshold: 5,
    /** Полоса на запертой двери. */
    doorBarInset: 9,
    /** Табличка на груди: высота, ширина как доля от силуэта. */
    plateHeight: 5,
    plateWidthFactor: 1.3,
    /** Зазор между табличками, когда должностей несколько. */
    plateStack: 2,

    // --- Силуэты по дизайн-документу ---
    /**
     * Урок, который уже стоил переделки: выступ обязан выходить за
     * габарит корпуса. Деталь внутри контура в силуэте не существует,
     * поэтому все числа ниже — про то, насколько деталь торчит наружу.
     */
    /** Инспектор: вынос и толщина вытянутой руки. */
    armReach: 1.35,
    armThickness: 0.33,
    /** Инспектор узкий, и поверх корпуса — жёсткий воротник-кольцо. */
    inspectorWidth: 0.85,
    collarWidth: 1.55,
    collarThick: 0.22,
    collarLift: 0.15,
    /**
     * Ревизор: голова поглощена совсем, поэтому головы в силуэте нет.
     * Вместо неё перекос: слева высокий столб массы, справа корпус
     * обрублен. Силуэт выше, чем шире, и заметно кривой.
     */
    bulkShift: 0.25,
    bulkHead: 0.3,
    bulkTall: 1.3,
    bulkLeft: 0.62,
    bulkRightWidth: 0.5,
    bulkRightHeight: 0.55,
    /** Курьер: вытянут по ходу движения, сумка через плечо. */
    slimWidth: 0.6,
    courierStretch: 1.6,
    courierBag: 0.42,
    courierBagOut: 0.55,
    /**
     * Стажёр: приземистый — шире, чем выше. Корпус нарочно шире хитбокса,
     * а не уже: силуэт меньше хитбокса означает пули, прилетающие в
     * пустоту рядом с телом, и это читается как обман.
     */
    internWide: 1.15,
    sunkenSquat: 0.8,
    internShoulder: 0.62,
    internShoulderOut: 0.42,
    /** Регистратор: боковые руки-картотеки выше корпуса. */
    registrarArmOut: 0.5,
    registrarArmTall: 1.3,
    /** Заведующий: свита табличек вокруг, вне его габарита. */
    chiefRetinue: 5,
    chiefRetinueRadius: 1.75,
    chiefRetinueSize: 0.28,
    chiefRetinueSpin: 0.3,

    // --- Три дешёвых приёма объёма ---
    /** Вертикальный градиент: доля высоты на светлую и тёмную полосу. */
    shadeTopBand: 0.28,
    shadeTopAlpha: 0.1,
    shadeBottomAlpha: 0.22,
    /** Тень от головы на плечи. */
    headShadowWidth: 0.55,
    headShadowDepth: 0.5,
    headShadowAlpha: 0.3,
    /** Контактная тень под телом. */
    contactDrop: 0.85,
    contactWidth: 0.95,
    contactHeight: 0.38,
    contactAlpha: 0.32,
    /** Насечка на табличке. */
    plateMarkSize: 2,
    plateMarkGap: 2,
    /** Насколько стол Регистратора шире его силуэта. */
    deskExtra: 6,
    /** Счётчик незакрытых ставок над Регистратором. */
    vacancyMark: 4,
    vacancyGap: 3,
    vacancyLift: 12,
    /** Рамка внутри клетки прохода в аномалию. */
    gateInset: 4,
    gateWidth: 2,
    /** Глухая рамка вокруг Ревизора, пока идёт опись. */
    auditShieldInset: 4,
    auditShieldWidth: 2,
    /** Зазор между панелями разрушаемой перегородки. */
    weakPanelGap: 2,
    /** Во сколько раз стрела зарядной формы длиннее своей ширины. */
    barLengthFactor: 3,
    /**
     * Картотечная карточка: летит плашмя, поэтому поперёк хода она
     * длиннее, чем вдоль. Ни одна форма субъекта так не выглядит —
     * различать пули можно и на тёмном мониторе, и без цвета.
     */
    cardAcross: 1.9,
    cardAlong: 0.6,
    /**
     * Красный ореол сотрудника. Решение твоё и против брифа: там красное
     * принадлежит только субъекту, а эмиссия — только лампе над дверью.
     * Оставляю ручки, чтобы откатить или пригасить одним движением.
     */
    staffGlowSpread: 1.35,
    staffGlowAlpha: 0.55,
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
    /** Стартовое состояние профайлера (переключается по F3). */
    profiler: false,
    /** По скольким кадрам усредняются показания профайлера. */
    profileWindow: 30,
    /**
     * Насколько должна просесть куча между кадрами, чтобы счесть это
     * уборкой мусора. Событий GC браузер не отдаёт, это догадка по
     * performance.memory.
     */
    gcDropBytes: 262144,
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
    title: 'РЕВИЗОР',
    fields: [
      { path: 'post.auditor.hp', label: 'ПРОЧНОСТЬ', min: 1, max: 60, step: 1, onRestart: true },
      { path: 'post.auditor.radius', label: 'ХИТБОКС', min: 6, max: 30, step: 0.5, onRestart: true },
      { path: 'post.auditor.speed', label: 'СКОРОСТЬ', min: 20, max: 300, step: 2 },
      { path: 'post.auditor.reach', label: 'ДИСТАНЦИЯ ОПИСИ', min: 20, max: 200, step: 2 },
      { path: 'post.auditor.inventoryTime', label: 'ВРЕМЯ НА ПРЕДМЕТ', min: 0.1, max: 6, step: 0.1 },
      { path: 'post.auditor.reachTimeout', label: 'ТЕРПЕНИЕ НА ПОДХОДЕ', min: 0.5, max: 20, step: 0.5 },
      { path: 'post.auditor.openTime', label: 'ОКНО УЯЗВИМОСТИ', min: 0.5, max: 15, step: 0.5 },
      { path: 'post.auditor.shotInterval', label: 'ИНТЕРВАЛ ПРЕДПИСАНИЙ', min: 0.3, max: 10, step: 0.1 },
      { path: 'post.auditor.shotTelegraph', label: 'ЗАМАХ', min: 0.05, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'ЗАВЕДУЮЩИЙ',
    fields: [
      { path: 'post.chief.hp', label: 'ПРОЧНОСТЬ', min: 1, max: 200, step: 1, onRestart: true },
      { path: 'post.chief.radius', label: 'ХИТБОКС', min: 8, max: 40, step: 0.5, onRestart: true },
      { path: 'post.chief.speed', label: 'СКОРОСТЬ', min: 10, max: 300, step: 2 },
      { path: 'post.chief.standoff', label: 'ДИСТАНЦИЯ БОЯ', min: 60, max: 600, step: 10 },
      { path: 'post.chief.ringCount', label: 'СНАРЯДОВ В ЦИРКУЛЯРЕ', min: 3, max: 40, step: 1 },
      { path: 'post.chief.ringInterval', label: 'ИНТЕРВАЛ ЦИРКУЛЯРА', min: 0.5, max: 12, step: 0.1 },
      { path: 'post.chief.ringTelegraph', label: 'ЗАМАХ ЦИРКУЛЯРА', min: 0.05, max: 3, step: 0.05 },
      { path: 'post.chief.ringTwistDeg', label: 'ПРОВОРОТ КОЛЬЦА', min: 0, max: 60, step: 1 },
      { path: 'post.chief.reshuffleInterval', label: 'ИНТЕРВАЛ ПЕРЕНАЗНАЧЕНИЙ', min: 1, max: 20, step: 0.5 },
      { path: 'post.chief.reshuffleCount', label: 'ПЕРЕНАЗНАЧАЕТ ЗА РАЗ', min: 0, max: 8, step: 1 },
      { path: 'floor.miniBossChance', label: 'ШАНС МИНИ-БОССА', min: 0, max: 1, step: 0.02, onRestart: true },
    ],
  },
  {
    title: 'КУРЬЕР',
    fields: [
      { path: 'post.courier.hp', label: 'ПРОЧНОСТЬ', min: 1, max: 20, step: 1, onRestart: true },
      { path: 'post.courier.speed', label: 'СКОРОСТЬ', min: 10, max: 300, step: 2 },
      { path: 'post.courier.deliverTime', label: 'ВЫЗОВ У ДВЕРИ', min: 0.2, max: 10, step: 0.1 },
      { path: 'post.courier.reinforceCount', label: 'ПРИВОДИТ ЧЕЛОВЕК', min: 0, max: 8, step: 1 },
      { path: 'post.courier.reach', label: 'ДИСТАНЦИЯ ДО ДВЕРИ', min: 20, max: 150, step: 2 },
      { path: 'post.courier.reachTimeout', label: 'ТЕРПЕНИЕ НА ПОДХОДЕ', min: 1, max: 30, step: 0.5 },
      { path: 'floor.courierChance', label: 'ШАНС КУРЬЕРА', min: 0, max: 1, step: 0.02, onRestart: true },
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
    title: 'ЗВУК',
    fields: [
      { path: 'audio.master', label: 'ГРОМКОСТЬ', min: 0, max: 1, step: 0.05 },
      { path: 'audio.voicesPerFrame', label: 'ГОЛОСОВ ЗА КАДР', min: 1, max: 16, step: 1 },
      { path: 'audio.attack', label: 'АТАКА', min: 0.01, max: 0.5, step: 0.01 },
    ],
  },
  {
    title: 'ВИЗУАЛ',
    fields: [
      { path: 'fx.bloomAlpha', label: 'СВЕЧЕНИЕ КРАСНОГО', min: 0, max: 2, step: 0.05 },
      { path: 'fx.bloomBlur', label: 'РАЗМЫТИЕ СВЕЧЕНИЯ', min: 0, max: 40, step: 1 },
      { path: 'fx.aberration', label: 'АБЕРРАЦИЯ ПО КРАЯМ', min: 0, max: 3, step: 0.05 },
      { path: 'fx.dustCount', label: 'ПЫЛИНОК', min: 0, max: 400, step: 10, onRestart: true },
      { path: 'fx.dustSize', label: 'РАЗМЕР ПЫЛИНКИ', min: 0.5, max: 6, step: 0.1 },
      { path: 'fx.dustSpeed', label: 'СКОРОСТЬ ПЫЛИ', min: 0, max: 80, step: 1 },
      { path: 'fx.dustAlpha', label: 'ПЛОТНОСТЬ ПЫЛИ', min: 0, max: 1, step: 0.02 },
      { path: 'fx.smokePuffs', label: 'КЛУБОВ ДЫМА', min: 0, max: 8, step: 1 },
      { path: 'fx.smokeRadius', label: 'РАДИУС ДЫМА', min: 2, max: 60, step: 1 },
      { path: 'fx.smokeSpin', label: 'ВРАЩЕНИЕ ДЫМА', min: 0, max: 4, step: 0.05 },
      { path: 'fx.smokeAlpha', label: 'ПЛОТНОСТЬ ДЫМА', min: 0, max: 1, step: 0.02 },
      { path: 'fx.hitstopFlash', label: 'ВСПЫШКА СТОП-КАДРА', min: 0, max: 0.6, step: 0.01 },
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
