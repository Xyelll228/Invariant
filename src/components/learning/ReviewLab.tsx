/**
 * Прототип хранилища и повторения: карточка навыка в IndexedDB, оценка ответа
 * по правилам ТЗ, расписание FSRS, план учебного дня, копия в файл и
 * восстановление («заменить» или «объединить»), постоянное хранилище.
 *
 * Прототип пишет в отдельную базу, поэтому его данные не смешаются с
 * настоящим прогрессом. Часы прототипа можно перемотать вперёд, чтобы увидеть
 * расписание, не дожидаясь его.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { State } from 'ts-fsrs';
import { createRandom } from '../../lib/random.ts';
import { choiceGenerators, type ChoiceGeneratorId } from '../../lib/questions/generators.ts';
import { backupFileName, createBackup, describeBackup, parseBackup, serializeBackup, type Backup } from '../../lib/learning/backup.ts';
import { LearningDatabase, getSetting, readAll, saveAnswer, setSetting, writeAll } from '../../lib/learning/db.ts';
import { DEFAULT_DAY_START_HOUR } from '../../lib/learning/day.ts';
import { formatDuration, formatFullMoment, formatMoment, formatPercent, STATE_NAMES } from '../../lib/learning/format.ts';
import { canBeTooEasy, isConfidentError, ratingFor, RATING_NAMES } from '../../lib/learning/grading.ts';
import { emptyData, mergeData } from '../../lib/learning/merge.ts';
import { PERSISTENCE_TEXT, persistenceStatus, requestPersistence, type PersistenceStatus } from '../../lib/learning/persistence.ts';
import { DEFAULT_LIMITS, planDay } from '../../lib/learning/queue.ts';
import { applyReview, createScheduler, DEFAULT_RETENTION, newCard, replayCard, retrievability } from '../../lib/learning/scheduler.ts';
import type { CardRecord, Confidence, ReviewRecord } from '../../lib/learning/types.ts';
import '../viz/viz.css';
import './review-lab.css';

export interface ReviewLabProps {
  databaseName: string;
  skill: { cardId: string; topicId: string; title: string; contentVersion: number };
  question: ChoiceGeneratorId;
  misconceptions: Record<string, { text: string; explanation: string }>;
  hint: string;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: 'know', label: 'знаю' },
  { value: 'unsure', label: 'сомневаюсь' },
  { value: 'guess', label: 'наугад' },
];
const CONFIDENCE_NAMES: Record<Confidence, string> = { know: 'знаю', unsure: 'сомневаюсь', guess: 'наугад' };

const CLOCK_STEPS = [
  { label: '+10 минут', ms: 10 * MINUTE },
  { label: '+1 день', ms: DAY },
  { label: '+1 неделя', ms: 7 * DAY },
];

interface Outcome {
  review: ReviewRecord;
  card: CardRecord;
  correctText: string;
}

interface PendingImport {
  backup: Backup;
  fileName: string;
  migratedFrom: number | null;
}

function randomId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** «через 10 минут (25 октября, 23:20)» или «уже пора». */
function describeDue(due: number, now: number): string {
  if (due <= now) return 'уже пора';
  return `через ${formatDuration(due - now)} (${formatMoment(due)})`;
}

export default function ReviewLab({ databaseName, skill, question, misconceptions, hint }: ReviewLabProps) {
  const dbRef = useRef<LearningDatabase | null>(null);
  const scheduler = useMemo(() => createScheduler(DEFAULT_RETENTION), []);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(() => Date.now());

  const [seed, setSeed] = useState<number | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [usedHint, setUsedHint] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const now = tick + offset;

  async function reload(db: LearningDatabase): Promise<void> {
    let card = await db.cards.get(skill.cardId);
    if (!card) {
      card = newCard({ cardId: skill.cardId, topicId: skill.topicId, source: 'content', createdAt: Date.now(), contentVersion: skill.contentVersion });
      await db.cards.put(card);
    }
    const [allCards, allReviews, last] = await Promise.all([
      db.cards.toArray(),
      db.reviews.orderBy('at').toArray(),
      getSetting<number | null>(db, 'lastBackupAt', null),
    ]);
    setCards(allCards);
    setReviews(allReviews);
    setLastBackupAt(last);
  }

  useEffect(() => {
    const db = new LearningDatabase(databaseName);
    dbRef.current = db;
    let alive = true;
    (async () => {
      try {
        await db.open();
        await reload(db);
        if (alive) setLoaded(true);
      } catch (error) {
        if (alive) setFailure(error instanceof Error ? error.message : String(error));
      }
      const status = await persistenceStatus();
      if (alive) setPersistence(status);
    })();
    const timer = setInterval(() => setTick(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
      db.close();
    };
  }, [databaseName]);

  const card = cards.find((item) => item.cardId === skill.cardId) ?? null;
  const cardReviews = reviews.filter((review) => review.cardId === skill.cardId);
  const lastReviewAt = reviews.reduce((max, review) => Math.max(max, review.at), 0);
  const plan = loaded ? planDay({ cards, reviews, now, scheduler }) : null;
  const inPlan = Boolean(card && plan && [...plan.learning, ...plan.reviews, ...plan.fresh].some((item) => item.cardId === card.cardId));
  const activeSeed = seed ?? cardReviews.length + 1;
  const variant = useMemo(() => choiceGenerators[question](createRandom(activeSeed)), [question, activeSeed]);

  function resetQuestion(nextSeed: number | null) {
    setSeed(nextSeed);
    setChoice(null);
    setConfidence(null);
    setUsedHint(false);
    setOutcome(null);
  }

  async function check() {
    const db = dbRef.current;
    if (!db || !card || choice === null || confidence === null) return;
    const option = variant.options[choice];
    if (!option) return;
    setBusy(true);
    try {
      // Ответы идут по порядку времени, даже если часы прототипа вернули назад.
      const at = Math.max(now, lastReviewAt + 1);
      const input = {
        id: randomId(),
        cardId: card.cardId,
        at,
        correct: option.correct,
        confidence,
        usedHint,
        tooEasy: false,
        rating: ratingFor({ correct: option.correct, confidence, usedHint }),
        seed: activeSeed,
        contentVersion: skill.contentVersion,
        misconception: option.misconception ?? null,
        mode: 'review' as const,
      };
      const result = applyReview(card, input, scheduler);
      const review: ReviewRecord = { ...input, stateBefore: result.stateBefore };
      await saveAnswer(db, result.card, review);
      setSeed(activeSeed);
      setOutcome({ review, card: result.card, correctText: variant.options.find((item) => item.correct)?.text ?? '' });
      await reload(db);
    } finally {
      setBusy(false);
    }
  }

  /** «Слишком легко»: оценка последнего ответа меняется на Easy, карточка пересчитывается по истории. */
  async function markTooEasy() {
    const db = dbRef.current;
    if (!db || !outcome || !card) return;
    setBusy(true);
    try {
      const updated: ReviewRecord = {
        ...outcome.review,
        tooEasy: true,
        rating: ratingFor({ correct: true, confidence: 'know', usedHint: false, tooEasy: true }),
      };
      const own = (await db.reviews.where('cardId').equals(card.cardId).toArray()).map((review) => (review.id === updated.id ? updated : review));
      const replayed = replayCard(card, own, scheduler);
      await db.transaction('rw', db.cards, db.reviews, async () => {
        await db.reviews.bulkPut(replayed.reviews);
        await db.cards.put(replayed.card);
      });
      setOutcome({ ...outcome, review: updated, card: replayed.card });
      await reload(db);
    } finally {
      setBusy(false);
    }
  }

  async function exportFile() {
    const db = dbRef.current;
    if (!db) return;
    const text = serializeBackup(createBackup(await readAll(db), now));
    const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = backupFileName(now);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    await setSetting(db, 'lastBackupAt', now);
    setLastBackupAt(now);
  }

  async function chooseFile(files: FileList | null) {
    setImportMessage(null);
    setPending(null);
    const file = files?.[0];
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setImportMessage(parsed.message);
      return;
    }
    setPending({ backup: parsed.backup, fileName: file.name, migratedFrom: parsed.migratedFrom });
  }

  async function applyImport(mode: 'replace' | 'merge') {
    const db = dbRef.current;
    if (!db || !pending) return;
    setBusy(true);
    try {
      const incoming = pending.backup.data;
      await writeAll(db, mode === 'replace' ? incoming : mergeData(await readAll(db), incoming, scheduler));
      const when = formatFullMoment(pending.backup.exportedAt);
      setImportMessage(
        mode === 'replace'
          ? `Готово: данные на этом устройстве заменены копией от ${when}.`
          : `Готово: копия от ${when} объединена с данными на этом устройстве.`,
      );
      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
      resetQuestion(null);
      await reload(db);
    } finally {
      setBusy(false);
    }
  }

  async function resetData() {
    const db = dbRef.current;
    if (!db) return;
    await writeAll(db, emptyData());
    setConfirmReset(false);
    setImportMessage(null);
    resetQuestion(null);
    await reload(db);
  }

  async function askPersistence() {
    setPersistence(await requestPersistence());
  }

  if (failure) {
    return (
      <div class="note" role="alert">
        <strong class="note__title">Браузер не дал доступ к хранилищу.</strong>
        <p>
          Без него прогресс не сохранится. Возможно, включён приватный режим или запрещены данные сайтов. Подробности: {failure}
        </p>
      </div>
    );
  }
  if (!loaded || !card || !plan) return <p class="muted">Открываю хранилище…</p>;

  const shownCard = outcome?.card ?? card;
  const chosen = choice === null ? undefined : variant.options[choice];
  const misconception = outcome && !outcome.review.correct && chosen?.misconception ? misconceptions[chosen.misconception] : undefined;
  const summary = pending ? describeBackup(pending.backup) : null;

  return (
    <div class="review-lab">
      <section class="viz" aria-labelledby="review-clock">
        <h2 id="review-clock" class="review-lab__title">
          Часы прототипа
        </h2>
        <p>
          Сейчас: <strong>{formatFullMoment(now)}</strong>
          {offset > 0 ? ` — часы впереди на ${formatDuration(offset)}` : ''}.
        </p>
        <p class="muted">Только в прототипе: чтобы увидеть расписание, не дожидаясь, перемотайте время вперёд.</p>
        <div class="button-row">
          {CLOCK_STEPS.map((step) => (
            <button type="button" class="button" onClick={() => setOffset((value) => value + step.ms)} disabled={busy}>
              {step.label}
            </button>
          ))}
          <button type="button" class="button" onClick={() => setOffset(0)} disabled={busy || offset === 0}>
            Настоящее время
          </button>
        </div>
      </section>

      <section class="viz" aria-labelledby="review-card">
        <h2 id="review-card" class="review-lab__title">
          Карточка навыка
        </h2>
        <p>
          <strong>{skill.title}</strong>
        </p>
        <dl class="review-lab__facts">
          <dt>Состояние</dt>
          <dd>{STATE_NAMES[shownCard.fsrs.state]}</dd>
          <dt>Следующее повторение</dt>
          <dd>{shownCard.fsrs.state === State.New ? 'после первого ответа' : describeDue(shownCard.fsrs.due, now)}</dd>
          <dt>Вероятность вспомнить сейчас</dt>
          <dd>{shownCard.fsrs.state === State.New ? '—' : formatPercent(retrievability(shownCard, now, scheduler))}</dd>
          <dt>Стабильность</dt>
          <dd>{shownCard.fsrs.state === State.New ? '—' : formatDuration(shownCard.fsrs.stability * DAY)}</dd>
          <dt>Ответов и ошибок после изучения</dt>
          <dd>
            {shownCard.fsrs.reps} и {shownCard.fsrs.lapses}
          </dd>
        </dl>
        <p class="review-lab__plan">
          План учебного дня (день начинается в {DEFAULT_DAY_START_HOUR}:00): изучение — {plan.learning.length}, повторения —{' '}
          {plan.reviews.length}, новые — {plan.fresh.length}, отложено из-за лимита — {plan.postponed}. Лимиты: {DEFAULT_LIMITS.newPerDay}{' '}
          новых и {DEFAULT_LIMITS.reviewsPerDay} повторений в день.
        </p>

        {!inPlan && !outcome ? (
          <div class="viz-feedback" role="status">
            <p>
              Сейчас повторять не нужно. Следующее повторение — {describeDue(card.fsrs.due, now)}. Перемотайте часы прототипа,
              чтобы дождаться его.
            </p>
          </div>
        ) : (
          <div class="review-lab__question">
            <p class="viz__position">Вариант № {activeSeed}</p>
            <fieldset>
              <legend>{variant.prompt}</legend>
              {variant.options.map((option, index) => (
                <label class="choice">
                  <input type="radio" name="review-answer" checked={choice === index} disabled={outcome !== null} onChange={() => setChoice(index)} />
                  <code>{option.text}</code>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Насколько вы уверены?</legend>
              {CONFIDENCE.map((item) => (
                <label class="choice">
                  <input
                    type="radio"
                    name="review-confidence"
                    checked={confidence === item.value}
                    disabled={outcome !== null}
                    onChange={() => setConfidence(item.value)}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            {usedHint ? (
              <div class="note">
                <strong class="note__title">Подсказка</strong>
                <p>{hint}</p>
              </div>
            ) : (
              outcome === null && (
                <div class="button-row">
                  <button type="button" class="button" onClick={() => setUsedHint(true)}>
                    Показать подсказку
                  </button>
                </div>
              )
            )}
            {outcome === null ? (
              <div class="button-row">
                <button type="button" class="button button--primary" disabled={choice === null || confidence === null || busy} onClick={check}>
                  Проверить
                </button>
              </div>
            ) : (
              <>
                <div class="viz-feedback" role="status">
                  {outcome.review.correct ? (
                    <p>
                      <strong>Верно.</strong>
                      {outcome.review.confidence === 'guess' ? ' Правильная догадка ещё не доказывает знание: задание вернётся скоро.' : ''}
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>Неверно.</strong> Правильный ответ: <code>{outcome.correctText}</code>.
                      </p>
                      {misconception && (
                        <p>
                          <strong>{misconception.text}</strong> {misconception.explanation}
                        </p>
                      )}
                      {isConfidentError(outcome.review) && (
                        <p>Это уверенная ошибка: задание вернётся в этой же сессии, затем не позже чем через день и через неделю.</p>
                      )}
                    </>
                  )}
                  <p>
                    Оценка FSRS: <strong>{RATING_NAMES[outcome.review.rating]}</strong>
                    {outcome.review.usedHint ? ' (была подсказка — не выше Hard)' : ''}. Следующее повторение —{' '}
                    {describeDue(outcome.card.fsrs.due, outcome.review.at)}.
                  </p>
                </div>
                <div class="button-row">
                  <button type="button" class="button button--primary" onClick={() => resetQuestion(null)} disabled={busy}>
                    Дальше
                  </button>
                  {canBeTooEasy(outcome.review) && !outcome.review.tooEasy && (
                    <button type="button" class="button" onClick={markTooEasy} disabled={busy}>
                      Слишком легко
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {cardReviews.length > 0 && (
          <>
            <h3 class="review-lab__subtitle">История ответов</h3>
            <div class="table-wrap" tabIndex={0} role="region" aria-label="История ответов">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Когда</th>
                    <th scope="col">Ответ</th>
                    <th scope="col">Уверенность</th>
                    <th scope="col">Подсказка</th>
                    <th scope="col">Оценка</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cardReviews]
                    .reverse()
                    .slice(0, 10)
                    .map((review) => (
                      <tr>
                        <td>{formatMoment(review.at)}</td>
                        <td>{review.correct ? 'верно' : 'неверно'}</td>
                        <td>{CONFIDENCE_NAMES[review.confidence]}</td>
                        <td>{review.usedHint ? 'да' : 'нет'}</td>
                        <td>{RATING_NAMES[review.rating]}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section class="viz" aria-labelledby="review-backup">
        <h2 id="review-backup" class="review-lab__title">
          Копия в файл
        </h2>
        <p>Копия переносит прогресс на другое устройство и спасает его, если браузер удалит данные. Ключ API в копию не попадает.</p>
        <div class="button-row">
          <button type="button" class="button button--primary" onClick={exportFile} disabled={busy}>
            Сохранить копию в файл
          </button>
        </div>
        <p class="muted">Последняя копия: {lastBackupAt === null ? 'ещё не сохранялась' : formatFullMoment(lastBackupAt)}.</p>

        <h3 class="review-lab__subtitle">Восстановить из файла</h3>
        {/* Поле выбора файла спрятано, а кнопкой служит его подпись: так кнопка
            по-русски в любом браузере. С клавиатуры фокус попадает на само поле. */}
        <input
          id="review-import"
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden review-lab__file"
          onChange={(event) => void chooseFile(event.currentTarget.files)}
        />
        <label for="review-import" class="button review-lab__file-button">
          Выбрать файл копии…
        </label>
        {pending && summary && (
          <div class="note">
            <strong class="note__title">
              Копия от {formatFullMoment(summary.exportedAt)}: карточек — {summary.cards}, ответов — {summary.reviews}.
            </strong>
            <p class="muted">Файл: {pending.fileName}</p>
            {pending.migratedFrom !== null && <p>Копия из старой версии приложения переведена в текущую схему.</p>}
            <p>
              «Заменить» — данные на этом устройстве станут такими, как в копии. «Объединить» — ответы с обоих устройств сложатся без
              повторов, а расписание каждой карточки пересчитается по общей истории.
            </p>
            <div class="button-row">
              <button type="button" class="button" onClick={() => applyImport('replace')} disabled={busy}>
                Заменить
              </button>
              <button type="button" class="button button--primary" onClick={() => applyImport('merge')} disabled={busy}>
                Объединить
              </button>
            </div>
          </div>
        )}
        {importMessage && (
          <div class="viz-feedback" role="status">
            <p>{importMessage}</p>
          </div>
        )}
      </section>

      <section class="viz" aria-labelledby="review-storage">
        <h2 id="review-storage" class="review-lab__title">
          Хранилище
        </h2>
        <p>
          База в браузере: <code>{databaseName}</code>. Прототип пишет в отдельную базу, поэтому его данные не смешаются с настоящим
          прогрессом.
        </p>
        <p>Постоянное хранилище: {persistence === null ? 'проверяю…' : PERSISTENCE_TEXT[persistence]}</p>
        {persistence === 'not-persisted' && (
          <div class="button-row">
            <button type="button" class="button" onClick={askPersistence}>
              Попросить постоянное хранилище
            </button>
          </div>
        )}
        <p class="muted">
          Safari удаляет данные сайта, если семь дней пользоваться Safari и не заходить на сайт. Приложение на экране «Домой» живёт по
          своему счётчику, поэтому на iPhone его лучше установить.
        </p>
        {confirmReset ? (
          <div class="note" role="alert">
            <strong class="note__title">Удалить все данные прототипа? Отменить это нельзя.</strong>
            <div class="button-row">
              <button type="button" class="button button--primary" onClick={resetData}>
                Удалить
              </button>
              <button type="button" class="button" onClick={() => setConfirmReset(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div class="button-row">
            <button type="button" class="button" onClick={() => setConfirmReset(true)}>
              Удалить данные прототипа
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
