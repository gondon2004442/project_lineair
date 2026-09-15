/**
 * Звуки. Это ДАННЫЕ: рецепт синтеза, а не файл.
 *
 * Ни одного ассета: всё собирается из осциллятора и шума прямо в браузере.
 * Так звук держится той же линии, что и картинка — сухая канцелярия,
 * щелчки и удары, ничего оркестрового.
 */
export interface SoundRecipe {
  /** Тон или шум. */
  source: 'tone' | 'noise';
  /** Начальная и конечная частота. Конечная задаёт подъём или спад. */
  freq: number;
  freqEnd?: number;
  /** Длительность в секундах. */
  duration: number;
  /** Громкость относительно общей. */
  gain: number;
  /** Форма волны для тона. */
  wave?: OscillatorType;
  /** Срез фильтра для шума. */
  cutoff?: number;
  /** Доля длительности, уходящая на атаку. */
  attack?: number;
}

export const SOUNDS: Record<string, SoundRecipe> = {
  // --- Оружие субъекта ---
  'shot.precise': { source: 'tone', freq: 780, freqEnd: 240, duration: 0.07, gain: 0.35, wave: 'square' },
  'shot.scatter': { source: 'noise', freq: 0, duration: 0.16, gain: 0.5, cutoff: 2400 },
  'shot.lance': { source: 'tone', freq: 160, freqEnd: 1100, duration: 0.22, gain: 0.5, wave: 'sawtooth' },
  'shot.volley': { source: 'tone', freq: 520, freqEnd: 760, duration: 0.09, gain: 0.28, wave: 'triangle' },
  reload: { source: 'noise', freq: 0, duration: 0.1, gain: 0.3, cutoff: 1200 },
  dash: { source: 'noise', freq: 0, duration: 0.14, gain: 0.34, cutoff: 900 },

  // --- Попадания ---
  'hit.staff': { source: 'tone', freq: 320, freqEnd: 180, duration: 0.05, gain: 0.3, wave: 'square' },
  'kill.staff': { source: 'tone', freq: 220, freqEnd: 70, duration: 0.2, gain: 0.45, wave: 'sawtooth' },
  'hurt.player': { source: 'tone', freq: 120, freqEnd: 55, duration: 0.3, gain: 0.6, wave: 'sawtooth' },

  // --- Объект ---
  /** Метроном участка. По документу инспектора «слышно». */
  beat: { source: 'tone', freq: 1180, duration: 0.035, gain: 0.22, wave: 'square' },
  fan: { source: 'noise', freq: 0, duration: 0.2, gain: 0.32, cutoff: 3200 },
  ring: { source: 'tone', freq: 90, freqEnd: 300, duration: 0.35, gain: 0.5, wave: 'square' },
  'door.unlock': { source: 'tone', freq: 300, freqEnd: 620, duration: 0.3, gain: 0.4, wave: 'triangle' },

  // --- Телекинез и обстановка ---
  grab: { source: 'tone', freq: 300, freqEnd: 520, duration: 0.14, gain: 0.26, wave: 'sine' },
  throw: { source: 'tone', freq: 520, freqEnd: 130, duration: 0.16, gain: 0.34, wave: 'triangle' },
  impact: { source: 'noise', freq: 0, duration: 0.13, gain: 0.5, cutoff: 700 },
  glass: { source: 'noise', freq: 0, duration: 0.26, gain: 0.45, cutoff: 6000 },

  /** Шаг в проём: забег начался. */
  gate: { source: 'tone', freq: 70, freqEnd: 40, duration: 0.7, gain: 0.55, wave: 'sine', attack: 0.3 },
};
