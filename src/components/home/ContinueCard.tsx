/**
 * «Продолжить» на главной (ТЗ, «Путь ученика»): тема, уровень и задание, на
 * котором человек остановился. Прогресс только в браузере, поэтому карточка
 * появляется после загрузки страницы и только если есть что продолжать.
 */
import { useEffect, useState } from 'preact/hooks';
import { stepTitle } from '../../lib/learning/steps.ts';
import { allProgress } from '../../lib/learning/store.ts';
import type { ProgressRecord } from '../../lib/learning/types.ts';

export interface ContinueTopic {
  id: string;
  title: string;
  /** Адреса уровней без base и их названия. */
  levels: { level: string; title: string; path: string }[];
}

export interface ContinueCardProps {
  topics: ContinueTopic[];
  base: string;
}

export default function ContinueCard({ topics, base }: ContinueCardProps) {
  const [latest, setLatest] = useState<ProgressRecord | null | undefined>(undefined);
  const [mastered, setMastered] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    allProgress()
      .then((records) => {
        const known = new Set(topics.map((topic) => topic.id));
        const own = records.filter((record) => known.has(record.topicId));
        // Начатый уровень: есть ответы (даже только неверные), он не освоен и не на паузе.
        const open = own
          .filter((record) => !record.paused && record.status !== 'mastered' && (record.status === 'in-progress' || record.lastQuestion !== undefined))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        setMastered(own.some((record) => record.status === 'mastered'));
        setPaused(own.some((record) => record.paused));
        setLatest(open[0] ?? null);
      })
      .catch(() => setLatest(null));
  }, [topics]);

  if (latest === undefined) return null;
  const topic = latest ? topics.find((item) => item.id === latest.topicId) : undefined;
  const level = latest ? topic?.levels.find((item) => item.level === latest.level) : undefined;
  if (!latest || !topic || !level) {
    // Место под карточку уже оставлено — вместо пустоты подсказка, что дальше.
    const text = mastered
      ? 'Всё начатое освоено. Выберите следующую тему в каталоге.'
      : paused
        ? 'Начатые темы на паузе: снять паузу можно на странице темы. Или выберите новую тему в каталоге.'
        : 'Выберите тему в каталоге.';
    return (
      <section class="card continue-card" aria-labelledby="continue-title">
        <h2 id="continue-title" class="card__title">
          Продолжить
        </h2>
        <p>{text}</p>
        <p>
          <a class="button button--primary" href={`${base}ru/catalog/`}>
            Каталог
          </a>
        </p>
      </section>
    );
  }
  const href = `${base}${level.path}${latest.lastQuestion ? `#${latest.lastQuestion}` : ''}`;
  const done = latest.completedSteps
    .map((step) => stepTitle(step))
    .filter((title): title is string => title !== undefined)
    .map((title) => `«${title}»`);

  return (
    <section class="card continue-card" aria-labelledby="continue-title">
      <h2 id="continue-title" class="card__title">
        Продолжить
      </h2>
      <p>
        {topic.title}, уровень «{level.title}».{' '}
        {done.length > 0 ? `Пройдены шаги: ${done.join(', ')}.` : 'Шаги ещё не пройдены.'}
      </p>
      <p>
        <a class="button button--primary" href={href}>
          Продолжить с места остановки
        </a>
      </p>
    </section>
  );
}
