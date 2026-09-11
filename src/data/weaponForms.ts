/**
 * Формы оружия. Это ДАННЫЕ: как форма называется и как выглядит её снаряд.
 * Числа — в src/tuning.ts, иначе до них не дотянется панель крутилок.
 *
 * Порядок массива задаёт порядок переключения колесом мыши.
 */
import type { Shape } from '../ecs';

export interface WeaponForm {
  /** Ключ группы в TUNING.weapon. */
  id: 'precise' | 'scatter' | 'lance' | 'volley';
  title: string;
  /** Короткая пометка для оверлея. */
  code: string;
  shape: Shape;
}

export const WEAPON_FORMS: WeaponForm[] = [
  { id: 'precise', title: 'ТОЧНАЯ ОДИНОЧНАЯ', code: 'ОД', shape: 'dot' },
  { id: 'scatter', title: 'ДРОБОВАЯ', code: 'ДР', shape: 'dot' },
  { id: 'lance', title: 'ЗАРЯДНАЯ ПРОБИВАЮЩАЯ', code: 'ЗР', shape: 'bar' },
  { id: 'volley', title: 'ЗАЛПОВАЯ С САМОНАВЕДЕНИЕМ', code: 'ЗЛ', shape: 'diamond' },
];
