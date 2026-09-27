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
}

/**
 * Каталог. Пока пуст: сначала проверяется, что слой ничего не стоит,
 * и только потом он наполняется.
 */
export const DECOR: DecorSpec[] = [];

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
