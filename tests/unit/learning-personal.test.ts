import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { createBackup, parseBackup, serializeBackup } from '../../src/lib/learning/backup.ts';
import { readAll } from '../../src/lib/learning/db.ts';
import {
  createUserCard,
  deleteUserCard,
  noteId,
  personalSearchDocs,
  recordUserCardAnswer,
  saveNote,
  topicNotes,
  userCardsOfBlock,
} from '../../src/lib/learning/personal.ts';
import { getDb } from '../../src/lib/learning/store.ts';

afterEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((table) => table.clear()));
});

const TOPIC = 'algo.sorting.insertion';
const BLOCK = 'algo.sorting.insertion.b.idea';

describe('заметки', () => {
  it('одна заметка на блок и на тему; пустой текст удаляет заметку', async () => {
    expect(noteId(TOPIC, BLOCK)).toBe(`note:${BLOCK}`);
    expect(noteId(TOPIC, '')).toBe(`note:${TOPIC}`);
    await saveNote({ topicId: TOPIC, blockId: BLOCK, text: '  Карты в руке. ', path: 'ru/x/#b', title: 'Идея' });
    await saveNote({ topicId: TOPIC, blockId: BLOCK, text: 'Карты в руке — главный образ.', path: 'ru/x/#b', title: 'Идея' });
    await saveNote({ topicId: TOPIC, blockId: '', text: 'К теме', path: 'ru/x/', title: 'Сортировка вставками' });
    const notes = await topicNotes(TOPIC);
    expect(notes).toHaveLength(2);
    expect(notes.find((note) => note.blockId === BLOCK)?.text).toBe('Карты в руке — главный образ.');
    expect(await saveNote({ topicId: TOPIC, blockId: BLOCK, text: '   ', path: '', title: '' })).toBeNull();
    expect(await topicNotes(TOPIC)).toHaveLength(1);
  });
});

describe('свои карточки', () => {
  it('новая карточка — навык в повторении; неверный ответ — в журнал ошибок; удаление убирает расписание', async () => {
    const card = await createUserCard({ topicId: TOPIC, blockId: BLOCK, question: ' Какой образ? ', answer: 'Карты в руке', path: 'ru/x/#b', blockTitle: 'Идея' });
    expect(card.question).toBe('Какой образ?');
    const db = getDb();
    expect((await db.cards.get(card.id))?.fsrs.state).toBe(State.New);
    expect((await db.cards.get(card.id))?.source).toBe('user');
    expect(await userCardsOfBlock(BLOCK)).toHaveLength(1);

    const result = await recordUserCardAnswer({ card, correct: false, confidence: 'know' });
    expect(result.confidentError).toBe(true);
    expect(await db.errors.count()).toBe(1);
    expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: card.id, correct: false, mode: 'review', rating: 1 });
    expect((await db.cards.get(card.id))?.fsrs.state).not.toBe(State.New);

    await deleteUserCard(card.id);
    expect(await userCardsOfBlock(BLOCK)).toHaveLength(0);
    expect(await db.cards.get(card.id)).toBeUndefined();
    // История ответов остаётся.
    expect(await db.reviews.count()).toBe(1);
  });

  it('заметки и карточки ищутся поиском и входят в копию в файл', async () => {
    await saveNote({ topicId: TOPIC, blockId: BLOCK, text: 'Карты в руке', path: 'ru/x/#b', title: 'Идея' });
    await createUserCard({ topicId: TOPIC, blockId: BLOCK, question: 'Какой образ?', answer: 'Карты', path: 'ru/x/#b', blockTitle: 'Идея' });
    const docs = await personalSearchDocs();
    expect(docs.map((doc) => [doc.kind, doc.title, doc.url])).toEqual([
      ['note', 'Заметка: Идея', 'ru/x/#b'],
      ['note', 'Карточка: Какой образ?', 'ru/x/#b'],
    ]);
    const parsed = parseBackup(serializeBackup(createBackup(await readAll(getDb()), Date.now())));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.data.notes).toHaveLength(1);
      expect(parsed.backup.data.userCards[0]?.blockTitle).toBe('Идея');
    }
  });
});
