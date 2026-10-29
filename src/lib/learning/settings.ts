/**
 * Настройки обучения (ТЗ, «Настройки»). Значения по умолчанию меняются только
 * с согласия владельца: порог «освоено» 80%, лимиты 10 новых и 100 повторений
 * за учебный день, учебный день с 4:00, уровень запоминания 0,90.
 */
import { DEFAULT_DAY_START_HOUR } from './day.ts';
import { getSetting, type LearningDatabase } from './db.ts';
import { DEFAULT_MASTERY_THRESHOLD } from './progress.ts';
import { DEFAULT_LIMITS } from './queue.ts';
import { DEFAULT_RETENTION } from './scheduler.ts';

export interface LearningSettings {
  /** Желаемый уровень запоминания FSRS: от 0,80 до 0,95. */
  retention: number;
  /** Час начала учебного дня по местному времени. */
  dayStartHour: number;
  newPerDay: number;
  reviewsPerDay: number;
  /** Доля верных ответов, с которой проверка пройдена. */
  masteryThreshold: number;
}

export const DEFAULT_SETTINGS: LearningSettings = {
  retention: DEFAULT_RETENTION,
  dayStartHour: DEFAULT_DAY_START_HOUR,
  newPerDay: DEFAULT_LIMITS.newPerDay,
  reviewsPerDay: DEFAULT_LIMITS.reviewsPerDay,
  masteryThreshold: DEFAULT_MASTERY_THRESHOLD,
};

/** Ключи настроек в хранилище settings. */
export const SETTING_KEYS: Record<keyof LearningSettings, string> = {
  retention: 'retention',
  dayStartHour: 'dayStartHour',
  newPerDay: 'newPerDay',
  reviewsPerDay: 'reviewsPerDay',
  masteryThreshold: 'masteryThreshold',
};

export async function loadSettings(db: LearningDatabase): Promise<LearningSettings> {
  const entries = await Promise.all(
    (Object.keys(SETTING_KEYS) as (keyof LearningSettings)[]).map(async (key) => [key, await getSetting(db, SETTING_KEYS[key], DEFAULT_SETTINGS[key])] as const),
  );
  return Object.fromEntries(entries) as unknown as LearningSettings;
}
