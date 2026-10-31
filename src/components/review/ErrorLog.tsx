/**
 * Журнал ошибок (ТЗ, «Разбор ошибок и повторение», экран «Журнал ошибок»):
 * список ошибок с фильтрами по теме и заблуждению, «мои частые заблуждения»,
 * заметка «почему я ошибся» и отметка «разобрался». История не удаляется.
 */
import { useEffect, useId, useState } from 'preact/hooks';
import { describeErrors, filterErrors, frequentMisconceptions, prerequisiteSuggestions, type ErrorView } from '../../lib/learning/errors.ts';
import { formatMoment, plural } from '../../lib/learning/format.ts';
import { getDb, saveErrorNote, setErrorResolved } from '../../lib/learning/store.ts';
import { loadTopicsIndex } from '../../lib/learning/topics.ts';
import '../learn/learn.css';
import './review.css';

export interface ErrorLogProps {
  base: string;
}

function ErrorItem({ view, base, onChange }: { view: ErrorView; base: string; onChange: () => void }) {
  const [note, setNote] = useState(view.note);
  const [saved, setSaved] = useState(true);
  const noteId = useId();
  return (
    <li class={view.resolved ? 'error-log__item is-resolved' : 'error-log__item'}>
      <p class="error-log__meta">
        <span>{formatMoment(view.at)}</span>
        {view.topicPath ? <a href={`${base}${view.topicPath}`}>{view.topicTitle}</a> : <span>{view.topicTitle}</span>}
        {view.skillTitle && <span>{view.skillTitle}</span>}
        {view.resolved && <span class="badge">разобрался</span>}
      </p>
      <p>{view.misconception ? view.misconception.text : 'Ошибка без записанного заблуждения.'}</p>
      {view.misconception?.blockPath && (
        <p>
          <a href={`${base}${view.misconception.blockPath}`}>Где это объясняется</a>
        </p>
      )}
      <label for={noteId}>Почему я ошибся</label>
      <textarea
        id={noteId}
        rows={2}
        value={note}
        onInput={(event) => {
          setNote((event.target as HTMLTextAreaElement).value);
          setSaved(false);
        }}
      />
      <div class="question__actions">
        <button
          type="button"
          class="button"
          disabled={saved}
          onClick={() =>
            void saveErrorNote(view.id, note.trim()).then(() => {
              setSaved(true);
              onChange();
            })
          }
        >
          {saved && note.trim() !== '' ? 'Заметка сохранена' : 'Сохранить заметку'}
        </button>
        <button type="button" class="button" aria-pressed={view.resolved} onClick={() => void setErrorResolved(view.id, !view.resolved).then(onChange)}>
          Разобрался
        </button>
      </div>
    </li>
  );
}

export default function ErrorLog({ base }: ErrorLogProps) {
  const [views, setViews] = useState<ErrorView[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [misconceptionId, setMisconceptionId] = useState<string | null>(null);
  const [hideResolved, setHideResolved] = useState(false);
  const topicFilterName = useId();

  const reload = async () => {
    const db = getDb();
    const [errors, index, userCards] = await Promise.all([db.errors.toArray(), loadTopicsIndex(base), db.userCards.toArray()]);
    setViews(describeErrors(errors, index, userCards));
  };

  useEffect(() => {
    reload().catch(() => setFailure('Список тем не загрузился. Проверьте сеть и обновите страницу.'));
  }, [base]);

  if (failure) {
    return (
      <div class="error-log">
        <p role="alert">{failure}</p>
      </div>
    );
  }
  if (!views) {
    return (
      <div class="error-log">
        <p class="muted">Загружаю журнал…</p>
      </div>
    );
  }
  if (views.length === 0) {
    return (
      <div class="error-log">
        <p>
          Ошибок пока нет. Здесь будут ошибки из заданий тем и повторения — с заблуждением, которое за ними стоит, и вашими
          заметками.
        </p>
      </div>
    );
  }

  const frequent = frequentMisconceptions(views);
  const suggestions = prerequisiteSuggestions(views);
  const topics = [...new Map(views.map((view) => [view.topicId, view.topicTitle])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  const shown = filterErrors(views, { topicId, misconceptionId, hideResolved });
  const activeMisconception = frequent.find((item) => item.id === misconceptionId);

  return (
    <div class="error-log">
      {suggestions.map((suggestion) => (
        <div class="note" role="note">
          <p>
            {suggestion.count} {plural(suggestion.count, ['ошибка ведёт', 'ошибки ведут', 'ошибок ведут'])} к теме «{suggestion.title}». Стоит
            вернуться к ней: <a href={`${base}${suggestion.path}`}>«{suggestion.title}»</a>.
          </p>
        </div>
      ))}

      {frequent.length > 0 && (
        <section aria-labelledby="frequent-title">
          <h2 id="frequent-title">Мои частые заблуждения</h2>
          <ol class="error-log__frequent">
            {frequent.map((item) => (
              <li>
                <button type="button" class="link-button" aria-pressed={misconceptionId === item.id} onClick={() => setMisconceptionId(misconceptionId === item.id ? null : item.id)}>
                  {item.text}
                </button>{' '}
                <span class="muted">
                  — {item.count} {plural(item.count, ['раз', 'раза', 'раз'])}, {item.topicTitle}
                  {item.open === 0 ? ', разобрано' : ''}
                </span>
                {item.blockPath && (
                  <>
                    {' '}
                    · <a href={`${base}${item.blockPath}`}>где это объясняется</a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="all-errors-title">
        <h2 id="all-errors-title">Все ошибки</h2>
        <fieldset class="error-log__filter">
          <legend>Тема</legend>
          <label class="choice">
            <input type="radio" name={topicFilterName} checked={topicId === null} onChange={() => setTopicId(null)} />
            Все темы
          </label>
          {topics.map(([id, title]) => (
            <label class="choice">
              <input type="radio" name={topicFilterName} checked={topicId === id} onChange={() => setTopicId(id)} />
              {title}
            </label>
          ))}
        </fieldset>
        <label class="choice">
          <input type="checkbox" checked={hideResolved} onChange={(event) => setHideResolved((event.target as HTMLInputElement).checked)} />
          Скрыть разобранные
        </label>
        {activeMisconception && (
          <p>
            Только заблуждение «{activeMisconception.text}».{' '}
            <button type="button" class="link-button" onClick={() => setMisconceptionId(null)}>
              Показать все
            </button>
          </p>
        )}
        <p class="muted" role="status">
          Показано: {shown.length} из {views.length}.
        </p>
        <ul class="error-log__list">
          {shown.map((view) => (
            <ErrorItem key={view.id} view={view} base={base} onChange={() => void reload()} />
          ))}
        </ul>
      </section>
    </div>
  );
}
