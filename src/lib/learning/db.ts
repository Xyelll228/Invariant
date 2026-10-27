/**
 * База IndexedDB через Dexie (ТЗ, «Данные в браузере»). Хранилища и их ключи
 * описаны здесь; схема версионируется, каждая новая версия получает миграцию
 * и тест «старые данные → новая схема».
 */
import Dexie, { type DexieOptions, type Table } from 'dexie';
import { SCHEMA_VERSION } from './backup.ts';
import { DATA_STORES, type LearningData } from './merge.ts';
import type {
  AiChatRecord,
  AttemptRecord,
  CardRecord,
  ErrorRecord,
  ExamRecord,
  NoteRecord,
  ProgressRecord,
  ReviewRecord,
  SecretRecord,
  SettingRecord,
  UserCardRecord,
} from './types.ts';

/** Хранилища версии 1: первичный ключ первым, затем индексы. */
export const STORES_V1 = {
  settings: 'key',
  progress: '[topicId+level], topicId, updatedAt',
  cards: 'cardId, topicId, source',
  reviews: 'id, cardId, at',
  attempts: 'id, exerciseId, at',
  errors: 'id, cardId, at',
  notes: 'id, topicId, updatedAt',
  userCards: 'id, updatedAt',
  aiChats: 'id, topicId, updatedAt',
  secrets: 'provider',
  exams: 'id, at',
} as const;

export class LearningDatabase extends Dexie {
  settings!: Table<SettingRecord, string>;
  progress!: Table<ProgressRecord, [string, string]>;
  cards!: Table<CardRecord, string>;
  reviews!: Table<ReviewRecord, string>;
  attempts!: Table<AttemptRecord, string>;
  errors!: Table<ErrorRecord, string>;
  notes!: Table<NoteRecord, string>;
  userCards!: Table<UserCardRecord, string>;
  aiChats!: Table<AiChatRecord, string>;
  secrets!: Table<SecretRecord, string>;
  exams!: Table<ExamRecord, string>;

  constructor(name: string, options?: DexieOptions) {
    super(name, options);
    this.version(SCHEMA_VERSION).stores(STORES_V1);
  }
}

/** Все данные, кроме ключа API, — для копии в файл и объединения. */
export async function readAll(db: LearningDatabase): Promise<LearningData> {
  return db.transaction('r', DATA_STORES.map((store) => db.table(store)), async () => {
    const entries = await Promise.all(DATA_STORES.map(async (store) => [store, await db.table(store).toArray()] as const));
    return Object.fromEntries(entries) as unknown as LearningData;
  });
}

/**
 * Заменяет данные целиком (импорт «заменить» и запись результата
 * «объединить»). Ключ API не трогается: его в копии нет.
 */
export async function writeAll(db: LearningDatabase, data: LearningData): Promise<void> {
  await db.transaction('rw', DATA_STORES.map((store) => db.table(store)), async () => {
    for (const store of DATA_STORES) {
      const table = db.table(store);
      await table.clear();
      await table.bulkPut(data[store]);
    }
  });
}

/** Ответ и новое состояние карточки сохраняются вместе — или не сохраняются вовсе. */
export async function saveAnswer(db: LearningDatabase, card: CardRecord, review: ReviewRecord): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.reviews.put(review);
    await db.cards.put(card);
  });
}

export async function getSetting<T>(db: LearningDatabase, key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  return record === undefined ? fallback : (record.value as T);
}

export async function setSetting(db: LearningDatabase, key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
