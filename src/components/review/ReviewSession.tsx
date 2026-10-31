/**
 * Повторение (ТЗ, «Разбор ошибок и повторение», экран «Сессия»): навыки,
 * которые пора повторить, — по одному заданию на навык, «вопрос N из M» без
 * очков. План дня с лимитами — queue.ts, чередование тем и выбор задания —
 * session.ts. Уверенная ошибка повторяется ещё раз в конце этой же сессии.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { createRandom } from '../../lib/random.ts';
import { formatDuration, formatMoment, plural } from '../../lib/learning/format.ts';
import { planDay } from '../../lib/learning/queue.ts';
import type { Level, PreparedQuestion, TopicContext } from '../../lib/learning/question-types.ts';
import { topicContext } from '../../lib/learning/question-types.ts';
import { createScheduler } from '../../lib/learning/scheduler.ts';
import { confusableGroups, lastQuestionOf, nextDue, pickQuestion, sessionOrder } from '../../lib/learning/session.ts';
import { loadSettings, type LearningSettings } from '../../lib/learning/settings.ts';
import { getDb, randomSeed } from '../../lib/learning/store.ts';
import { loadTopic, loadTopicsIndex, type TopicSummary } from '../../lib/learning/topics.ts';
import type { CardRecord, ReviewRecord, UserCardRecord } from '../../lib/learning/types.ts';
import Question from '../learn/Question.tsx';
import UserCardQuestion from './UserCardQuestion.tsx';
import '../learn/learn.css';
import './review.css';

export interface ReviewSessionProps {
  base: string;
  runnerUrl: string;
}

interface Item {
  card: CardRecord;
  /** Повтор уверенной ошибки в конце сессии. */
  again: boolean;
}

interface Session {
  postponed: number;
  settings: LearningSettings;
  topics: Map<string, TopicSummary>;
  reviews: ReviewRecord[];
  userCards: Map<string, UserCardRecord>;
}

type Current =
  | { kind: 'skill'; context: TopicContext; level: Level; question: PreparedQuestion; seed: number; topicTitle: string }
  | { kind: 'user'; card: UserCardRecord; topicTitle: string };

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'nothing'; started: boolean; next: number | null; postponed: number; settings: LearningSettings | null }
  | { kind: 'running' }
  | { kind: 'done'; next: number | null };

/** Темы на паузе: тема стоит на паузе, если на паузе любой её уровень. */
async function pausedTopics(): Promise<Set<string>> {
  const records = await getDb().progress.toArray();
  return new Set(records.filter((record) => record.paused).map((record) => record.topicId));
}

function describeNext(next: number | null, now: number): string {
  if (next === null) return '';
  if (next <= now) return 'Следующее повторение — уже сейчас: обновите страницу.';
  const soon = next - now < 12 * 3_600_000;
  return `Следующее повторение — ${soon ? `через ${formatDuration(next - now)} (${formatMoment(next)})` : formatMoment(next)}.`;
}

export default function ReviewSession({ base, runnerUrl }: ReviewSessionProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [session, setSession] = useState<Session | null>(null);
  // Очередь растёт во время сессии (повтор уверенной ошибки), поэтому она в ref,
  // а для показа «из M» — длина в состоянии.
  const items = useRef<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<Current | null>(null);
  const [answered, setAnswered] = useState(false);
  const [skipped, setSkipped] = useState(0);

  // План дня: карточки, лимиты, паузы и чередование тем.
  useEffect(() => {
    let alive = true;
    (async () => {
      const db = getDb();
      const [settings, cards, reviews, paused, ownCards] = await Promise.all([
        loadSettings(db),
        db.cards.toArray(),
        db.reviews.toArray(),
        pausedTopics(),
        db.userCards.toArray(),
      ]);
      const userCards = new Map(ownCards.map((card) => [card.id, card]));
      if (cards.length === 0) {
        if (alive) setPhase({ kind: 'nothing', started: false, next: null, postponed: 0, settings });
        return;
      }
      const index = await loadTopicsIndex(base);
      const topics = new Map(index.topics.map((topic) => [topic.id, topic]));
      const skills = new Set(index.topics.flatMap((topic) => topic.skills.map((skill) => skill.id)));
      // Навыки, которых больше нет в контенте этой сборки, не повторяются. Свои карточки — на тех же правах.
      const known = cards.filter((card) => (card.source === 'content' ? skills.has(card.cardId) : userCards.has(card.cardId)));
      const now = Date.now();
      const plan = planDay({
        cards: known,
        reviews,
        now,
        scheduler: createScheduler(settings.retention),
        limits: { newPerDay: settings.newPerDay, reviewsPerDay: settings.reviewsPerDay },
        dayStartHour: settings.dayStartHour,
        pausedTopics: paused,
      });
      const order = sessionOrder(plan, confusableGroups(index.topics), createRandom(randomSeed()));
      if (!alive) return;
      if (order.length === 0) {
        setPhase({ kind: 'nothing', started: true, next: nextDue(known, paused, settings.dayStartHour), postponed: plan.postponed, settings });
        return;
      }
      items.current = order.map((card) => ({ card, again: false }));
      setTotal(items.current.length);
      setSession({ postponed: plan.postponed, settings, topics, reviews, userCards });
      setPhase({ kind: 'running' });
    })().catch(() => {
      if (alive) setPhase({ kind: 'failed', message: 'Список тем не загрузился. Проверьте сеть и обновите страницу.' });
    });
    return () => {
      alive = false;
    };
  }, [base]);

  // Задание для текущего навыка: тема загружается, задание выбирается не то, что в прошлый раз.
  useEffect(() => {
    if (!session || phase.kind !== 'running') return;
    const item = items.current[index];
    if (!item) return;
    let alive = true;
    setCurrent(null);
    setAnswered(false);
    (async (): Promise<Current | null> => {
      const summary = session.topics.get(item.card.topicId);
      if (item.card.source === 'user') {
        const card = session.userCards.get(item.card.cardId);
        return card ? { kind: 'user', card, topicTitle: summary?.title ?? 'Своя карточка' } : null;
      }
      const skill = summary?.skills.find((entry) => entry.id === item.card.cardId);
      if (!summary || !skill) return null;
      const prepared = await loadTopic(base, item.card.topicId);
      const random = createRandom(randomSeed());
      const question = pickQuestion(prepared.questions, skill.id, lastQuestionOf(skill.id, session.reviews), random);
      if (!question) return null;
      return { kind: 'skill', context: topicContext(prepared, skill.level), level: skill.level, question, seed: randomSeed(), topicTitle: summary.title };
    })()
      .catch(() => null)
      .then((next) => {
        if (!alive) return;
        if (next) setCurrent(next);
        else {
          // Задания навыка не загрузились (например, без сети) — навык подождёт.
          setSkipped((value) => value + 1);
          advance();
        }
      });
    return () => {
      alive = false;
    };
  }, [session, index, phase.kind]);

  function advance() {
    if (!session) return;
    if (index + 1 < items.current.length) {
      setIndex(index + 1);
      return;
    }
    void (async () => {
      const [cards, paused] = await Promise.all([getDb().cards.toArray(), pausedTopics()]);
      setPhase({ kind: 'done', next: nextDue(cards, paused, session.settings.dayStartHour) });
    })();
  }

  function onAnswered({ confidentError }: { correct: boolean; confidentError: boolean }) {
    setAnswered(true);
    const item = items.current[index];
    // Уверенная ошибка — ещё раз в конце этой же сессии (ТЗ), один раз.
    if (item && confidentError && !item.again && !items.current.slice(index + 1).some((other) => other.card.cardId === item.card.cardId)) {
      items.current = [...items.current, { card: item.card, again: true }];
      setTotal(items.current.length);
    }
  }

  const now = Date.now();

  if (phase.kind === 'loading') {
    return (
      <section class="review-session" aria-label="Повторение">
        <p class="muted">Составляю план на сегодня…</p>
      </section>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <section class="review-session" aria-label="Повторение">
        <p role="alert">{phase.message}</p>
      </section>
    );
  }

  if (phase.kind === 'nothing') {
    return (
      <section class="review-session" aria-label="Повторение">
        {!phase.started ? (
          <>
            <p>Повторять пока нечего. Навыки появляются в повторении, когда вы отвечаете на задания в темах.</p>
            <p>
              <a class="button button--primary" href={`${base}ru/catalog/`}>
                Выбрать тему в каталоге
              </a>
            </p>
          </>
        ) : (
          <>
            <p class="question__verdict">На сегодня повторений нет.</p>
            {phase.postponed > 0 && phase.settings && (
              <p>
                Ещё {phase.postponed} {plural(phase.postponed, ['навык ждёт', 'навыка ждут', 'навыков ждут'])} следующего дня: дневной лимит
                повторений — {phase.settings.reviewsPerDay}. Его можно изменить в <a href={`${base}ru/settings/`}>настройках</a>.
              </p>
            )}
            <p>{describeNext(phase.next, now)}</p>
          </>
        )}
      </section>
    );
  }

  if (phase.kind === 'done') {
    return (
      <section class="review-session" aria-label="Повторение">
        <div role="status">
          <p class="question__verdict">Повторение на сегодня закончено.</p>
          <p>{describeNext(phase.next, now)}</p>
          {skipped > 0 && (
            <p>
              {skipped} {plural(skipped, ['навык пропущен', 'навыка пропущены', 'навыков пропущены'])}: их задания не загрузились. Без
              сети повторяются темы, которые уже открывались на этом устройстве.
            </p>
          )}
          {session && session.postponed > 0 && (
            <p>
              Ещё {session.postponed} {plural(session.postponed, ['навык ждёт', 'навыка ждут', 'навыков ждут'])} следующего дня: дневной лимит
              повторений — {session.settings.reviewsPerDay}. Его можно изменить в <a href={`${base}ru/settings/`}>настройках</a>.
            </p>
          )}
          <p>
            Ошибки этой и прошлых сессий — в <a href={`${base}ru/errors/`}>журнале ошибок</a>.
          </p>
        </div>
      </section>
    );
  }

  const item = items.current[index];
  return (
    <section class="review-session" aria-label="Повторение">
      {!current || !item ? (
        <p class="muted">Готовлю задание…</p>
      ) : (
        <>
          <p class="review-session__topic">
            <span>{current.topicTitle}</span>
            {item.again && <span class="badge">ещё раз после уверенной ошибки</span>}
          </p>
          {current.kind === 'skill' ? (
            <Question
              key={`${index}-${current.question.id}`}
              topic={current.context}
              level={current.level}
              question={current.question}
              mode="review"
              base={base}
              runnerUrl={runnerUrl}
              countsForSteps={false}
              initialSeed={current.seed}
              position={{ index: index + 1, total }}
              onAnswered={onAnswered}
            />
          ) : (
            <UserCardQuestion key={`${index}-${current.card.id}`} card={current.card} base={base} position={{ index: index + 1, total }} onAnswered={onAnswered} />
          )}
          {answered && (
            <div class="question__actions">
              <button type="button" class="button button--primary" onClick={advance}>
                {index + 1 < total ? 'Следующий вопрос' : 'Завершить повторение'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
