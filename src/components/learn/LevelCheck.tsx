/**
 * Итоговая и отложенная проверки уровня (ТЗ, «Когда уровень считается
 * освоенным»). Итоговая — задания на новых вариантах, среди них свободный
 * ввод, а у алгоритма — код; открывается, когда пройдены все шаги. Отложенная
 * — три вопроса не раньше следующего учебного дня. Подсказок нет; порог —
 * 80% верных (настройка).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { learningDayKey } from '../../lib/learning/day.ts';
import { checkPassed, delayedCheckDue, hashString, pickDelayedQuestions, remainingSteps } from '../../lib/learning/progress.ts';
import type { Level, PreparedQuestion, TopicContext } from '../../lib/learning/question-types.ts';
import { finishCheck, loadLevel, onProgress, randomSeed, type LevelState } from '../../lib/learning/store.ts';
import type { LevelCheckRecord } from '../../lib/learning/types.ts';
import Question from './Question.tsx';
import { stepTitle } from '../../lib/learning/steps.ts';
import './learn.css';

export interface LevelCheckProps {
  kind: 'check' | 'delayed';
  topic: TopicContext;
  level: Level;
  levelTitle: string;
  /** Итоговая — задания проверки уровня; отложенная — все оцениваемые задания уровня, из них выбираются три. */
  questions: PreparedQuestion[];
  base: string;
  runnerUrl: string;
}

type Phase = 'intro' | 'running' | 'result';

export default function LevelCheck({ kind, topic, level, levelTitle, questions, base, runnerUrl }: LevelCheckProps) {
  const [state, setState] = useState<LevelState | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [result, setResult] = useState<LevelCheckRecord | null>(null);
  const [seeds, setSeeds] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadLevel(topic, level)
        .then((next) => {
          if (alive) setState(next);
        })
        .catch(() => {});
    void refresh();
    const off = onProgress((change) => {
      if (change.topicId === topic.topicId && change.level === level) void refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [topic, level]);

  const settings = state?.settings;
  const set = useMemo(() => {
    if (kind === 'check') return questions;
    const day = learningDayKey(Date.now(), settings?.dayStartHour);
    return pickDelayedQuestions({ questions }, level, hashString(day));
  }, [kind, questions, level, settings?.dayStartHour]);

  if (!state) {
    // Пока прогресс загружается — место под проверку, чтобы остров было видно на странице.
    return kind === 'check' ? (
      <section class="check-panel" aria-label="Итоговая проверка">
        <p class="muted">Загружаю итоговую проверку…</p>
      </section>
    ) : null;
  }
  const record = state.record;
  const threshold = Math.round(state.settings.masteryThreshold * 100);

  if (kind === 'delayed' && !delayedCheckDue(record, Date.now(), state.settings.dayStartHour) && phase !== 'result') return null;

  const remaining = remainingSteps(topic, level, new Set(record.done ?? []));
  const title = kind === 'check' ? 'Итоговая проверка' : 'Отложенная проверка';
  const previous = kind === 'check' ? record.check : record.delayed;

  const start = () => {
    setSeeds(set.map(() => randomSeed()));
    setAnswers([]);
    setIndex(0);
    setResult(null);
    setAttempt((value) => value + 1);
    setPhase('running');
  };

  const finish = async (all: boolean[]) => {
    const correct = all.filter(Boolean).length;
    setResult(await finishCheck(topic, level, kind, correct, all.length));
    setPhase('result');
  };

  return (
    <section class="check-panel" id={`${kind}-${level}`} aria-labelledby={`${kind}-${level}-title`}>
      <h2 class="check-panel__title" id={`${kind}-${level}-title`}>
        {title}
      </h2>

      {phase === 'intro' && kind === 'check' && remaining.length > 0 && (
        <p>
          Откроется, когда пройдены все шаги уровня. Осталось: {remaining.map((step) => `«${stepTitle(step)}»`).join(', ')}.
        </p>
      )}

      {phase === 'intro' && (kind === 'delayed' || remaining.length === 0) && (
        <>
          <p>
            {kind === 'check'
              ? `${set.length} заданий на новых вариантах. Подсказок нет. Чтобы пройти, нужно не меньше ${threshold}% верных ответов.`
              : `Прошёл учебный день после итоговой проверки — три вопроса по уровню «${levelTitle}», чтобы отличить знание от свежего впечатления. Нужно не меньше ${threshold}% верных.`}
          </p>
          {previous && (
            <p class="muted">
              Прошлый результат: {previous.correct} из {previous.total} — {previous.passed ? 'пройдено' : 'не пройдено'}.
            </p>
          )}
          <div class="question__actions">
            <button type="button" class="button button--primary" onClick={start}>
              {previous ? 'Пройти ещё раз' : 'Начать'}
            </button>
          </div>
        </>
      )}

      {phase === 'running' && set[index] && (
        <>
          <Question
            key={`${attempt}-${index}`}
            topic={topic}
            level={level}
            question={set[index] as PreparedQuestion}
            mode={kind}
            base={base}
            runnerUrl={runnerUrl}
            countsForSteps={false}
            allowHints={false}
            allowRetry={false}
            initialSeed={seeds[index]}
            position={{ index: index + 1, total: set.length }}
            onAnswered={({ correct }) => setAnswers((all) => [...all, correct])}
          />
          {answers.length > index && (
            <div class="question__actions">
              {index + 1 < set.length ? (
                <button type="button" class="button button--primary" onClick={() => setIndex((value) => value + 1)}>
                  Следующий вопрос
                </button>
              ) : (
                <button type="button" class="button button--primary" onClick={() => void finish(answers)}>
                  Завершить проверку
                </button>
              )}
            </div>
          )}
        </>
      )}

      {phase === 'result' && result && (
        <div role="status">
          <p class="question__verdict">
            {result.passed ? 'Проверка пройдена' : 'Проверка не пройдена'}: {result.correct} из {result.total} (
            {Math.round((result.correct / result.total) * 100)}%).
          </p>
          {result.passed ? (
            <p>
              {kind === 'check'
                ? 'Следующий шаг — отложенная проверка: она откроется с начала следующего учебного дня. Ошибки уже в журнале и в повторении.'
                : 'Если не осталось уверенных ошибок без повторной проверки, уровень освоен — это видно в начале страницы.'}
            </p>
          ) : (
            <p>
              Нужно не меньше {threshold}% верных. Разберите ошибки выше, вернитесь к блокам, где они объясняются, и пройдите
              проверку ещё раз — варианты будут новыми.
            </p>
          )}
          {!checkPassed(result.correct, result.total, state.settings.masteryThreshold) || kind === 'check' ? (
            <div class="question__actions">
              <button type="button" class="button" onClick={start}>
                Пройти ещё раз
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
