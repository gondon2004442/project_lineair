/**
 * АНТУРАЖ. Это ДАННЫЕ.
 *
 * Предметы, которые ничего не делают. Место становится местом именно за
 * счёт бесполезного: офис узнаётся не по столу — стол есть везде, — а по
 * календарю с зачёркнутыми днями, табличке у двери и огнетушителю.
 *
 * Антураж не участвует ни в физике, ни в описи Ревизора, ни в
 * телекинезе. Он даже не сущность: рисуется отдельным слоем и в мире не
 * существует.
 *
 * ПРАВИЛО СВЕТЛОТЫ, которое нельзя нарушать: антураж живёт ниже
 * обстановки. Всё, что можно бросить, за чем можно спрятаться или что
 * вносится в опись, — светлее любого декора. Исключение одно: бумага.
 * Листки и таблички светлые, но мелкие и плоские, за укрытие их никто не
 * примет, а рассказывают они больше всего.
 *
 * Правило проверяется само: DECOR_TOO_LIGHT собирает нарушителей на
 * старте, и стенд роняет сборку, если список не пуст.
 */
import { PALETTE } from '../palette';

export type Mount = 'wall' | 'floor' | 'ceiling' | 'stand';

export interface DecorSpec {
  id: string;
  title: string;
  mount: Mount;
  /** Габарит в клетках планировки. */
  size: [number, number];
  /** Цвет из палитры. */
  color: keyof typeof PALETTE;
  /** Мелкая светлая деталь поверх: бумага, латунь, эмаль. */
  detail?: keyof typeof PALETTE;
  /** Доля габарита, которую занимает деталь. */
  detailShare?: number;
  /**
   * Прозрачность. Нужна покрытию: протоптанное и разбросанная бумага
   * лежат НА полу, а не вместо него, и сплошная заливка читалась бы как
   * дыра. Пусто — заливать целиком.
   */
  alpha?: number;
  /**
   * Мигает. Такой предмет не запекается вместе со слоем: мигание живёт
   * своим генератором и рисуется каждый кадр отдельным проходом.
   */
  flicker?: boolean;
}

/**
 * Каталог облицовки. Всё, что висит на стенах и не делает ничего.
 *
 * Красного здесь нет и быть не может — даже у огнетушителя, который в
 * жизни красный: красный принадлежит субъекту, и правило старше
 * правдоподобия.
 */
export const DECOR: DecorSpec[] = [
  {
    id: 'arrow',
    title: 'УКАЗАТЕЛЬ СО СТРЕЛКОЙ',
    mount: 'wall',
    size: [1, 0.4],
    color: 'plaster',
    detail: 'paper',
    detailShare: 0.55,
  },
  {
    id: 'clock',
    title: 'ЧАСЫ СЛУЖЕБНЫЕ',
    mount: 'wall',
    size: [0.5, 0.5],
    color: 'enamel',
    detail: 'paper',
    detailShare: 0.45,
  },
  {
    id: 'calendar',
    title: 'КАЛЕНДАРЬ ПЕРЕКИДНОЙ',
    mount: 'wall',
    size: [0.55, 0.7],
    color: 'concrete700',
    detail: 'paper',
    detailShare: 0.6,
  },
  {
    id: 'portrait',
    title: 'ПОРТРЕТ В РАМКЕ',
    mount: 'wall',
    size: [0.7, 0.9],
    color: 'woodDark',
    detail: 'concrete700',
    detailShare: 0.7,
  },
  {
    /** Портрет во всю стену: он один такой и висит только в приёмной. */
    id: 'portrait-big',
    title: 'ПОРТРЕТ ВО ВСЮ СТЕНУ',
    mount: 'wall',
    size: [6, 0.95],
    color: 'woodDark',
    detail: 'concrete900',
    detailShare: 0.8,
  },
  {
    id: 'evac',
    title: 'СХЕМА ЭВАКУАЦИИ',
    mount: 'wall',
    size: [1, 0.75],
    color: 'concrete900',
    detail: 'paper',
    detailShare: 0.7,
  },
  {
    id: 'extinguisher',
    title: 'ОГНЕТУШИТЕЛЬ В НИШЕ',
    mount: 'wall',
    size: [0.35, 0.85],
    color: 'enamel',
    detail: 'concrete900',
    detailShare: 0.25,
  },
  {
    id: 'panel',
    title: 'ЩИТОК С ТУМБЛЕРАМИ',
    mount: 'wall',
    size: [0.7, 0.55],
    color: 'enamel',
    detail: 'concrete900',
    detailShare: 0.3,
  },
  {
    id: 'board',
    title: 'ДОСКА ОБЪЯВЛЕНИЙ',
    mount: 'wall',
    size: [1.4, 0.9],
    color: 'woodDark',
    detail: 'paper',
    detailShare: 0.35,
  },
  {
    id: 'tube',
    title: 'ТРУБА ПНЕВМОПОЧТЫ',
    mount: 'wall',
    size: [0.3, 1],
    color: 'enamel',
  },

  // --- Покрытие: то, что лежит на полу и светит с потолка ---
  {
    /**
     * Протоптанное. В документе для него заведён цвет worn — но он
     * придуман для ковролина, а у нас бетонная плитка: worn поверх
     * пола даёт разницу светлоты в два пункта, то есть не даёт
     * ничего. Замерено. Тропа рисуется цветом половинного шва: она
     * читается как затёртая до шва плитка, а не как пятно.
     */
    id: 'path',
    title: 'ПРОТОПТАННОЕ',
    mount: 'floor',
    size: [4, 1.2],
    color: 'floorSeam',
    alpha: 0.55,
  },
  {
    /**
     * Бумага на полу. Прозрачность здесь не украшение, а разведение с
     * талоном: талон — это мелкая светлая бумажка, которую подбирают, и
     * если разбросанные листки будут той же светлоты, игрок побежит за
     * мусором. Талон 155, лист на полу 118 — и у талона есть просечка.
     */
    id: 'paper',
    title: 'БУМАГА НА ПОЛУ',
    mount: 'floor',
    size: [0.3, 0.22],
    color: 'paper',
    alpha: 0.4,
  },
  {
    id: 'duct',
    title: 'КАБЕЛЬНЫЙ КОРОБ',
    mount: 'floor',
    size: [3, 0.3],
    color: 'concrete700',
  },
  {
    id: 'lamp',
    title: 'СВЕТ ЛЮМИНЕСЦЕНТНОЙ ПАНЕЛИ',
    mount: 'ceiling',
    size: [3, 2],
    color: 'concrete300',
  },
  {
    id: 'lamp-bad',
    title: 'ПАНЕЛЬ, КОТОРАЯ МИГАЕТ',
    mount: 'ceiling',
    size: [3, 2],
    color: 'concrete300',
    flicker: true,
  },
];

export const DECOR_BY_ID = new Map(DECOR.map((d) => [d.id, d]));

/** Светлота цвета. Та же формула, что в проверках контраста. */
function luma(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const FURNITURE_LUMA = luma(PALETTE.furniture);
/** Бумаге светлым быть разрешено: она плоская и мелкая. */
const PAPER_KEYS = new Set<keyof typeof PALETTE>(['paper']);

/**
 * Нарушители правила светлоты. Пустой список — правило соблюдено.
 * Считается один раз на старте и ничего не стоит.
 */
export const DECOR_TOO_LIGHT: string[] = DECOR.filter((spec) => {
  const own = luma(PALETTE[spec.color]);
  const mark = spec.detail === undefined ? 0 : luma(PALETTE[spec.detail]);
  const ownBad = own >= FURNITURE_LUMA && !PAPER_KEYS.has(spec.color);
  const markBad =
    spec.detail !== undefined && mark >= FURNITURE_LUMA && !PAPER_KEYS.has(spec.detail);
  return ownBad || markBad;
}).map((spec) => spec.id);
