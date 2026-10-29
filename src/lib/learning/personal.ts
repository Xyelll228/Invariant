/**
 * Заметки и свои карточки (ТЗ, «Справочник»: «Заметки и свои карточки»).
 * Заметка — к теме или к блоку, одна на тему или блок. Своя карточка —
 * вопрос и ответ, которые пишет сам человек; она идёт в повторение наравне
 * с навыками и ведёт к блоку, из которого сделана. Всё хранится только в
 * браузере, входит в копию в файл и ищется поиском.
 */
import type { SearchDoc } from '../search/engine.ts';
import { databaseName } from '../site.ts';
import { setProgressFlag } from './flag.ts';
import { isConfidentError, ratingFor } from './grading.ts';
import { applyReview, createScheduler, newCard } from './scheduler.ts';
import { loadSettings } from './settings.ts';
import { getDb, randomId } from './store.ts';
import type { Confidence, ErrorRecord, NoteRecord, UserCardRecord } from './types.ts';

/** id заметки постоянный: заметки с двух устройств объединяются по нему. */
export function noteId(topicId: string, blockId: string): string {
  return `note:${blockId || topicId}`;
}

export async function topicNotes(topicId: string): Promise<NoteRecord[]> {
  return getDb().notes.where('topicId').equals(topicId).toArray();
}

export interface NoteInput {
  topicId: string;
  /** Пустая строка — заметка ко всей теме. */
  blockId: string;
  text: string;
  path: string;
  title: string;
}

/** Сохраняет заметку; пустой текст удаляет её. Возвращает сохранённую заметку или null. */
export async function saveNote(input: NoteInput): Promise<NoteRecord | null> {
  const db = getDb();
  const id = noteId(input.topicId, input.blockId);
  const text = input.text.trim();
  if (text === '') {
    await db.notes.delete(id);
    return null;
  }
  const record: NoteRecord = { id, topicId: input.topicId, blockId: input.blockId, text, updatedAt: Date.now(), path: input.path, title: input.title };
  await db.notes.put(record);
  return record;
}

export interface UserCardInput {
  topicId: string;
  blockId: string;
  question: string;
  answer: string;
  path: string;
  blockTitle: string;
}

/** Новая своя карточка: она придёт в повторение как новый навык, в пределах дневного лимита. */
export async function createUserCard(input: UserCardInput): Promise<UserCardRecord> {
  const db = getDb();
  const now = Date.now();
  const record: UserCardRecord = {
    id: `user.${randomId()}`,
    question: input.question.trim(),
    answer: input.answer.trim(),
    blockId: input.blockId || null,
    updatedAt: now,
    topicId: input.topicId,
    path: input.path,
    blockTitle: input.blockTitle,
  };
  await db.transaction('rw', [db.userCards, db.cards], async () => {
    await db.userCards.put(record);
    await db.cards.put(newCard({ cardId: record.id, topicId: input.topicId, source: 'user', createdAt: now }));
  });
  setProgressFlag(databaseName);
  return record;
}

export async function userCardsOfBlock(blockId: string): Promise<UserCardRecord[]> {
  return (await getDb().userCards.toArray()).filter((card) => card.blockId === blockId).sort((a, b) => a.updatedAt - b.updatedAt);
}

/** Удаляет свою карточку и её расписание. История ответов остаётся. */
export async function deleteUserCard(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.userCards, db.cards], async () => {
    await db.userCards.delete(id);
    await db.cards.delete(id);
  });
}

/**
 * Ответ на свою карточку в повторении: оценка по тем же правилам, что у
 * навыков (результат и уверенность), неверный ответ — в журнал ошибок.
 */
export async function recordUserCardAnswer({
  card,
  correct,
  confidence,
}: {
  card: UserCardRecord;
  correct: boolean;
  confidence: Confidence;
}): Promise<{ confidentError: boolean }> {
  const db = getDb();
  const now = Date.now();
  const settings = await loadSettings(db);
  const answer = { correct, confidence, usedHint: false };
  await db.transaction('rw', [db.cards, db.reviews, db.errors], async () => {
    const existing = await db.cards.get(card.id);
    const current = existing ?? newCard({ cardId: card.id, topicId: card.topicId ?? '', source: 'user', createdAt: now });
    const review = {
      id: randomId(),
      cardId: card.id,
      at: now,
      correct,
      confidence,
      usedHint: false,
      tooEasy: false,
      rating: ratingFor(answer),
      seed: null,
      contentVersion: null,
      misconception: null,
      mode: 'review' as const,
    };
    const applied = applyReview(current, review, createScheduler(settings.retention));
    await db.reviews.put({ ...review, stateBefore: applied.stateBefore });
    await db.cards.put(applied.card);
    if (!correct) {
      const error: ErrorRecord = { id: randomId(), cardId: card.id, misconception: null, at: now, note: '', resolved: false, updatedAt: now };
      await db.errors.put(error);
    }
  });
  setProgressFlag(databaseName);
  return { confidentError: isConfidentError(answer) };
}

/** Заметки и свои карточки для поиска (ТЗ: «ищутся поиском»). Индекс по ним строится в браузере. */
export async function personalSearchDocs(): Promise<SearchDoc[]> {
  const db = getDb();
  const [notes, cards] = await Promise.all([db.notes.toArray(), db.userCards.toArray()]);
  const snippet = (text: string) => (text.length > 100 ? `${text.slice(0, 99)}…` : text);
  return [
    ...notes.map((note) => ({
      id: note.id,
      kind: 'note' as const,
      title: note.title ? `Заметка: ${note.title}` : 'Заметка',
      context: snippet(note.text),
      text: note.text,
      url: note.path ?? null,
    })),
    ...cards.map((card) => ({
      id: card.id,
      kind: 'note' as const,
      title: `Карточка: ${card.question}`,
      context: card.blockTitle ? `из блока «${card.blockTitle}»` : 'своя карточка',
      text: `${card.question} ${card.answer}`,
      url: card.path ?? null,
    })),
  ];
}
