/**
 * Физические объекты участка. Это ДАННЫЕ: что за предмет и как он выглядит.
 * Числа — в src/tuning.ts, иначе до них не дотянется панель крутилок.
 */
export interface PropSpec {
  id: string;
  title: string;
  /** Полый контур читается как «пустой», залитый — как «тяжёлый». */
  hollow: boolean;
  /** Сколько таких предметов раскидывать по обычному участку. */
  scatter: number;
}

export const PROPS: PropSpec[] = [
  { id: 'chair', title: 'СТУЛ', hollow: true, scatter: 5 },
  { id: 'cabinet', title: 'ШКАФ', hollow: false, scatter: 3 },
  { id: 'rubble', title: 'БЕТОННЫЙ ОБЛОМОК', hollow: false, scatter: 0 },
];

export const PROPS_BY_ID = new Map(PROPS.map((p) => [p.id, p]));

export const PROP_CHAIR = 'chair';
export const PROP_CABINET = 'cabinet';
export const PROP_RUBBLE = 'rubble';
