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
  /**
   * Повторить в ряд с шагом в клетках. Восемь одинаковых столов
   * машбюро — это одна строка данных, а одинаковость и есть главный
   * приём: учреждение узнаётся по тому, что в нём всё повторяется.
   */
  repeat?: { count: number; stepCol: number; stepRow: number };
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

/**
 * Оборудование сцены. Отличается от обычного слота тем, что может быть
 * уже опрокинутым: тележка брошена поперёк прохода, и папки лежат
 * веером — это след, а не предмет, и удара для него не было.
 */
export interface SceneFixture {
  kind: string;
  col: number;
  row: number;
  /** Куда высыпалось. Пусто — оборудование стоит целым. */
  toppled?: { x: number; y: number };
}

/**
 * Сцена: три-четыре предмета в осмысленном взаимном расположении.
 * Разгадывать её не нужно — она нужна, чтобы участки отличались друг от
 * друга не только расстановкой укрытий.
 *
 * Сцена ставится ПОВЕРХ слотов планировки, своим потоком случайности, и
 * её предметы не сдвигают обычную мебель.
 */
export interface Scene {
  /** Что здесь произошло. В интерфейс не выводится: это для нас. */
  title: string;
  /** Предметы сцены: слоты мебели, обычно без разброса. */
  cover?: CoverSlot[];
  /** Оборудование сцены, в том числе уже опрокинутое. */
  fixtures?: SceneFixture[];
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
  /**
   * Оборудование: кулер, фикус, вешалка. Стоит, не пускает и роняется.
   * Слоты те же, что у антуража, но это уже сущности.
   */
  fixtures?: DecorSlot[];
  /**
   * Сцены помещения. Одна на участок, выбирается от seed; пусто —
   * участок без сцены.
   */
  scenes?: Scene[];
  rows: string[];
}

const OPEN = '................................';

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'hall',
    label: 'БУФЕТ',
    sector: 'concrete',
    difficulty: 1,
    weight: 4,
    staffing: ['patrol'],
    cover: [
      { kind: 'desk', col: 8, row: 5, jitter: 1, repeat: { count: 3, stepCol: 8, stepRow: 0 } },
      { kind: 'chair', col: 8, row: 7, jitter: 1, repeat: { count: 3, stepCol: 8, stepRow: 0 } },
      { kind: 'chair', col: 10, row: 13, jitter: 2, repeat: { count: 3, stepCol: 6, stepRow: 0 } },
      { kind: 'tank', col: 2, row: 16, jitter: 1, chance: 0.7 },
    ],
    fixtures: [
      { kind: 'cooler', col: 3, row: 6, jitter: 1 },
      { kind: 'bin', col: 28, row: 10, jitter: 1 },
      { kind: 'ashtray', col: 15, row: 16, jitter: 1, chance: 0.7 },
    ],
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
    scenes: [
      {
        // Человек резко встал: стул далеко от столика, урна набок.
        title: 'КТО-ТО РЕЗКО ВСТАЛ',
        cover: [
          { kind: 'desk', col: 20, row: 9, jitter: 0 },
          { kind: 'chair', col: 23, row: 8, jitter: 0 },
        ],
        fixtures: [{ kind: 'bin', col: 21, row: 11, toppled: { x: 1, y: 0.4 } }],
      },
      {
        title: 'СТУЛЬЯ СОСТАВИЛИ К СТЕНЕ',
        cover: [
          { kind: 'chair', col: 6, row: 17, jitter: 0, repeat: { count: 5, stepCol: 1.6, stepRow: 0 } },
        ],
        fixtures: [{ kind: 'ashtray', col: 14, row: 17 }],
      },
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
    label: 'КАРТОТЕКА',
    sector: 'concrete',
    difficulty: 2,
    weight: 3,
    staffing: ['registry'],
    cover: [
      { kind: 'cardbox', col: 10, row: 4, jitter: 2 },
      { kind: 'cardbox', col: 21, row: 13, jitter: 2 },
      { kind: 'typewriter', col: 16, row: 9, jitter: 2, chance: 0.8 },
      // Ряды стеллажей: этаж называется архивом не за название комнаты.
      { kind: 'cabinet', col: 7, row: 8, jitter: 0, repeat: { count: 4, stepCol: 6, stepRow: 0 } },
      { kind: 'cabinet', col: 7, row: 10, jitter: 0, repeat: { count: 4, stepCol: 6, stepRow: 0 } },
      { kind: 'chair', col: 16, row: 4, jitter: 2 }, { kind: 'chair', col: 16, row: 13, jitter: 2 },
      { kind: 'chair', col: 4, row: 9, jitter: 1, chance: 0.5 }],
    fixtures: [
      { kind: 'trolley', col: 8, row: 8, jitter: 2 },
      { kind: 'bin', col: 24, row: 4, jitter: 1 },
      { kind: 'cooler', col: 3, row: 13, jitter: 1, chance: 0.6 },
    ],
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
    scenes: [
      {
        title: 'ИСКАЛИ ОДНО ДЕЛО',
        cover: [
          { kind: 'cardbox', col: 16, row: 3, jitter: 0, repeat: { count: 3, stepCol: 1.5, stepRow: 0 } },
        ],
        fixtures: [{ kind: 'trolley', col: 14, row: 4 }],
      },
      {
        // Тележку бросили поперёк прохода, карточки высыпались к двери.
        title: 'КТО-ТО БЕЖАЛ',
        cover: [
          { kind: 'chair', col: 14, row: 9, jitter: 0 },
          { kind: 'cardbox', col: 18, row: 9, jitter: 0 },
        ],
        fixtures: [{ kind: 'trolley', col: 16, row: 8, toppled: { x: 0, y: 1 } }],
      },
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
    label: 'КОРИДОР ПОРТРЕТОВ',
    sector: 'concrete',
    difficulty: 1,
    weight: 2,
    staffing: ['patrol'],
    cover: [
      { kind: 'faxstand', col: 11, row: 9, jitter: 1 },
      { kind: 'faxstand', col: 20, row: 8, jitter: 1, chance: 0.8 },
      { kind: 'tank', col: 26, row: 9, jitter: 1, chance: 0.6 },{ kind: 'cabinet', col: 16, row: 8, jitter: 1 }, { kind: 'chair', col: 8, row: 17, jitter: 2 },
      { kind: 'chair', col: 24, row: 17, jitter: 2, chance: 0.7 }],
    fixtures: [
      { kind: 'ashtray', col: 9, row: 7, jitter: 1 },
      { kind: 'bin', col: 22, row: 9, jitter: 1 },
      { kind: 'rack', col: 15, row: 8, jitter: 1, chance: 0.5 },
    ],
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
    scenes: [
      {
        title: 'ОЧЕРЕДЬ НА ПРИЁМ',
        cover: [
          { kind: 'chair', col: 1, row: 4, jitter: 0, repeat: { count: 4, stepCol: 0, stepRow: 2 } },
        ],
        fixtures: [{ kind: 'rack', col: 1, row: 12 }],
      },
      {
        title: 'ТЕЛЕЖКУ БРОСИЛИ В ПРОХОДЕ',
        cover: [
          { kind: 'cardbox', col: 18, row: 8, jitter: 0 },
          { kind: 'chair', col: 20, row: 8, jitter: 0 },
        ],
        fixtures: [{ kind: 'trolley', col: 16, row: 8, toppled: { x: 1, y: 0 } }],
      },
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
    label: 'УЗЕЛ СВЯЗИ',
    sector: 'concrete',
    difficulty: 3,
    weight: 3,
    staffing: ['patrol', 'registry'],
    cover: [
      { kind: 'faxstand', col: 7, row: 5, jitter: 1, repeat: { count: 3, stepCol: 9, stepRow: 0 } },
      { kind: 'faxstand', col: 7, row: 13, jitter: 1, repeat: { count: 3, stepCol: 9, stepRow: 0 } },
      { kind: 'cabinet', col: 16, row: 9, jitter: 1 },
      { kind: 'cardbox', col: 20, row: 3, jitter: 1, chance: 0.8 },
      { kind: 'tank', col: 9, row: 12, jitter: 2, chance: 0.7 },
    ],
    fixtures: [
      { kind: 'rack', col: 2, row: 8, jitter: 1 },
      { kind: 'trolley', col: 30, row: 3, jitter: 1 },
      { kind: 'bin', col: 16, row: 16, jitter: 1, chance: 0.7 },
    ],
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
    scenes: [
      {
        title: 'СМЕНУ СНЯЛИ СРАЗУ',
        cover: [
          { kind: 'chair', col: 8, row: 4, jitter: 0 },
          { kind: 'chair', col: 9, row: 8, jitter: 0 },
          { kind: 'chair', col: 7, row: 12, jitter: 0 },
        ],
        fixtures: [{ kind: 'bin', col: 13, row: 8, toppled: { x: -1, y: 0 } }],
      },
      {
        title: 'КОРОБА ВЫНЕСЛИ В ПРОХОД',
        cover: [
          { kind: 'cardbox', col: 16, row: 4, jitter: 0, repeat: { count: 3, stepCol: 0, stepRow: 2 } },
        ],
        fixtures: [{ kind: 'trolley', col: 18, row: 8 }],
      },
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
    label: 'ПРИЁМНАЯ',
    sector: 'concrete',
    difficulty: 3,
    weight: 1,
    staffing: ['head_office'],
    cover: [
      { kind: 'desk', col: 16, row: 9, jitter: 0 },
      { kind: 'chair', col: 5, row: 9, jitter: 0, repeat: { count: 3, stepCol: 0, stepRow: 2 } },
      { kind: 'chair', col: 27, row: 9, jitter: 0, repeat: { count: 3, stepCol: 0, stepRow: 2 } },
      { kind: 'tank', col: 2, row: 16, jitter: 1, chance: 0.6 },
    ],
    fixtures: [
      { kind: 'rack', col: 3, row: 2, jitter: 0 },
      { kind: 'ficus', col: 28, row: 16, jitter: 0 },
      { kind: 'ashtray', col: 29, row: 7, jitter: 1, chance: 0.6 },
    ],
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 4, row: 7, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp-bad', col: 16, row: 1, jitter: 0 },
      { kind: 'paper', col: 10, row: 8, jitter: 3, chance: 0.4, repeat: { count: 8, stepCol: 1.6, stepRow: 0.5 } },
      { kind: 'portrait-big', col: 13, row: 0, jitter: 0, facing: 'n' },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 's' },
      { kind: 'evac', col: 1, row: 0, jitter: 0, facing: 's' },
      { kind: 'extinguisher', col: 30, row: 0, jitter: 0, facing: 's' },
    ],
    scenes: [
      {
        title: 'ЖДАЛИ ПРИЁМА',
        cover: [
          { kind: 'chair', col: 1, row: 11, jitter: 0, repeat: { count: 5, stepCol: 0, stepRow: 1.4 } },
        ],
        fixtures: [{ kind: 'rack', col: 2, row: 2 }],
      },
      {
        title: 'РАЗГОВОР НЕ СОСТОЯЛСЯ',
        cover: [
          { kind: 'chair', col: 19, row: 9, jitter: 0 },
          { kind: 'cardbox', col: 13, row: 8, jitter: 0 },
        ],
        fixtures: [{ kind: 'bin', col: 18, row: 11, toppled: { x: 0.6, y: 0.8 } }],
      },
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
    label: 'МАШИННОЕ БЮРО',
    sector: 'office',
    difficulty: 2,
    weight: 3,
    staffing: ['registry'],
    cover: [
      { kind: 'desk', col: 4, row: 4, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'desk', col: 4, row: 14, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'typewriter', col: 4, row: 3, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'typewriter', col: 4, row: 15, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'faxstand', col: 16, row: 9, jitter: 1, chance: 0.8 },
      { kind: 'chair', col: 2, row: 9, jitter: 1, chance: 0.6 },
    ],
    // Перегородки ломают линию взгляда, но не останавливают пули:
    // Инспектор здесь почти беспомощен, Регистратор накрывает поверх.
    fixtures: [
      { kind: 'cooler', col: 16, row: 8, jitter: 1 },
      { kind: 'bin', col: 6, row: 10, jitter: 2 },
      { kind: 'trolley', col: 22, row: 8, jitter: 1 },
      { kind: 'ashtray', col: 29, row: 15, jitter: 1, chance: 0.6 },
    ],
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
    scenes: [
      {
        // Один стол стоит отдельно от рядов, лицом от всех остальных.
        title: 'ОДИН ОСТАЛСЯ ПОСЛЕ ВСЕХ',
        cover: [
          { kind: 'desk', col: 30, row: 5, jitter: 0 },
          { kind: 'typewriter', col: 29, row: 4, jitter: 0 },
          { kind: 'chair', col: 29, row: 6, jitter: 0 },
        ],
      },
      {
        title: 'ПЕРЕРЫВ',
        cover: [
          { kind: 'chair', col: 22, row: 17, jitter: 0, repeat: { count: 4, stepCol: 1.5, stepRow: 0 } },
        ],
        fixtures: [{ kind: 'ashtray', col: 29, row: 17 }],
      },
    ],
    rows: [
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
      '................................',
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
      '................................',
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
      '................................',
      '................................',
      '..%%%%%.%%%%%.....%%%%%.%%%%%...',
      '................................',
    ],
  },
  {
    id: 'copy',
    label: 'КОПИРОВАЛЬНАЯ',
    sector: 'office',
    difficulty: 2,
    weight: 3,
    staffing: [],
    cover: [
      { kind: 'cabinet', col: 8, row: 9, jitter: 1 },
      { kind: 'cabinet', col: 24, row: 9, jitter: 1 },
      { kind: 'cardbox', col: 4, row: 5, jitter: 1, repeat: { count: 2, stepCol: 0, stepRow: 9 } },
      { kind: 'cardbox', col: 28, row: 5, jitter: 1, repeat: { count: 2, stepCol: 0, stepRow: 9 } },
      { kind: 'chair', col: 16, row: 4, jitter: 2, chance: 0.7 },
      { kind: 'chair', col: 16, row: 14, jitter: 2, chance: 0.7 },
    ],
    fixtures: [
      { kind: 'trolley', col: 16, row: 9, jitter: 1 },
      { kind: 'bin', col: 20, row: 13, jitter: 1 },
      { kind: 'bin', col: 12, row: 5, jitter: 1, chance: 0.7 },
    ],
    decor: [
      { kind: 'path', col: 2, row: 8, jitter: 0, repeat: { count: 7, stepCol: 4, stepRow: 0 } },
      { kind: 'lamp', col: 4, row: 4, jitter: 0, repeat: { count: 4, stepCol: 7, stepRow: 0 } },
      { kind: 'lamp-bad', col: 18, row: 13, jitter: 0 },
      { kind: 'duct', col: 1, row: 17, jitter: 0, repeat: { count: 9, stepCol: 3.4, stepRow: 0 } },
      { kind: 'paper', col: 3, row: 3, jitter: 5, chance: 0.85, repeat: { count: 26, stepCol: 1.1, stepRow: 0.5 } },
      { kind: 'clock', col: 16, row: 0, jitter: 0, facing: 'n' },
      { kind: 'board', col: 6, row: 0, jitter: 0, facing: 'n' },
      { kind: 'panel', col: 26, row: 0, jitter: 0, facing: 'n', chance: 0.7 },
      { kind: 'evac', col: 2, row: 0, jitter: 0, facing: 's' },
    ],
    scenes: [
      {
        title: 'БУМАГУ БРОСИЛИ',
        cover: [
          { kind: 'cardbox', col: 18, row: 14, jitter: 0 },
          { kind: 'chair', col: 14, row: 14, jitter: 0 },
        ],
        fixtures: [{ kind: 'trolley', col: 16, row: 13, toppled: { x: 0, y: 1 } }],
      },
      {
        title: 'ПЕРЕБИРАЛИ АРХИВ',
        cover: [
          { kind: 'cardbox', col: 9, row: 9, jitter: 0, repeat: { count: 3, stepCol: 1.5, stepRow: 0 } },
          { kind: 'chair', col: 7, row: 9, jitter: 0 },
        ],
        fixtures: [{ kind: 'bin', col: 14, row: 9 }],
      },
    ],
    rows: [
      '................................',
      '................................',
      '.##....##....##......##....##...',
      '.##....##....##......##....##...',
      '................................',
      '................................',
      '....##....##........##....##....',
      '....##....##........##....##....',
      '................................',
      '................................',
      '................................',
      '.##....##....##......##....##...',
      '.##....##....##......##....##...',
      '................................',
      '................................',
      '....##....##........##....##....',
      '....##....##........##....##....',
      '................................',
    ],
  },
  {
    id: 'glass',
    label: 'ПЕРЕГОВОРНАЯ',
    sector: 'office',
    difficulty: 3,
    weight: 2,
    staffing: ['registry', 'patrol'],
    cover: [
      { kind: 'desk', col: 13, row: 9, jitter: 0, repeat: { count: 3, stepCol: 3, stepRow: 0 } },
      { kind: 'chair', col: 13, row: 6, jitter: 0, repeat: { count: 3, stepCol: 3, stepRow: 0 } },
      { kind: 'chair', col: 13, row: 12, jitter: 0, repeat: { count: 3, stepCol: 3, stepRow: 0 } },
      { kind: 'cardbox', col: 4, row: 4, jitter: 1, chance: 0.7 },
      { kind: 'faxstand', col: 27, row: 13, jitter: 1, chance: 0.7 },
    ],
    // Кабинет из стекла: видно всё, и тебя тоже. Стены простреливаются
    // и бьются, поэтому укрытие здесь расходуется прямо по ходу боя.
    fixtures: [
      { kind: 'rack', col: 4, row: 4, jitter: 1 },
      { kind: 'cooler', col: 27, row: 11, jitter: 1 },
      { kind: 'ficus', col: 16, row: 14, jitter: 1, chance: 0.7 },
    ],
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
    scenes: [
      {
        title: 'СОВЕЩАНИЕ ПРЕРВАЛИ',
        cover: [
          { kind: 'chair', col: 11, row: 4, jitter: 0 },
          { kind: 'chair', col: 20, row: 13, jitter: 0 },
          { kind: 'cardbox', col: 16, row: 5, jitter: 0 },
        ],
      },
      {
        title: 'ГОТОВИЛИ ПОМЕЩЕНИЕ',
        cover: [
          { kind: 'chair', col: 2, row: 16, jitter: 0, repeat: { count: 5, stepCol: 1.6, stepRow: 0 } },
        ],
        fixtures: [{ kind: 'rack', col: 1, row: 15 }],
      },
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
