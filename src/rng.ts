/**
 * Единственный источник случайности симуляции.
 * Один seed = один и тот же забег. Ни Math.random в системах, ни Date.now.
 */
export interface Rng {
  /** [0, 1) */
  float(): number;
  /** [min, max) */
  range(min: number, max: number): number;
  /** Целое [0, n) */
  int(n: number): number;
  /** Радианы [0, 2PI) */
  angle(): number;
  /** Симметрично: [-amount, +amount] */
  spread(amount: number): number;
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const float = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    range: (min, max) => min + float() * (max - min),
    int: (n) => Math.floor(float() * n),
    angle: () => float() * Math.PI * 2,
    spread: (amount) => (float() * 2 - 1) * amount,
  };
}

/** Seed из адресной строки (?seed=...), иначе новый случайный. */
export function resolveSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Печатное представление seed — восемь шестнадцатеричных знаков. */
export function formatSeed(seed: number): string {
  return seed.toString(16).toUpperCase().padStart(8, '0');
}
