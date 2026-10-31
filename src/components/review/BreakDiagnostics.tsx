/**
 * Диагностика после перерыва (ТЗ, «Возвращение после перерыва»): по одному
 * короткому заданию на каждый начатый уровень, без подсказок. В конце — что
 * сохранилось, а что пройти заново и с какого уровня. Ответы идут в историю
 * повторений, как обычные: расписание подстроится само.
 */
import { useEffect, useState } from 'preact/hooks';
import { DIAGNOSTIC_MAX_QUESTIONS, diagnosticLevels, diagnosticVerdicts, pickDiagnosticQuestion, type DiagnosticAnswer } from '../../lib/learning/diagnostics.ts';
import { plural } from '../../lib/learning/format.ts';
import { hashString } from '../../lib/learning/progress.ts';
import { topicContext, type Level, type PreparedQuestion, type TopicContext } from '../../lib/learning/question-types.ts';
import { getDb, randomSeed, restartLevel } from '../../lib/learning/store.ts';
import { loadTopic, loadTopicsIndex, type TopicSummary } from '../../lib/learning/topics.ts';
import Question from '../learn/Question.tsx';
import '../learn/learn.css';
import './review.css';

export interface BreakDiagnosticsProps {
  base: string;
  runnerUrl: string;
}

interface Task {
  topic: TopicSummary;
  context: TopicContext;
  level: Level;
  question: PreparedQuestion;
  seed: number;
}

type Phase = { kind: 'loading' } | { kind: 'empty' } | { kind: 'failed'; message: string } | { kind: 'intro' } | { kind: 'running' } | { kind: 'result' };

const LEVEL_TITLES: Record<Level, string> = { fundament: 'Фундамент', base: 'База', depth: 'Глубина' };

export default function BreakDiagnostics({ base, runnerUrl }: BreakDiagnosticsProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [restarted, setRestarted] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const [records, index] = await Promise.all([getDb().progress.toArray(), loadTopicsIndex(base)]);
      const topics = new Map(index.topics.map((topic) => [topic.id, topic]));
      const levels = diagnosticLevels(records, new Set(topics.keys()));
      const day = new Date().toISOString().slice(0, 10);
      const list: Task[] = [];
      for (const item of levels) {
        const summary = topics.get(item.topicId);
        if (!summary) continue;
        const prepared = await loadTopic(base, item.topicId);
        const question = pickDiagnosticQuestion(prepared, item.level, hashString(`${day}:${item.topicId}`));
        if (question) list.push({ topic: summary, context: topicContext(prepared, item.level), level: item.level, question, seed: randomSeed() });
      }
      if (!alive) return;
      setTasks(list);
      setPhase(list.length === 0 ? { kind: 'empty' } : { kind: 'intro' });
    })().catch(() => {
      if (alive) setPhase({ kind: 'failed', message: 'Задания не загрузились. Проверьте сеть и обновите страницу.' });
    });
    return () => {
      alive = false;
    };
  }, [base]);

  if (phase.kind === 'loading') return <p class="muted">Собираю задания по пройденным темам…</p>;
  if (phase.kind === 'failed') return <p role="alert">{phase.message}</p>;
  if (phase.kind === 'empty') {
    return (
      <p>
        Проверять пока нечего: здесь появятся задания по темам, которые вы начинали. <a href={`${base}ru/catalog/`}>Каталог</a>
      </p>
    );
  }

  if (phase.kind === 'intro') {
    return (
      <div class="check-panel">
        <p>
          {tasks.length} {plural(tasks.length, ['задание', 'задания', 'заданий'])} — по одному на каждый начатый уровень
          {tasks.length >= DIAGNOSTIC_MAX_QUESTIONS ? ' (самые давние)' : ''}. Подсказок нет. В конце — что сохранилось, а что стоит пройти заново и с
          какого уровня.
        </p>
        <div class="question__actions">
          <button type="button" class="button button--primary" onClick={() => setPhase({ kind: 'running' })}>
            Начать
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'running') {
    const task = tasks[index];
    if (!task) return null;
    const answered = answers.length > index;
    return (
      <div class="review-session">
        <p class="review-session__topic">
          <span>{task.topic.title}</span>
          <span class="badge">{LEVEL_TITLES[task.level]}</span>
        </p>
        <Question
          key={`${index}-${task.question.id}`}
          topic={task.context}
          level={task.level}
          question={task.question}
          mode="review"
          base={base}
          runnerUrl={runnerUrl}
          countsForSteps={false}
          allowHints={false}
          allowRetry={false}
          initialSeed={task.seed}
          position={{ index: index + 1, total: tasks.length }}
          onAnswered={({ correct }) => setAnswers((all) => [...all, { topicId: task.topic.id, level: task.level, correct }])}
        />
        {answered && (
          <div class="question__actions">
            <button
              type="button"
              class="button button--primary"
              onClick={() => (index + 1 < tasks.length ? setIndex(index + 1) : setPhase({ kind: 'result' }))}
            >
              {index + 1 < tasks.length ? 'Следующий вопрос' : 'Показать итог'}
            </button>
          </div>
        )}
      </div>
    );
  }

  const verdicts = diagnosticVerdicts(answers);
  const byId = new Map(tasks.map((task) => [task.topic.id, task.topic]));
  const contextOf = (topicId: string, level: Level) => tasks.find((task) => task.topic.id === topicId && task.level === level)?.context;
  return (
    <div role="status" class="diagnostic-result">
      <p class="question__verdict">
        Сохранилось: {answers.filter((answer) => answer.correct).length} из {answers.length}.
      </p>
      <ul class="diagnostic-result__list">
        {verdicts.map((verdict) => {
          const topic = byId.get(verdict.topicId);
          if (!topic) return null;
          const restart = verdict.restartFrom;
          const levelPath = restart ? topic.levels.find((item) => item.level === restart)?.path : undefined;
          const key = `${verdict.topicId}:${restart}`;
          return (
            <li>
              <p>
                <a href={`${base}${topic.path}`}>{topic.title}</a>:{' '}
                {verdict.levels.map((item) => `${LEVEL_TITLES[item.level]} — ${item.correct ? 'сохранилось' : 'забылось'}`).join(', ')}.
              </p>
              {restart && (
                <p>
                  Стоит пройти заново с уровня «{LEVEL_TITLES[restart]}».{' '}
                  {restarted.has(key) ? (
                    <a href={`${base}${levelPath ?? topic.path}`}>Открыть уровень</a>
                  ) : (
                    <button
                      type="button"
                      class="button"
                      onClick={() => {
                        const context = contextOf(verdict.topicId, restart);
                        if (!context) return;
                        void restartLevel(context, restart).then(() => setRestarted((all) => new Set([...all, key])));
                      }}
                    >
                      Начать уровень «{LEVEL_TITLES[restart]}» заново
                    </button>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p class="muted">
        «Начать заново» обнуляет пройденные шаги уровня; история ответов и расписание повторений остаются. Ошибки — в{' '}
        <a href={`${base}ru/errors/`}>журнале ошибок</a>, забытые навыки скоро вернутся в <a href={`${base}ru/review/`}>повторении</a>.
      </p>
    </div>
  );
}
