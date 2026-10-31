/**
 * Состояние уровня и шаги цикла (ТЗ, «Когда уровень считается освоенным»):
 * «не начат», «изучается» или «освоен», какие шаги пройдены и чего ещё
 * не хватает до «освоено».
 */
import { useEffect, useState } from 'preact/hooks';
import {
  completedSteps,
  delayedCheckDue,
  delayedCheckOpensAt,
  levelQuestions,
  levelStatus,
  openConfidentErrors,
} from '../../lib/learning/progress.ts';
import type { Level, TopicContext } from '../../lib/learning/question-types.ts';
import { LEVELS } from '../../lib/learning/question-types.ts';
import { stepTitle } from '../../lib/learning/steps.ts';
import { loadLevel, onProgress, setTopicPaused, type LevelState } from '../../lib/learning/store.ts';
import './learn.css';


const STATUS_TEXT = { 'not-started': 'не начат', 'in-progress': 'изучается', mastered: 'освоен' } as const;

export interface LevelProgressProps {
  topic: TopicContext;
  level: Level;
  levelTitle: string;
  /** Якоря первых заданий шагов: по ним ведут ссылки шагов. */
  anchors: Record<number, string>;
}

function formatMoment(at: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(at));
}

export default function LevelProgress({ topic, level, levelTitle, anchors }: LevelProgressProps) {
  const [state, setState] = useState<LevelState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadLevel(topic, level)
        .then((next) => {
          if (alive) setState(next);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    void refresh();
    const off = onProgress((change) => {
      if (change.topicId === topic.topicId && change.level === level) void refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [topic, level]);

  const steps = topic.steps[level] ?? [];
  if (failed) {
    return (
      <section class="level-progress" aria-label={`Прохождение уровня «${levelTitle}»`}>
        <p class="muted">Прогресс не загрузился: браузер не дал доступ к хранилищу. Читать тему можно и так.</p>
      </section>
    );
  }

  const now = Date.now();
  const record = state?.record;
  const done = new Set(record?.done ?? []);
  const completed = new Set(state ? completedSteps(topic, level, done) : []);
  const status = state ? levelStatus({ topic, level, record, reviews: state.reviews, dayStartHour: state.settings.dayStartHour }) : 'not-started';
  const skills = new Set(levelQuestions(topic, level).flatMap((question) => (question.skill ? [question.skill] : [])));
  const openErrors = state ? openConfidentErrors(state.reviews, skills, state.settings.dayStartHour).length : 0;
  const remaining = steps.filter((step) => !completed.has(step));
  const check = record?.check;
  const delayed = record?.delayed;

  return (
    <section class="level-progress" aria-label={`Прохождение уровня «${levelTitle}»`}>
      <p class="level-progress__status">
        Уровень «{levelTitle}»: {state ? STATUS_TEXT[status] : 'загружаю…'}
      </p>
      <ul class="level-progress__steps" aria-label="Шаги цикла">
        {steps.map((step) => {
          const isDone = completed.has(step);
          const anchor = anchors[step];
          const label = `${isDone ? '✓ ' : ''}${stepTitle(step) ?? `Шаг ${step}`}`;
          return (
            <li>
              {anchor ? (
                <a class={isDone ? 'level-progress__step level-progress__step--done' : 'level-progress__step'} href={`#${anchor}`}>
                  {label}
                  <span class="visually-hidden">{isDone ? ' — пройден' : ' — не пройден'}</span>
                </a>
              ) : (
                <span class={isDone ? 'level-progress__step level-progress__step--done' : 'level-progress__step'}>{label}</span>
              )}
            </li>
          );
        })}
      </ul>
      {state && status !== 'mastered' && (
        <ul class="level-progress__conditions">
          <li>
            {remaining.length === 0
              ? 'Все шаги пройдены.'
              : `Осталось пройти шаги: ${remaining.map((step) => `«${stepTitle(step)}»`).join(', ')}.`}
          </li>
          <li>
            {check?.passed
              ? `Итоговая проверка пройдена: ${check.correct} из ${check.total}.`
              : check
                ? `Итоговая проверка не пройдена: ${check.correct} из ${check.total}, нужно не меньше ${Math.round(state.settings.masteryThreshold * 100)}%.`
                : remaining.length === 0
                  ? 'Итоговая проверка открыта — она в конце страницы.'
                  : 'Итоговая проверка откроется, когда пройдены все шаги.'}
          </li>
          {openErrors > 0 && <li>Уверенных ошибок ждут повторной проверки в другой день: {openErrors}. Они придут в повторении.</li>}
          {check?.passed && (
            <li>
              {delayed?.passed
                ? 'Отложенная проверка пройдена.'
                : delayedCheckDue(record, now, state.settings.dayStartHour)
                  ? 'Отложенная проверка доступна — она в начале страницы.'
                  : `Отложенная проверка откроется ${formatMoment(delayedCheckOpensAt(check.at, state.settings.dayStartHour))}: проверим, что знание держится, а не просто свежо.`}
            </li>
          )}
        </ul>
      )}
      {status === 'mastered' && <p class="level-progress__conditions">Все условия выполнены. Навыки уровня теперь возвращаются в повторении.</p>}
      {state && status !== 'not-started' && (
        <div class="level-progress__pause">
          {record?.paused && <p>Тема на паузе: её навыки не приходят в повторении.</p>}
          <button
            type="button"
            class="button"
            onClick={() => void setTopicPaused(topic.topicId, LEVELS.filter((item) => item in topic.levelPaths), !record?.paused)}
          >
            {record?.paused ? 'Снять тему с паузы' : 'Поставить тему на паузу'}
          </button>
        </div>
      )}
    </section>
  );
}
