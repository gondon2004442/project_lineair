/**
 * Должности: кто это и как читается с одного взгляда. Это ДАННЫЕ.
 *
 * Взято из дизайн-документа BESTIARIUM (docs/art). Два его правила,
 * на которых держится вся читаемость:
 *
 *   1. «Заражение = сколько осталось кожи. Больше бетона — выше должность.»
 *      Отсюда поле skin: по нему выбирается оттенок на шкале бетона.
 *   2. «Ни один силуэт не должен совпадать с соседним. Красный — только
 *      игрок.» Поэтому цвет тут не задаётся вовсе, только форма.
 *
 * Числа поведения живут в src/tuning.ts, иначе до них не дотянется панель.
 */

/** Как сложен силуэт. Каждый вид не похож на соседние. */
export type Silhouette =
  | 'sunken' // голова утоплена в плечи, направления не читается
  | 'armed' // одна рука вытянута вбок: видно, откуда прилетит
  | 'wide' // вдвое шире, чем выше, плюс боковые руки
  | 'bulk' // вдвое крупнее субъекта, масса смещена влево
  | 'desk' // самый крупный, за столом
  | 'slim'; // узкий и лёгкий, всё время в движении

export interface PostSpec {
  id: string;
  title: string;
  /** Сколько процентов кожи осталось. Меньше — выше должность. */
  skin: number;
  silhouette: Silhouette;
  /** Насечек на табличке. */
  plateMarks: number;
  /** Сколько табличек. Регистратор занимает сразу две должности. */
  plates: number;
  /** Стол под сотрудником. */
  desk: boolean;
}

export const POSTS: PostSpec[] = [
  { id: 'intern', title: 'СТАЖЁР', skin: 85, silhouette: 'sunken', plateMarks: 0, plates: 1, desk: false },
  { id: 'inspector', title: 'ИНСПЕКТОР', skin: 50, silhouette: 'armed', plateMarks: 1, plates: 1, desk: false },
  { id: 'registrar', title: 'РЕГИСТРАТОР', skin: 35, silhouette: 'wide', plateMarks: 2, plates: 2, desk: true },
  { id: 'auditor', title: 'РЕВИЗОР', skin: 12, silhouette: 'bulk', plateMarks: 3, plates: 1, desk: false },
  { id: 'chief', title: 'ЗАВЕДУЮЩИЙ СЕКТОРОМ', skin: 4, silhouette: 'desk', plateMarks: 4, plates: 2, desk: true },
  { id: 'courier', title: 'КУРЬЕР', skin: 70, silhouette: 'slim', plateMarks: 2, plates: 1, desk: false },
];

export const POSTS_BY_ID = new Map(POSTS.map((p) => [p.id, p]));

export const POST_INTERN = 'intern';
export const POST_INSPECTOR = 'inspector';
export const POST_REGISTRAR = 'registrar';
export const POST_AUDITOR = 'auditor';
export const POST_CHIEF = 'chief';
export const POST_COURIER = 'courier';
