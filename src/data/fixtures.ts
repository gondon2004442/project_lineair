/**
 * ОБОРУДОВАНИЕ. Это ДАННЫЕ.
 *
 * Кулер, фикус, вешалка, урна, тележка, пепельница. Это не мебель:
 * бросить их нельзя, спрятаться за них нельзя, в опись Ревизора они не
 * идут. Но и не декор: у них есть тело, и они создают тесноту, а
 * теснота и есть офис.
 *
 * Задел их на ходу — опрокинулись, и после них остаётся лужа, плащ,
 * земля или мусор. След лежит до конца участка: уходя, за собой не
 * убирают.
 *
 * Стоящее видно как мебель — иначе непонятно, почему оно не пускает.
 * Разлившееся ложится по правилу декора: темнее мебели, чтобы не
 * спорить с укрытиями.
 */
export interface FixtureSpec {
  id: string;
  title: string;
  /** Полсторона тела в пикселях. */
  radius: number;
  /** Цвет стоящего: на уровне мебели, раз оно не пускает. */
  color: string;
  /** Светлая деталь на стоящем. */
  detail?: string;
  /** Что остаётся на полу. Темнее мебели — это уже декор. */
  spill: string;
  /** Мелкие отметины поверх лужи: бумага, листья. */
  spillDetail?: string;
  /** Во сколько раз пятно шире тела. */
  spillSpread: number;
}

export const FIXTURES: FixtureSpec[] = [
  {
    id: 'cooler',
    title: 'КУЛЕР',
    radius: 10,
    color: 'furniture',
    detail: 'glass',
    spill: 'concrete700',
    spillSpread: 2.6,
  },
  {
    id: 'rack',
    title: 'ВЕШАЛКА С ПЛАЩАМИ',
    radius: 9,
    color: 'furniture',
    detail: 'fabric',
    spill: 'carpet',
    spillSpread: 2.2,
  },
  {
    id: 'ficus',
    title: 'ФИКУС В КАДКЕ',
    radius: 11,
    color: 'furniture',
    detail: 'leaf',
    spill: 'woodDark',
    spillDetail: 'leaf',
    spillSpread: 2.1,
  },
  {
    id: 'bin',
    title: 'УРНА',
    radius: 8,
    color: 'furniture',
    spill: 'worn',
    spillDetail: 'paper',
    spillSpread: 2.4,
  },
  {
    id: 'trolley',
    title: 'ТЕЛЕЖКА С ПАПКАМИ',
    radius: 12,
    color: 'furniture',
    detail: 'paper',
    spill: 'woodDark',
    spillDetail: 'paper',
    spillSpread: 2.8,
  },
  {
    /**
     * Не оборудование, а только след: рассыпанные карточки из разбитого
     * ящика картотеки. Тела у него нет, оно сразу лежит.
     */
    id: 'cards',
    title: 'РАССЫПАННЫЕ КАРТОЧКИ',
    radius: 12,
    color: 'furniture',
    spill: 'worn',
    spillDetail: 'paper',
    spillSpread: 2.6,
  },
  {
    id: 'ashtray',
    title: 'ПЕПЕЛЬНИЦА НА НОЖКЕ',
    radius: 7,
    color: 'furniture',
    detail: 'enamel',
    spill: 'concrete700',
    spillSpread: 1.9,
  },
];

export const FIXTURES_BY_ID = new Map(FIXTURES.map((f) => [f.id, f]));
