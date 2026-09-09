/**
 * Штатные расписания участков. Это ДАННЫЕ, а не код.
 *
 * Помещение описывается не списком врагов, а тем, какие должности
 * на участке должны быть заняты. Генератор выбирает вакансии.
 *
 * ВНИМАНИЕ: реализована пока одна должность — 'inspector'.
 * Незанятые пока строки штата (регистратор, стажёр, ревизор, курьер,
 * заведующий) сюда не вписаны: данные не должны обещать того,
 * чего нет в поведении.
 */
export interface StaffPost {
  /** Идентификатор должности. Поведение ищется по нему. */
  post: string;
  title: string;
  /** Квота: сколько ставок должно быть занято. */
  count: number;
  /** Чем меньше число, тем раньше вакансию закрывают. */
  priority: number;
}

export interface Staffing {
  id: string;
  label: string;
  posts: StaffPost[];
}

export const STAFFING: Staffing[] = [
  {
    id: 'lobby',
    label: 'ВЕСТИБЮЛЬ. ШТАТ НЕ ПРЕДУСМОТРЕН',
    posts: [],
  },
  {
    id: 'patrol',
    label: 'ОБХОД УЧАСТКА',
    posts: [{ post: 'inspector', title: 'ИНСПЕКТОР', count: 3, priority: 2 }],
  },
  {
    id: 'registry',
    label: 'КАРТОТЕЧНЫЙ УЧАСТОК',
    posts: [{ post: 'inspector', title: 'ИНСПЕКТОР', count: 5, priority: 2 }],
  },
  {
    id: 'head_office',
    label: 'ПРИЁМНАЯ ЗАВЕДУЮЩЕГО',
    posts: [{ post: 'inspector', title: 'ИНСПЕКТОР', count: 8, priority: 2 }],
  },
];

export const STAFFING_BY_ID = new Map(STAFFING.map((s) => [s.id, s]));

export const STAFFING_LOBBY = 'lobby';
export const STAFFING_HEAD = 'head_office';
/** Расписания, которые генератор раздаёт рядовым помещениям. */
export const STAFFING_ORDINARY = ['patrol', 'registry'];
