/**
 * Распоряжения. Это ДАННЫЕ.
 *
 * Распоряжение — то, что контора выпускает САМА, когда в личном деле
 * сошлись определённые приложения. Игрок его не находит и не выбирает:
 * оно просто появляется в деле с номером и формулировкой, как и положено
 * распоряжению.
 *
 * `requires` — список групп. Внутри группы достаточно ОДНОГО приложения,
 * но нужна хотя бы одна позиция из каждой группы. Так распоряжения
 * реально собираются: иначе пришлось бы ждать точную пару из десяти.
 */
import type { ItemMod } from './items';

export interface Directive {
  id: string;
  /** Номер распоряжения. По нему оно и опознаётся. */
  number: string;
  title: string;
  /** Группы приложений: внутри группы достаточно одного. */
  requires: string[][];
  /** Формулировка распоряжения, строки выводятся как есть. */
  text: string[];
  mods: ItemMod[];
}

export const DIRECTIVES: Directive[] = [
  {
    id: 'measure',
    number: 'РАСПОРЯЖЕНИЕ 14-Б',
    title: 'О ЕДИНОМ ПОРЯДКЕ ЗАМЕРА',
    requires: [['clip', 'tape'], ['press', 'seal']],
    text: [
      'В связи с наличием в деле приложений по замеру и подшивке',
      'сотруднику надлежит вести огонь одиночной и дробовой формой',
      'в едином порядке, без раздельного учёта.',
      'ДЕЙСТВИЕ: одиночная бьёт чаще, дробовая перезаряжается быстрее.',
    ],
    mods: [
      { path: 'weapon.precise.interval', mul: 0.85 },
      { path: 'weapon.scatter.reloadTime', mul: 0.8 },
    ],
  },
  {
    id: 'through',
    number: 'РАСПОРЯЖЕНИЕ 21-А',
    title: 'О СКВОЗНОМ СПИСАНИИ',
    requires: [['stamp'], ['writeoff']],
    text: [
      'В связи с наличием в деле приложений о сквозной отметке',
      'и о списании сотруднику надлежит считать списанным всё,',
      'что оказалось на одной линии с отмеченным.',
      'ДЕЙСТВИЕ: заряженный выстрел бьёт сильнее и пробивает больше тел.',
    ],
    mods: [
      { path: 'weapon.lance.damageCharged', mul: 1.3 },
      { path: 'weapon.lance.pierce', add: 2 },
    ],
  },
  {
    id: 'duplicate',
    number: 'РАСПОРЯЖЕНИЕ 33-В',
    title: 'О ВСТРЕЧНОМ ЭКЗЕМПЛЯРЕ',
    requires: [['index', 'carbon'], ['facsimile']],
    text: [
      'В связи с наличием в деле приложений о копии и о заверении',
      'сотруднику надлежит направлять встречный экземпляр',
      'по адресу получателя самостоятельно.',
      'ДЕЙСТВИЕ: залп доворачивает увереннее, обойма формы больше.',
    ],
    mods: [
      { path: 'weapon.volley.homingDeg', mul: 1.3 },
      { path: 'weapon.volley.ammoMax', add: 4 },
    ],
  },
  {
    id: 'shortened',
    number: 'РАСПОРЯЖЕНИЕ 7-Г',
    title: 'О СОКРАЩЁННОЙ ПРОЦЕДУРЕ',
    requires: [['regulation'], ['facsimile', 'clip']],
    text: [
      'В связи с наличием в деле сокращённого регламента',
      'сотруднику надлежит выполнять процедуру перезарядки',
      'в сокращённом виде по всем формам без исключения.',
      'ДЕЙСТВИЕ: перезарядка короче, в обойму помещается больше.',
    ],
    mods: [
      { path: 'weapon.precise.reloadTime', mul: 0.85 },
      { path: 'weapon.scatter.reloadTime', mul: 0.85 },
      { path: 'weapon.lance.reloadTime', mul: 0.85 },
      { path: 'weapon.volley.reloadTime', mul: 0.85 },
      { path: 'weapon.precise.ammoMax', add: 2 },
      { path: 'weapon.scatter.ammoMax', add: 2 },
      { path: 'weapon.lance.ammoMax', add: 2 },
      { path: 'weapon.volley.ammoMax', add: 2 },
    ],
  },
];

export const DIRECTIVES_BY_ID = new Map(DIRECTIVES.map((d) => [d.id, d]));

/** Выпущено ли распоряжение при таком составе личного дела. */
export function directiveIssued(directive: Directive, build: readonly string[]): boolean {
  return directive.requires.every((group) => group.some((id) => build.includes(id)));
}

/** Все распоряжения, выпущенные по текущему делу. */
export function issuedDirectives(build: readonly string[]): Directive[] {
  return DIRECTIVES.filter((d) => directiveIssued(d, build));
}
