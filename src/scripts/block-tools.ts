/**
 * Заметки и свои карточки на странице темы (ТЗ, «Справочник»). Кнопки у темы и
 * у блоков открывают окна из BlockTools.astro; сохранённые заметки
 * подставляются в места под них (NoteSlot.astro). Хранилище подключается
 * отложенно: страница сначала показывает текст темы.
 */
import type { NoteRecord, UserCardRecord } from '../lib/learning/types.ts';

type Personal = typeof import('../lib/learning/personal.ts');
let personalModule: Promise<Personal> | null = null;
const personal = (): Promise<Personal> => (personalModule ??= import('../lib/learning/personal.ts'));

const noteDialog = document.querySelector<HTMLDialogElement>('[data-note-dialog]');
const cardDialog = document.querySelector<HTMLDialogElement>('[data-card-dialog]');
const topicId = noteDialog?.dataset.topicId ?? '';

interface BlockContext {
  blockId: string;
  title: string;
  path: string;
}

const notes = new Map<string, NoteRecord>();

function slot(blockId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-note-for="${CSS.escape(blockId)}"]`);
}

function showNote(blockId: string, note: NoteRecord | null): void {
  const target = slot(blockId);
  if (!target) return;
  const text = target.querySelector<HTMLElement>('[data-note-text]');
  if (text) text.textContent = note?.text ?? '';
  target.hidden = note === null;
}

function contextOf(button: HTMLElement, attribute: 'blockNote' | 'blockCard'): BlockContext {
  return { blockId: button.dataset[attribute] ?? '', title: button.dataset.blockTitle ?? '', path: button.dataset.blockPath ?? '' };
}

// Сохранённые заметки — в места под них, когда браузер свободен.
function fillNotes(): void {
  if (!topicId) return;
  void personal()
    .then(({ topicNotes }) => topicNotes(topicId))
    .then((list) => {
      for (const note of list) {
        notes.set(note.blockId, note);
        showNote(note.blockId, note);
      }
    })
    .catch(() => {
      // Хранилище недоступно (например, запрещено настройками браузера) — заметок просто не видно.
    });
}
if ('requestIdleCallback' in window) window.requestIdleCallback(fillNotes, { timeout: 2000 });
else setTimeout(fillNotes, 300);

// ---------- Заметка ----------

if (noteDialog) {
  const where = noteDialog.querySelector<HTMLElement>('[data-note-where]');
  const input = noteDialog.querySelector<HTMLTextAreaElement>('[data-note-input]');
  const save = noteDialog.querySelector<HTMLButtonElement>('[data-note-save]');
  const remove = noteDialog.querySelector<HTMLButtonElement>('[data-note-delete]');
  const status = noteDialog.querySelector<HTMLElement>('[data-note-status]');
  let current: BlockContext | null = null;

  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-block-note]');
    if (!button) return;
    current = contextOf(button, 'blockNote');
    const existing = notes.get(current.blockId);
    if (where) where.textContent = current.blockId ? `Блок «${current.title}»` : `Тема «${current.title}»`;
    if (input) input.value = existing?.text ?? '';
    if (remove) remove.hidden = existing === undefined;
    if (status) status.textContent = '';
    noteDialog.showModal();
    input?.focus();
  });

  const write = async (text: string) => {
    if (!current) return;
    const context = current;
    try {
      const { saveNote } = await personal();
      const note = await saveNote({ topicId, blockId: context.blockId, text, path: context.path, title: context.title });
      if (note) notes.set(context.blockId, note);
      else notes.delete(context.blockId);
      showNote(context.blockId, note);
      noteDialog.close();
    } catch {
      if (status) status.textContent = 'Не получилось сохранить: браузер не дал доступ к хранилищу.';
    }
  };

  save?.addEventListener('click', () => void write(input?.value ?? ''));
  remove?.addEventListener('click', () => void write(''));
}

// ---------- Своя карточка ----------

if (cardDialog) {
  const where = cardDialog.querySelector<HTMLElement>('[data-card-where]');
  const question = cardDialog.querySelector<HTMLTextAreaElement>('[data-card-question]');
  const answer = cardDialog.querySelector<HTMLTextAreaElement>('[data-card-answer]');
  const save = cardDialog.querySelector<HTMLButtonElement>('[data-card-save]');
  const status = cardDialog.querySelector<HTMLElement>('[data-card-status]');
  const listWrap = cardDialog.querySelector<HTMLElement>('[data-card-list-wrap]');
  const list = cardDialog.querySelector<HTMLElement>('[data-card-list]');
  let current: BlockContext | null = null;
  let selected = '';

  // Выделение запоминается до нажатия: на телефоне касание кнопки может его снять.
  document.addEventListener('pointerdown', (event) => {
    if ((event.target as Element | null)?.closest('[data-block-card]')) selected = window.getSelection()?.toString() ?? '';
  });

  const renderList = (cards: UserCardRecord[]) => {
    if (!list || !listWrap) return;
    list.replaceChildren(
      ...cards.map((card) => {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = `${card.question} `;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block-tool';
        button.textContent = 'Удалить';
        button.setAttribute('aria-label', `Удалить карточку: ${card.question}`);
        button.addEventListener('click', () => {
          void personal().then(async ({ deleteUserCard, userCardsOfBlock }) => {
            await deleteUserCard(card.id);
            renderList(await userCardsOfBlock(current?.blockId ?? ''));
            if (status) status.textContent = 'Карточка удалена.';
          });
        });
        item.append(text, button);
        return item;
      }),
    );
    listWrap.hidden = cards.length === 0;
  };

  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-block-card]');
    if (!button) return;
    current = contextOf(button, 'blockCard');
    const text = (selected || window.getSelection()?.toString() || '').trim();
    selected = '';
    if (where) where.textContent = `Блок «${current.title}»`;
    if (question) question.value = '';
    if (answer) answer.value = text;
    if (status) status.textContent = '';
    renderList([]);
    cardDialog.showModal();
    question?.focus();
    const blockId = current.blockId;
    void personal()
      .then(({ userCardsOfBlock }) => userCardsOfBlock(blockId))
      .then(renderList)
      .catch(() => {});
  });

  save?.addEventListener('click', () => {
    if (!current) return;
    const context = current;
    const questionText = question?.value.trim() ?? '';
    const answerText = answer?.value.trim() ?? '';
    if (!questionText || !answerText) {
      if (status) status.textContent = 'Нужны и вопрос, и ответ.';
      (questionText ? answer : question)?.focus();
      return;
    }
    void personal()
      .then(async ({ createUserCard, userCardsOfBlock }) => {
        await createUserCard({ topicId, blockId: context.blockId, question: questionText, answer: answerText, path: context.path, blockTitle: context.title });
        if (question) question.value = '';
        if (answer) answer.value = '';
        if (status) status.textContent = 'Карточка сохранена. Она придёт в повторение — в пределах дневного лимита новых навыков.';
        renderList(await userCardsOfBlock(context.blockId));
      })
      .catch(() => {
        if (status) status.textContent = 'Не получилось сохранить: браузер не дал доступ к хранилищу.';
      });
  });
}
