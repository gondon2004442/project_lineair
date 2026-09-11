/**
 * Предметы. Это ДАННЫЕ.
 *
 * Предмет — это набор правок к tuning-параметрам оружия и ничего больше.
 * Правка применяется как (база + add) * mul, порядок предметов в билде
 * на результат не влияет.
 *
 * Описание — внутренний служебный отчёт: так предмет читается как
 * находка с объекта, а не как строчка в таблице характеристик.
 */
export interface ItemMod {
  /** Путь внутри TUNING, например 'weapon.precise.damage'. */
  path: string;
  add?: number;
  mul?: number;
}

export interface Item {
  id: string;
  /** Инвентарный номер. По нему предмет опознают в оверлее. */
  code: string;
  title: string;
  /** Служебный отчёт: строки выводятся как есть. */
  report: string[];
  mods: ItemMod[];
}

export const ITEMS: Item[] = [
  {
    id: 'clip',
    code: 'ОБ-114',
    title: 'СКОБА КАНЦЕЛЯРСКАЯ',
    report: [
      'ОСНОВАНИЕ: акт осмотра помещения 114, ящик картотеки.',
      'ОПИСАНИЕ: скоба стальная, 24 мм, подшивает что угодно,',
      'включая то, что подшивать не следовало.',
      'ЗАКЛЮЧЕНИЕ: одиночный выстрел бьёт сильнее, но реже.',
      'Пригодна к выдаче.',
    ],
    mods: [
      { path: 'weapon.precise.damage', add: 1 },
      { path: 'weapon.precise.interval', mul: 1.2 },
    ],
  },
  {
    id: 'tape',
    code: 'ОБ-207',
    title: 'ЛЕНТА МЕРНАЯ',
    report: [
      'ОСНОВАНИЕ: изъята у сотрудника, измерявшего коридор седьмой раз.',
      'ОПИСАНИЕ: лента в корпусе, деления нанесены дважды и не совпадают.',
      'ЗАКЛЮЧЕНИЕ: расстояние до цели субъект оценивает точнее,',
      'одиночный выстрел идёт быстрее и почти без увода.',
      'Повторный замер не требуется.',
    ],
    mods: [
      { path: 'weapon.precise.speed', mul: 1.25 },
      { path: 'weapon.precise.spreadDeg', mul: 0.4 },
    ],
  },
  {
    id: 'press',
    code: 'ОБ-301',
    title: 'ПРЕСС ДЛЯ ПОДШИВКИ',
    report: [
      'ОСНОВАНИЕ: обнаружен в переплётной, прижимал дело без номера.',
      'ОПИСАНИЕ: пресс чугунный, винт сорван, усилие не регулируется.',
      'ЗАКЛЮЧЕНИЕ: дробовая форма кладёт в сноп больше,',
      'расход боезапаса соответственно выше.',
      'Регулировке не подлежит.',
    ],
    mods: [
      { path: 'weapon.scatter.pellets', add: 4 },
      { path: 'weapon.scatter.cost', add: 2 },
    ],
  },
  {
    id: 'stamp',
    code: 'ОБ-355',
    title: 'ШТЕМПЕЛЬ СКВОЗНОЙ',
    report: [
      'ОСНОВАНИЕ: изъят после происшествия в приёмной.',
      'ОПИСАНИЕ: штемпель проставляет отметку на всех листах подшивки',
      'одновременно, включая нижние, включая стол.',
      'ЗАКЛЮЧЕНИЕ: зарядная форма пробивает больше тел,',
      'но заряд набирается дольше.',
      'Хранить отдельно от мебели.',
    ],
    mods: [
      { path: 'weapon.lance.pierce', add: 3 },
      { path: 'weapon.lance.chargeTime', mul: 1.35 },
    ],
  },
  {
    id: 'index',
    code: 'ОБ-402',
    title: 'КАРТОТЕЧНЫЙ ИНДЕКС',
    report: [
      'ОСНОВАНИЕ: найден в ящике, который не значится в описи ящиков.',
      'ОПИСАНИЕ: индекс находит карточку раньше, чем её запросили.',
      'ЗАКЛЮЧЕНИЕ: залп плотнее и доворачивает увереннее,',
      'общий боезапас формы сокращён.',
      'Запрашивать не рекомендуется.',
    ],
    mods: [
      { path: 'weapon.volley.count', add: 2 },
      { path: 'weapon.volley.homingDeg', mul: 1.5 },
      { path: 'weapon.volley.ammoMax', add: -4 },
    ],
  },
  {
    id: 'regulation',
    code: 'ОБ-448',
    title: 'РЕГЛАМЕНТ СОКРАЩЁННЫЙ',
    report: [
      'ОСНОВАНИЕ: том 4 внутреннего распорядка, страницы 5-380 отсутствуют.',
      'ОПИСАНИЕ: оставшиеся страницы предписывают действовать немедленно',
      'и не уточняют, что именно делать.',
      'ЗАКЛЮЧЕНИЕ: боезапас всех форм восполняется заметно быстрее,',
      'но потолок запаса ниже.',
      'Полную редакцию не искать.',
    ],
    mods: [
      { path: 'weapon.precise.regen', mul: 1.6 },
      { path: 'weapon.scatter.regen', mul: 1.6 },
      { path: 'weapon.lance.regen', mul: 1.6 },
      { path: 'weapon.volley.regen', mul: 1.6 },
      { path: 'weapon.precise.ammoMax', mul: 0.65 },
      { path: 'weapon.scatter.ammoMax', mul: 0.65 },
      { path: 'weapon.lance.ammoMax', mul: 0.65 },
      { path: 'weapon.volley.ammoMax', mul: 0.65 },
    ],
  },
  {
    id: 'facsimile',
    code: 'ОБ-519',
    title: 'ПОДПИСЬ ФАКСИМИЛЬНАЯ',
    report: [
      'ОСНОВАНИЕ: штамп подписи заведующего, владелец не установлен.',
      'ОПИСАНИЕ: заверяет документ без участия заверяющего.',
      'Проверка подлинности даёт положительный результат в обоих случаях.',
      'ЗАКЛЮЧЕНИЕ: пауза перед восполнением сокращена вдвое,',
      'урон всех форм несколько снижен.',
      'Вопрос о полномочиях оставлен открытым.',
    ],
    mods: [
      { path: 'weapon.precise.regenDelay', mul: 0.45 },
      { path: 'weapon.scatter.regenDelay', mul: 0.45 },
      { path: 'weapon.lance.regenDelay', mul: 0.45 },
      { path: 'weapon.volley.regenDelay', mul: 0.45 },
      { path: 'weapon.precise.damage', mul: 0.85 },
      { path: 'weapon.scatter.damage', mul: 0.85 },
      { path: 'weapon.lance.damage', mul: 0.85 },
      { path: 'weapon.volley.damage', mul: 0.85 },
    ],
  },
  {
    id: 'writeoff',
    code: 'ОБ-673',
    title: 'АКТ О СПИСАНИИ',
    report: [
      'ОСНОВАНИЕ: акт о списании имущества, графа «наименование» пуста.',
      'ОПИСАНИЕ: всё, что вписано в акт, считается списанным',
      'с момента подписания. Вписывать разрешено любым почерком.',
      'ЗАКЛЮЧЕНИЕ: урон всех форм существенно выше,',
      'боезапас существенно ниже.',
      'Акт хранить заполненным.',
    ],
    mods: [
      { path: 'weapon.precise.damage', mul: 1.5 },
      { path: 'weapon.scatter.damage', mul: 1.5 },
      { path: 'weapon.lance.damage', mul: 1.5 },
      { path: 'weapon.lance.damageCharged', mul: 1.5 },
      { path: 'weapon.volley.damage', mul: 1.5 },
      { path: 'weapon.precise.ammoMax', mul: 0.6 },
      { path: 'weapon.scatter.ammoMax', mul: 0.6 },
      { path: 'weapon.lance.ammoMax', mul: 0.6 },
      { path: 'weapon.volley.ammoMax', mul: 0.6 },
    ],
  },
];

export const ITEMS_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
