/**
 * ЭТАЖИ. Это ДАННЫЕ.
 *
 * Здание глубже, чем кажется, и каждый уровень — своё место, а не та же
 * арена с другим числом здоровья. Этаж описывается тем, из чего он
 * собирается: пулом планировок, пулом расписаний, начальником внизу.
 *
 * Искажение у каждого этажа ровно одно (раздел 6.3 документа), но на
 * этом шаге их нет ни у кого: сначала просто глубина. Поле объявлено
 * пустым, чтобы искажения легли в готовое место, а не переписывали
 * интерфейс.
 */
export interface FloorSpec {
  /** −1, −2, ... Чем глубже, тем меньше число. */
  depth: number;
  /** Как уровень подписан на табло лифта. */
  code: string;
  title: string;
  /** Планировки, из которых собирается этаж. Пусто — все подряд. */
  templates: string[];
  /**
   * Насколько этаж злее первого. Множитель к числу ставок: генератор
   * читает его вместо TUNING.floor.staffScale.
   */
  staffScale: number;
  /** Ключ искажения. Пусто — этаж честный. */
  distortion: string;
}

export const FLOORS: FloorSpec[] = [
  {
    depth: -1,
    code: 'НИВО -1',
    title: 'УЧАСТОК',
    // Офис, в котором всё ещё работает: буфет, приёмная, переговоры.
    templates: ['hall', 'corridor', 'office', 'glass', 'atrium'],
    staffScale: 1,
    distortion: '',
  },
  {
    depth: -2,
    code: 'НИВО -2',
    title: 'АРХИВ',
    // Хранение и размножение бумаги: ряды, ящики, аппараты.
    templates: ['cabinets', 'copy', 'cubicles', 'corridor', 'atrium'],
    staffScale: 1.25,
    // Перестановка: стеллажи едут сами, а схема этажа врёт на один
    // участок, пока не найден план эвакуации.
    distortion: 'shuffle',
  },
];

export const FLOORS_BY_DEPTH = new Map(FLOORS.map((f) => [f.depth, f]));

/** Самый глубокий уровень из описанных. Ниже него забег кончается. */
export const DEEPEST = FLOORS.reduce((a, f) => Math.min(a, f.depth), 0);

/** Описание уровня. За пределами списка — первый: генератор не должен падать. */
export function floorAt(depth: number): FloorSpec {
  const spec = FLOORS_BY_DEPTH.get(depth) ?? FLOORS[0];
  if (spec === undefined) throw new Error('Нет ни одного описания этажа');
  return spec;
}
