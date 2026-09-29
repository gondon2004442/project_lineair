/**
 * Физические объекты участка. Это ДАННЫЕ: что за предмет и как он выглядит.
 * Числа — в src/tuning.ts, иначе до них не дотянется панель крутилок.
 */
export interface PropSpec {
  id: string;
  title: string;
  /** Полый контур читается как «пустой», залитый — как «тяжёлый». */
  hollow: boolean;
  /**
   * Сколько таких предметов раскидывать, когда планировка не задала
   * слотов сама. Планировки со слотами этим числом не пользуются.
   */
  scatter: number;
  /**
   * Останавливает ли снаряды. Ложь — стойка с факсами: сквозь неё
   * стреляют, но из-за неё не видят.
   */
  stopsBullets?: boolean;
  /** Ломает линию взгляда: из-за него штат не стреляет. */
  blocksSight?: boolean;
  /**
   * Может ли встать на рельс. Архив переставляет стеллажи и короба, а
   * столы и стулья стоят: ездит хранение, а не рабочее место.
   */
  railed?: boolean;
  /** Даёт облако при ударе. */
  cloud?: boolean;
}

export const PROPS: PropSpec[] = [
  { id: 'chair', title: 'СТУЛ', hollow: true, scatter: 5 },
  { id: 'cabinet', title: 'ШКАФ', hollow: false, scatter: 3, railed: true },
  { id: 'rubble', title: 'БЕТОННЫЙ ОБЛОМОК', hollow: false, scatter: 0 },

  // --- Пять предметов с разной массой. Импульс считается как масса на
  // скорость, поэтому масса — это уже готовая ручка различия.
  { id: 'typewriter', title: 'ПЕЧАТНАЯ МАШИНКА', hollow: false, scatter: 0 },
  { id: 'cardbox', title: 'ЯЩИК КАРТОТЕКИ', hollow: false, scatter: 0, railed: true },
  { id: 'desk', title: 'СТОЛ', hollow: false, scatter: 0 },
  {
    id: 'faxstand',
    title: 'СТОЙКА С ФАКСАМИ',
    hollow: true,
    scatter: 0,
    stopsBullets: false,
    blocksSight: true,
  },
  { id: 'tank', title: 'ОГНЕТУШИТЕЛЬ', hollow: false, scatter: 0, cloud: true },
];

export const PROPS_BY_ID = new Map(PROPS.map((p) => [p.id, p]));

export const PROP_CHAIR = 'chair';
export const PROP_CABINET = 'cabinet';
export const PROP_RUBBLE = 'rubble';
export const PROP_FAXSTAND = 'faxstand';
export const PROP_CARDBOX = 'cardbox';
