/**
 * Задания на странице уровня: после блока («проверьте себя»), в шаге цикла
 * или предвопросы в начале уровня. Отмечает задания, которые уже пройдены.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Level, PreparedQuestion, TopicContext } from '../../lib/learning/question-types.ts';
import { loadLevel, onProgress } from '../../lib/learning/store.ts';
import Question from './Question.tsx';
import './learn.css';

export interface QuestionListProps {
  topic: TopicContext;
  level: Level;
  questions: PreparedQuestion[];
  mode: 'pre' | 'learn';
  base: string;
  runnerUrl: string;
  /** Подпись над списком. */
  title?: string;
}

export default function QuestionList({ topic, level, questions, mode, base, runnerUrl, title }: QuestionListProps) {
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadLevel(topic, level)
        .then((state) => {
          if (alive) setDone(new Set(state.record.done ?? []));
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

  const passed = questions.filter((question) => done.has(question.id)).length;

  return (
    <div class="question-list">
      {title && (
        <p class="question-list__title">
          <strong>{title}</strong>
          {questions.length > 1 && (
            <span class="muted">
              {' '}
              — пройдено {passed} из {questions.length}
            </span>
          )}
        </p>
      )}
      {questions.map((question) => (
        <div>
          {done.has(question.id) && <p class="muted question-list__done">Это задание вы уже прошли — можно ответить ещё раз.</p>}
          <Question topic={topic} level={level} question={question} mode={mode} base={base} runnerUrl={runnerUrl} />
        </div>
      ))}
    </div>
  );
}
