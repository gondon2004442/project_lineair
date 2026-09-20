/**
 * АРХИВ. Дела предыдущих экземпляров субъекта.
 *
 * Каждая смерть — не смерть, а отзыв допуска: наверху заводят новое дело,
 * а старое уходит в архив. Архив лежит в localStorage, потому что он и
 * должен переживать забег — в этом вся его мысль.
 *
 * Симуляция про архив не знает: она только помечает, что забег кончился
 * и что найдено дело. Читает и пишет точка входа, как и со звуком.
 */
import { TUNING } from './tuning';

export interface CaseFile {
  /** Seed того забега: по нему его можно повторить. */
  seed: number;
  /** До какого участка дошёл и сколько их было. */
  room: number;
  rooms: number;
  /** Чем кончилось. */
  reason: 'отзыв допуска' | 'сектор сдан';
  /** Что успело попасть в дело. */
  attachments: number;
  commendations: number;
}

const KEY = 'lineair.archive';

/** Прочитать архив. Недоступное хранилище — просто пустой архив. */
export function readArchive(): CaseFile[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCase);
  } catch {
    return [];
  }
}

/** Подшить дело в архив. Старые вытесняются: полка не резиновая. */
export function fileCase(entry: CaseFile): void {
  try {
    const all = [entry, ...readArchive()].slice(0, Math.max(1, Math.round(TUNING.archive.keep)));
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Хранилище недоступно — забег просто не оставит следа.
  }
}

/** Служебная записка по делу: то, что субъект читает, когда его находит. */
export function caseNote(entry: CaseFile): string[] {
  return [
    `ДЕЛО ПРЕДЫДУЩЕГО ЭКЗЕМПЛЯРА. SEED ${formatSeedNumber(entry.seed)}`,
    `ПРОДВИЖЕНИЕ: УЧАСТОК ${entry.room + 1} ИЗ ${entry.rooms}.`,
    `ПРИЧИНА ЗАКРЫТИЯ: ${entry.reason.toUpperCase()}.`,
    `В ДЕЛЕ: ПРИЛОЖЕНИЙ ${entry.attachments}, БЛАГОДАРНОСТЕЙ ${entry.commendations}.`,
    'ДЕЛО ПОДЛЕЖИТ ХРАНЕНИЮ. СУБЪЕКТ ПЕРЕОФОРМЛЕН.',
  ];
}

function isCase(value: unknown): value is CaseFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['seed'] === 'number' &&
    typeof v['room'] === 'number' &&
    typeof v['rooms'] === 'number' &&
    typeof v['attachments'] === 'number' &&
    typeof v['commendations'] === 'number' &&
    (v['reason'] === 'отзыв допуска' || v['reason'] === 'сектор сдан')
  );
}

function formatSeedNumber(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
