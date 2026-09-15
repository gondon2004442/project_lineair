/**
 * Должности: кто это и как читается с одного взгляда. Это ДАННЫЕ.
 *
 * Здесь только опознание — силуэт, заливка, табличка на груди.
 * Числа поведения (прочность, скорости, такты) живут в src/tuning.ts,
 * иначе до них не дотянется панель крутилок.
 *
 * Табличка плюс форма силуэта — вся система телеграфов. Туториал не нужен.
 */
export type PostFill = 'solid' | 'hollow';

export interface PostSpec {
  id: string;
  title: string;
  /** Заливка силуэта: контур читается как «ставка ещё не закрыта». */
  fill: PostFill;
  /** Насечек на табличке: 0 — пустая, дальше по старшинству. */
  plateMarks: number;
  /** Стол под сотрудником. Пока только у Регистратора. */
  desk: boolean;
}

export const POSTS: PostSpec[] = [
  { id: 'intern', title: 'СТАЖЁР', fill: 'hollow', plateMarks: 0, desk: false },
  { id: 'inspector', title: 'ИНСПЕКТОР', fill: 'solid', plateMarks: 1, desk: false },
  { id: 'registrar', title: 'РЕГИСТРАТОР', fill: 'solid', plateMarks: 2, desk: true },
  { id: 'auditor', title: 'РЕВИЗОР', fill: 'solid', plateMarks: 3, desk: false },
  { id: 'chief', title: 'ЗАВЕДУЮЩИЙ СЕКТОРОМ', fill: 'solid', plateMarks: 4, desk: true },
  // Полый силуэт с насечками — больше ни у кого: курьера видно сразу.
  { id: 'courier', title: 'КУРЬЕР', fill: 'hollow', plateMarks: 2, desk: false },
];

export const POSTS_BY_ID = new Map(POSTS.map((p) => [p.id, p]));

export const POST_INTERN = 'intern';
export const POST_INSPECTOR = 'inspector';
export const POST_REGISTRAR = 'registrar';
export const POST_AUDITOR = 'auditor';
export const POST_CHIEF = 'chief';
export const POST_COURIER = 'courier';
