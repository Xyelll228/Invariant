import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, SCHEMA_VERSION, backupFileName, createBackup, parseBackup, serializeBackup } from '../../src/lib/learning/backup.ts';
import { LearningDatabase, readAll, saveAnswer, writeAll } from '../../src/lib/learning/db.ts';
import { ratingFor } from '../../src/lib/learning/grading.ts';
import { emptyData, mergeData } from '../../src/lib/learning/merge.ts';
import { applyReview, createScheduler, newCard } from '../../src/lib/learning/scheduler.ts';
import type { ReviewRecord } from '../../src/lib/learning/types.ts';

const scheduler = createScheduler();
const T0 = Date.UTC(2026, 9, 24, 8, 0);
const databases: LearningDatabase[] = [];

function open(name: string): LearningDatabase {
  const db = new LearningDatabase(name);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) {
    db.close();
    await db.delete();
  }
});

/** Один ответ «верно, знаю» по новой карточке — как в приложении. */
async function answerOnce(db: LearningDatabase, id: string, at: number): Promise<void> {
  const card = (await db.cards.get('skill')) ?? newCard({ cardId: 'skill', topicId: 'topic', source: 'content', createdAt: T0 });
  const input = {
    id,
    cardId: 'skill',
    at,
    correct: true,
    confidence: 'know' as const,
    usedHint: false,
    tooEasy: false,
    rating: ratingFor({ correct: true, confidence: 'know', usedHint: false }),
    seed: 7,
    contentVersion: 1,
    misconception: null,
    mode: 'review' as const,
  };
  const result = applyReview(card, input, scheduler);
  await saveAnswer(db, result.card, { ...input, stateBefore: result.stateBefore });
}

describe('копия в файл', () => {
  it('сохраняет и восстанавливает данные без потерь', async () => {
    const source = open('source');
    await answerOnce(source, 'r1', T0);
    await answerOnce(source, 'r2', T0 + 10 * 60_000);
    await source.settings.put({ key: 'retention', value: 0.9 });
    await source.notes.put({ id: 'n1', topicId: 'topic', blockId: 'block', text: 'заметка', updatedAt: T0 });

    const text = serializeBackup(createBackup(await readAll(source), T0 + 3_600_000));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migratedFrom).toBeNull();

    const target = open('target');
    await writeAll(target, parsed.backup.data);
    expect(await readAll(target)).toEqual(await readAll(source));
  });

  it('ключ API не попадает в копию и не стирается при восстановлении', async () => {
    const db = open('secret');
    await db.secrets.put({ provider: 'anthropic', key: 'секретный-ключ', savedAt: T0 });
    await answerOnce(db, 'r1', T0);
    const text = serializeBackup(createBackup(await readAll(db), T0));
    expect(text).not.toContain('секретный-ключ');
    expect(text).not.toContain('secrets');

    await writeAll(db, emptyData());
    expect(await db.secrets.get('anthropic')).toEqual({ provider: 'anthropic', key: 'секретный-ключ', savedAt: T0 });
    expect(await db.cards.count()).toBe(0);
  });

  it('«объединить» с копией другого устройства складывает истории', async () => {
    const laptop = open('laptop');
    const phone = open('phone');
    await answerOnce(laptop, 'laptop-1', T0);
    await answerOnce(phone, 'phone-1', T0 + 30 * 60_000);
    const parsed = parseBackup(serializeBackup(createBackup(await readAll(phone), T0 + 3_600_000)));
    if (!parsed.ok) throw new Error(parsed.message);

    await writeAll(laptop, mergeData(await readAll(laptop), parsed.backup.data, scheduler));
    const reviews: ReviewRecord[] = await laptop.reviews.orderBy('at').toArray();
    expect(reviews.map((review) => review.id)).toEqual(['laptop-1', 'phone-1']);
    const card = await laptop.cards.get('skill');
    expect(card?.fsrs.reps).toBe(2);
  });

  it('имя файла — по местной дате', () => {
    expect(backupFileName(new Date(2026, 9, 24, 23, 10).getTime())).toBe('invariant-2026-10-24.json');
  });
});

describe('проверка файла копии', () => {
  const valid = () => createBackup(emptyData(), T0);

  it('не JSON или чужой файл — понятное сообщение', () => {
    for (const text of ['не json', '{"format":"other"}', '[]', 'null']) {
      const result = parseBackup(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('Это не файл копии «Инварианта»');
    }
  });

  it('копия из более новой версии приложения не импортируется', () => {
    const result = parseBackup(JSON.stringify({ ...valid(), schemaVersion: SCHEMA_VERSION + 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Сначала обновите приложение');
  });

  it('повреждённая запись — с указанием раздела, номера и поля', () => {
    const backup = valid();
    const broken = { ...backup, data: { ...backup.data, reviews: [{ id: 'r1', cardId: 'skill', at: 'вчера' }] } };
    const result = parseBackup(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Файл копии повреждён: раздел «история ответов», запись № 1, поле at.');
  });

  it('нет версии схемы или данных', () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, exportedAt: T0 }));
    expect(result.ok).toBe(false);
  });

  it('пустой раздел можно не указывать', () => {
    const { data, ...rest } = valid();
    const { exams: _exams, ...withoutExams } = data;
    const result = parseBackup(JSON.stringify({ ...rest, data: withoutExams }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.data.exams).toEqual([]);
  });
});
