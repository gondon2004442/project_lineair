/**
 * Планировки помещений. Это ДАННЫЕ, а не код: рисунок из знаков.
 *
 *   '.' — пол
 *   '#' — бетонный блок
 *   '%' — разрушаемая перегородка: простреливается и ломается броском
 *   '@' — проход в аномалию: только в вестибюле, шагнул — начался забег
 *
 * Каждая планировка ровно TUNING.room.cols на TUNING.room.rows знаков.
 * Внешняя стена и дверные проёмы дорисовываются сборщиком, их тут нет.
 *
 * Правило, которое обязана соблюдать любая планировка: середина по обеим
 * осям свободна, иначе дверь упрётся в бетон. Сборщик всё равно проверяет
 * связность заливкой и откатывается на открытый холл, если проверка не прошла.
 */
/**
 * Слот мебели: где стоит и насколько может разойтись. Разброс обязателен —
 * без него одна и та же планировка игралась бы одинаково каждый раз.
 * Координаты в клетках планировки, считая от её левого верхнего угла.
 */
export interface CoverSlot {
  kind: string;
  col: number;
  row: number;
  /** Разброс в клетках в обе стороны. */
  jitter: number;
  /** Вероятность, что слот вообще занят. По умолчанию занят всегда. */
  chance?: number;
}

/**
 * Слот антуража. Как слот мебели, но с привязкой к стене и с повтором.
 *
 * repeat — главное поле файла: одна строка данных даёт ряд из пяти
 * портретов или восемь столов машбюро. Повторение и есть главный приём
 * стиля: учреждение узнаётся по тому, что в нём всё одинаковое.
 */
export interface DecorSlot {
  kind: string;
  col: number;
  row: number;
  /** Разброс в клетках в обе стороны. */
  jitter: number;
  /** Вероятность, что слот вообще занят. По умолчанию занят всегда. */
  chance?: number;
  /** Для mount:'wall' — к какой стене прижать; иначе не читается. */
  facing?: 'n' | 's' | 'e' | 'w';
  /** Повторить в ряд с шагом в клетках. */
  repeat?: { count: number; stepCol: number; stepRow: number };
}

export interface RoomTemplate {
  id: string;
  /** Как помещение называется в служебной сводке. */
  label: string;
  /**
   * Бетонный сектор или офисный. Это не косметика: в бетонном зале
   * длинные линии огня и силён Инспектор, в офисе перегородки ломают
   * взгляд, и сильнее становится Регистратор, который бьёт поверх них.
   */
  sector: 'concrete' | 'office';
  /** 1 — начало этажа, 3 — глубина. Планировка подбирается по ней. */
  difficulty: 1 | 2 | 3;
  /** Вес при случайном выборе среди подходящих. */
  weight: number;
  /** Расписания, которые этой планировке к лицу. Пусто — любое. */
  staffing: string[];
  /** Мебель: слоты с разбросом. Пусто — раскидать как придётся. */
  cover: CoverSlot[];
  /**
   * Антураж: то, что не участвует в бою. Пусто — помещение голое.
   * Необязательное поле: шаблон без антуража остаётся валидным.
   */
  decor?: DecorSlot[];
  /** Сцена: три-четыре предмета в осмысленном расположении. */
  scene?: string;
  rows: string[];
}

const OPEN = '................................';

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'hall',
    label: 'ОТКРЫТЫЙ ХОЛЛ',
    sector: 'concrete',
    difficulty: 1,
    weight: 4,
    staffing: ['patrol'],
    cover: [{ kind: 'chair', col: 8, row: 5, jitter: 2 }, { kind: 'chair', col: 23, row: 12, jitter: 2 },
      { kind: 'cabinet', col: 6, row: 9, jitter: 1 }, { kind: 'cabinet', col: 25, row: 8, jitter: 1 },
      { kind: 'chair', col: 16, row: 3, jitter: 3, chance: 0.6 }],
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 5, row: 3, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp-bad', col: 12, row: 12, jitter: 0 },
      { kind: 'duct', col: 1, row: 0, jitter: 0, repeat: { count: 9, stepCol: 3.4, stepRow: 0 } },
      { kind: 'paper', col: 4, row: 4, jitter: 3, chance: 0.6, repeat: { count: 10, stepCol: 2.6, stepRow: 1 } },
      { kind: 'evac', col: 2, row: 0, jitter: 0, facing: 'n' },
      { kind: 'extinguisher', col: 29, row: 0, jitter: 0, facing: 'n' },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 'n' },
      { kind: 'arrow', col: 6, row: 0, jitter: 1, facing: 's', chance: 0.7 },
      { kind: 'portrait', col: 10, row: 0, jitter: 0, facing: 's',
        repeat: { count: 4, stepCol: 2, stepRow: 0 } },
    ],
    rows: [
      OPEN,
      OPEN,
      '....####..................####..',
      '....####..................####..',
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      '....####..................####..',
      '....####..................####..',
      OPEN,
      OPEN,
      OPEN,
    ],
  },
  {
    id: 'cabinets',
    label: 'РЯДЫ КАРТОТЕК',
    sector: 'concrete',
    difficulty: 2,
    weight: 3,
    staffing: ['registry'],
    cover: [{ kind: 'cabinet', col: 9, row: 9, jitter: 1 }, { kind: 'cabinet', col: 22, row: 9, jitter: 1 },
      { kind: 'chair', col: 16, row: 4, jitter: 2 }, { kind: 'chair', col: 16, row: 13, jitter: 2 },
      { kind: 'chair', col: 4, row: 9, jitter: 1, chance: 0.5 }],
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 4, row: 2, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp-bad', col: 25, row: 13, jitter: 0 },
      { kind: 'paper', col: 3, row: 3, jitter: 4, chance: 0.75, repeat: { count: 14, stepCol: 2, stepRow: 0.9 } },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 'n' },
      { kind: 'board', col: 3, row: 0, jitter: 0, facing: 'n' },
      { kind: 'calendar', col: 27, row: 0, jitter: 0, facing: 'n', chance: 0.8 },
      { kind: 'evac', col: 1, row: 0, jitter: 0, facing: 's' },
      { kind: 'panel', col: 24, row: 0, jitter: 1, facing: 's', chance: 0.6 },
    ],
    rows: [
      OPEN,
      '..####..####........####..####..',
      '..####..####........####..####..',
      OPEN,
      OPEN,
      '..%%%%..%%%%........%%%%..%%%%..',
      '..%%%%..%%%%........%%%%..%%%%..',
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      '..%%%%..%%%%........%%%%..%%%%..',
      '..%%%%..%%%%........%%%%..%%%%..',
      OPEN,
      OPEN,
      '..####..####........####..####..',
      '..####..####........####..####..',
      OPEN,
    ],
  },
  {
    id: 'corridor',
    label: 'УЗКИЙ КОРИДОР',
    sector: 'concrete',
    difficulty: 1,
    weight: 2,
    staffing: ['patrol'],
    cover: [{ kind: 'cabinet', col: 16, row: 8, jitter: 1 }, { kind: 'chair', col: 8, row: 17, jitter: 2 },
      { kind: 'chair', col: 24, row: 17, jitter: 2, chance: 0.7 }],
    decor: [
      { kind: 'path', col: 1, row: 8, jitter: 0, repeat: { count: 8, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 3, row: 7, jitter: 0, repeat: { count: 5, stepCol: 6, stepRow: 0 } },
      { kind: 'lamp-bad', col: 27, row: 7, jitter: 0 },
      { kind: 'duct', col: 1, row: 1, jitter: 0, repeat: { count: 10, stepCol: 3.1, stepRow: 0 } },
      { kind: 'paper', col: 6, row: 9, jitter: 2, chance: 0.5, repeat: { count: 8, stepCol: 3, stepRow: 0 } },
      { kind: 'clock', col: 4, row: 0, jitter: 0, facing: 'n',
        repeat: { count: 6, stepCol: 5, stepRow: 0 } },
      { kind: 'portrait', col: 3, row: 0, jitter: 0, facing: 's',
        repeat: { count: 5, stepCol: 6, stepRow: 0 } },
      { kind: 'arrow', col: 15, row: 0, jitter: 0, facing: 'n' },
    ],
    rows: [
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      '....%%%%%%%%%%....%%%%%%%%%%....',
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      OPEN,
      OPEN,
      OPEN,
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      '....##########....##########....',
      OPEN,
    ],
  },
  {
    id: 'atrium',
    label: 'АТРИУМ С КОЛОННАМИ',
    sector: 'concrete',
    difficulty: 3,
    weight: 3,
    staffing: ['patrol', 'registry'],
    cover: [{ kind: 'chair', col: 16, row: 8, jitter: 3 }, { kind: 'cabinet', col: 8, row: 8, jitter: 2 },
      { kind: 'cabinet', col: 23, row: 8, jitter: 2 }, { kind: 'chair', col: 16, row: 16, jitter: 2 },
      { kind: 'chair', col: 16, row: 0, jitter: 2, chance: 0.6 }],
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'path', col: 14, row: 2, jitter: 0, repeat: { count: 5, stepCol: 0, stepRow: 3 } },
      { kind: 'lamp', col: 6, row: 4, jitter: 0, repeat: { count: 3, stepCol: 9, stepRow: 0 } },
      { kind: 'lamp-bad', col: 15, row: 14, jitter: 0 },
      { kind: 'paper', col: 8, row: 6, jitter: 3, chance: 0.5, repeat: { count: 8, stepCol: 2.4, stepRow: 0.7 } },
      { kind: 'evac', col: 2, row: 0, jitter: 0, facing: 'n' },
      { kind: 'tube', col: 0, row: 4, jitter: 0, facing: 'w',
        repeat: { count: 3, stepCol: 0, stepRow: 4 } },
      { kind: 'extinguisher', col: 31, row: 0, jitter: 0, facing: 'n' },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 's' },
    ],
    rows: [
      OPEN,
      '....##....##..........##....##..',
      '....##....##..........##....##..',
      OPEN,
      OPEN,
      '....##....##..........##....##..',
      '....##....##..........##....##..',
      OPEN,
      OPEN,
      OPEN,
      '....##....##..........##....##..',
      '....##....##..........##....##..',
      OPEN,
      OPEN,
      '....##....##..........##....##..',
      '....##....##..........##....##..',
      OPEN,
      OPEN,
    ],
  },
  {
    id: 'office',
    label: 'ПРИЁМНАЯ ЗАВЕДУЮЩЕГО',
    sector: 'concrete',
    difficulty: 3,
    weight: 1,
    staffing: ['head_office'],
    cover: [{ kind: 'cabinet', col: 3, row: 9, jitter: 1 }, { kind: 'cabinet', col: 28, row: 9, jitter: 1 },
      { kind: 'chair', col: 16, row: 5, jitter: 2 }, { kind: 'chair', col: 16, row: 12, jitter: 2 }],
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 4, row: 7, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp-bad', col: 16, row: 1, jitter: 0 },
      { kind: 'paper', col: 10, row: 8, jitter: 3, chance: 0.4, repeat: { count: 8, stepCol: 1.6, stepRow: 0.5 } },
      { kind: 'portrait', col: 12, row: 0, jitter: 0, facing: 'n',
        repeat: { count: 5, stepCol: 2, stepRow: 0 } },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 's' },
      { kind: 'evac', col: 1, row: 0, jitter: 0, facing: 's' },
      { kind: 'extinguisher', col: 30, row: 0, jitter: 0, facing: 's' },
    ],
    rows: [
      OPEN,
      OPEN,
      OPEN,
      '......####............####......',
      '......####............####......',
      '......####............####......',
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      OPEN,
      '......####............####......',
      '......####............####......',
      '......####............####......',
      OPEN,
      OPEN,
      OPEN,
    ],
  },
  {
    id: 'cubicles',
    label: 'КУБИКЛОВАЯ ФЕРМА',
    sector: 'office',
    difficulty: 2,
    weight: 3,
    staffing: ['registry'],
    cover: [
      { kind: 'chair', col: 4, row: 3, jitter: 1 },
      { kind: 'chair', col: 10, row: 7, jitter: 1 },
      { kind: 'chair', col: 21, row: 13, jitter: 1 },
      { kind: 'chair', col: 27, row: 3, jitter: 1 },
      { kind: 'cabinet', col: 16, row: 8, jitter: 2 },
      { kind: 'cabinet', col: 16, row: 17, jitter: 2, chance: 0.6 },
    ],
    // Перегородки ломают линию взгляда, но не останавливают пули:
    // Инспектор здесь почти беспомощен, Регистратор накрывает поверх.
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 4, row: 3, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp', col: 4, row: 12, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp-bad', col: 20, row: 7, jitter: 0 },
      { kind: 'duct', col: 1, row: 17, jitter: 0, repeat: { count: 9, stepCol: 3.4, stepRow: 0 } },
      { kind: 'paper', col: 5, row: 5, jitter: 4, chance: 0.7, repeat: { count: 16, stepCol: 1.7, stepRow: 0.6 } },
      { kind: 'arrow', col: 5, row: 0, jitter: 1, facing: 'n' },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 'n' },
      { kind: 'board', col: 25, row: 0, jitter: 0, facing: 'n' },
      { kind: 'panel', col: 2, row: 0, jitter: 0, facing: 's' },
      { kind: 'calendar', col: 9, row: 0, jitter: 1, facing: 's',
        repeat: { count: 3, stepCol: 7, stepRow: 0 } },
    ],
    rows: [
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
      '................................',
      '................................',
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
    ],
  },
  {
    id: 'glass',
    label: 'СТЕКЛЯННЫЙ КАБИНЕТ',
    sector: 'office',
    difficulty: 3,
    weight: 2,
    staffing: ['registry', 'patrol'],
    cover: [
      { kind: 'cabinet', col: 16, row: 6, jitter: 1 },
      { kind: 'cabinet', col: 16, row: 11, jitter: 1 },
      { kind: 'chair', col: 12, row: 9, jitter: 1 },
      { kind: 'chair', col: 19, row: 9, jitter: 1 },
      { kind: 'chair', col: 3, row: 3, jitter: 2, chance: 0.5 },
      { kind: 'chair', col: 28, row: 15, jitter: 2, chance: 0.5 },
    ],
    // Кабинет из стекла: видно всё, и тебя тоже. Стены простреливаются
    // и бьются, поэтому укрытие здесь расходуется прямо по ходу боя.
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 5, row: 4, jitter: 0, repeat: { count: 3, stepCol: 9, stepRow: 0 } },
      { kind: 'lamp-bad', col: 8, row: 13, jitter: 0 },
      { kind: 'paper', col: 12, row: 7, jitter: 3, chance: 0.45, repeat: { count: 8, stepCol: 2, stepRow: 0.8 } },
      { kind: 'portrait', col: 9, row: 0, jitter: 0, facing: 'n',
        repeat: { count: 3, stepCol: 3, stepRow: 0 } },
      { kind: 'clock', col: 20, row: 0, jitter: 0, facing: 'n' },
      { kind: 'evac', col: 2, row: 0, jitter: 0, facing: 's' },
      { kind: 'tube', col: 31, row: 3, jitter: 0, facing: 'e',
        repeat: { count: 2, stepCol: 0, stepRow: 6 } },
    ],
    rows: [
      '................................',
      '................................',
      '................................',
      '........%%%%%%%..%%%%%%%........',
      '........%..............%........',
      '........%..............%........',
      '........%..............%........',
      '........%..............%........',
      '................................',
      '................................',
      '........%..............%........',
      '........%..............%........',
      '........%..............%........',
      '........%..............%........',
      '........%%%%%%%..%%%%%%%........',
      '................................',
      '................................',
      '................................',
    ],
  },
];

/**
 * Вестибюль. Не участок и не часть этажа: сюда нельзя попасть с этажа
 * и отсюда нельзя выйти в дверь. Единственный выход — проход в аномалию
 * по центру. Столы и стулья канцелярии стоят вокруг него,
 * и на них можно потренировать телекинез, пока не решился.
 */
export const LOBBY_TEMPLATE: RoomTemplate = {
  id: 'lobby',
  label: 'ВЕСТИБЮЛЬ ОБЪЕКТА',
  sector: 'office',
  difficulty: 1,
  weight: 0,
  staffing: [],
  cover: [],
  rows: [
    OPEN,
    '..####....####........####......',
    '..####....####........####......',
    OPEN,
    OPEN,
    OPEN,
    '..............@@@@..............',
    '..............@@@@..............',
    '..............@@@@..............',
    '..............@@@@..............',
    OPEN,
    OPEN,
    OPEN,
    '......####........####....####..',
    '......####........####....####..',
    OPEN,
    OPEN,
    OPEN,
  ],
};

export const TEMPLATES_BY_ID = new Map(ROOM_TEMPLATES.map((t) => [t.id, t]));

/** Планировка входного помещения — всегда пустой холл. */
export const TEMPLATE_START = 'hall';
/** Планировка приёмной: последнее помещение основного пути. */
export const TEMPLATE_END = 'office';
/** Планировка перехода между узлами. */
export const TEMPLATE_CORRIDOR = 'corridor';
