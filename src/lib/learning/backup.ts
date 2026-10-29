/**
 * Копия прогресса в файл JSON (ТЗ, «Сохранность данных»): с версией схемы,
 * проверкой формата при импорте и миграцией старых копий. Ключ API в копию
 * не попадает. Копия из более новой версии приложения не импортируется.
 */
import { DATA_STORES, type LearningData } from './merge.ts';

export const BACKUP_FORMAT = 'invariant-backup';

/** Версия схемы данных. Растёт вместе с версией базы IndexedDB. */
export const SCHEMA_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  data: LearningData;
}

export function createBackup(data: LearningData, now: number): Backup {
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now, data };
}

export function serializeBackup(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** Имя файла копии: invariant-2026-10-24.json по местной дате. */
export function backupFileName(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `invariant-${date.getFullYear()}-${month}-${day}.json`;
}

/**
 * Миграции копий: функция переводит данные версии N в версию N + 1.
 * Каждая миграция покрывается тестом «старые данные → новая схема».
 */
export const BACKUP_MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export type ParseResult =
  | { ok: true; backup: Backup; migratedFrom: number | null }
  | { ok: false; message: string };

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === 'string';
const isNumber: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const isInteger: Check = (value) => Number.isInteger(value);
const isBoolean: Check = (value) => typeof value === 'boolean';
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value);
const oneOf =
  (...values: unknown[]): Check =>
  (value) =>
    values.includes(value);
const arrayOf =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const shape =
  (fields: Record<string, Check>): Check =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([name, check]) => check(value[name]));

const LEVEL = oneOf('fundament', 'base', 'depth');
const CONFIDENCE = oneOf('know', 'unsure', 'guess');

const FSRS_STATE = shape({
  due: isNumber,
  stability: isNumber,
  difficulty: isNumber,
  elapsed_days: isNumber,
  scheduled_days: isNumber,
  learning_steps: isInteger,
  reps: isInteger,
  lapses: isInteger,
  state: oneOf(0, 1, 2, 3),
  last_review: nullable(isNumber),
});

/** Обязательные поля каждой записи: по ним видно, что файл не повреждён. */
const RECORD_FIELDS: Record<keyof LearningData, Record<string, Check>> = {
  settings: { key: isString },
  progress: { topicId: isString, level: LEVEL, status: oneOf('not-started', 'in-progress', 'mastered'), completedSteps: arrayOf(isString), paused: isBoolean, updatedAt: isNumber },
  cards: {
    cardId: isString,
    topicId: isString,
    source: oneOf('content', 'user'),
    createdAt: isNumber,
    introducedAt: nullable(isNumber),
    followUps: isInteger,
    fsrs: FSRS_STATE,
    contentVersion: nullable(isInteger),
    changedAt: nullable(isNumber),
  },
  reviews: {
    id: isString,
    cardId: isString,
    at: isNumber,
    correct: isBoolean,
    confidence: CONFIDENCE,
    usedHint: isBoolean,
    tooEasy: isBoolean,
    rating: oneOf(1, 2, 3, 4),
    stateBefore: oneOf(0, 1, 2, 3),
    seed: nullable(isInteger),
    contentVersion: nullable(isInteger),
    misconception: nullable(isString),
    questionId: optional(isString),
    mode: oneOf('learn', 'check', 'delayed', 'review', 'exam'),
  },
  attempts: { id: isString, exerciseId: isString, language: oneOf('js', 'cpp', 'py', 'sql'), at: isNumber, code: isString, passed: isInteger, total: isInteger },
  errors: { id: isString, cardId: isString, misconception: nullable(isString), at: isNumber, note: isString, resolved: isBoolean, updatedAt: isNumber },
  notes: { id: isString, topicId: isString, blockId: isString, text: isString, updatedAt: isNumber, path: optional(isString), title: optional(isString) },
  userCards: {
    id: isString,
    question: isString,
    answer: isString,
    blockId: nullable(isString),
    updatedAt: isNumber,
    topicId: optional(isString),
    path: optional(isString),
    blockTitle: optional(isString),
  },
  aiChats: { id: isString, topicId: nullable(isString), messages: arrayOf(shape({ role: oneOf('user', 'assistant'), text: isString, at: isNumber })), updatedAt: isNumber },
  exams: { id: isString, at: isNumber, tasks: arrayOf(shape({ cardId: isString, seed: isInteger })), durationMs: isNumber },
};

const STORE_TITLES: Record<keyof LearningData, string> = {
  settings: 'настройки',
  progress: 'прогресс',
  cards: 'карточки',
  reviews: 'история ответов',
  attempts: 'попытки с кодом',
  errors: 'журнал ошибок',
  notes: 'заметки',
  userCards: 'свои карточки',
  aiChats: 'диалоги с наставником',
  exams: 'контрольные',
};

const NOT_A_BACKUP = 'Это не файл копии «Инварианта». Выберите файл, который сохранила кнопка «Сохранить копию в файл».';

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: NOT_A_BACKUP };
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, message: NOT_A_BACKUP };
  const { schemaVersion, exportedAt } = raw;
  if (!isInteger(schemaVersion) || (schemaVersion as number) < 1 || !isNumber(exportedAt) || !isObject(raw.data)) {
    return { ok: false, message: 'Файл копии повреждён: нет версии схемы, даты или данных.' };
  }
  let version = schemaVersion as number;
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Копия сделана в более новой версии приложения (схема ${version}, у вас ${SCHEMA_VERSION}). Сначала обновите приложение: закройте все его вкладки и откройте снова.`,
    };
  }
  const migratedFrom = version < SCHEMA_VERSION ? version : null;
  let data: Record<string, unknown> = raw.data;
  while (version < SCHEMA_VERSION) {
    const migrate = BACKUP_MIGRATIONS[version];
    if (!migrate) return { ok: false, message: `Не умею переводить копию со схемы ${version}: обратитесь к авторам проекта.` };
    data = migrate(data);
    version++;
  }

  const result: Record<string, unknown[]> = {};
  for (const store of DATA_STORES) {
    const records = data[store] ?? [];
    if (!Array.isArray(records)) return { ok: false, message: `Файл копии повреждён: раздел «${STORE_TITLES[store]}» — не список.` };
    const fields = RECORD_FIELDS[store];
    for (const [index, record] of records.entries()) {
      if (!isObject(record)) return { ok: false, message: `Файл копии повреждён: раздел «${STORE_TITLES[store]}», запись № ${index + 1}.` };
      const broken = Object.entries(fields).find(([name, check]) => !check(record[name]));
      if (broken) {
        return { ok: false, message: `Файл копии повреждён: раздел «${STORE_TITLES[store]}», запись № ${index + 1}, поле ${broken[0]}.` };
      }
    }
    result[store] = records;
  }
  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: exportedAt as number, data: result as unknown as LearningData },
    migratedFrom,
  };
}

/** Короткая сводка копии для подтверждения перед импортом. */
export function describeBackup(backup: Backup): { cards: number; reviews: number; exportedAt: number } {
  return { cards: backup.data.cards.length, reviews: backup.data.reviews.length, exportedAt: backup.exportedAt };
}
