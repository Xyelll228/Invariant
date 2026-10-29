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
  const [mastered, setMastered] = useState(0);

  useEffect(() => {
    allProgress()
      .then((records) => {
        const known = new Set(topics.map((topic) => topic.id));
        const own = records.filter((record) => known.has(record.topicId));
        const open = own.filter((record) => record.status === 'in-progress' && !record.paused).sort((a, b) => b.updatedAt - a.updatedAt);
        setMastered(own.filter((record) => record.status === 'mastered').length);
        setLatest(open[0] ?? null);
      })
      .catch(() => setLatest(null));
  }, [topics]);

  if (latest === undefined) return null;
  if (latest === null) {
    if (mastered === 0) return null;
    return (
      <section class="card continue-card" aria-labelledby="continue-title">
        <h2 id="continue-title" class="card__title">
          Продолжить
        </h2>
        <p>Всё начатое освоено: уровней — {mastered}. Выберите следующую тему в каталоге.</p>
        <p>
          <a class="button button--primary" href={`${base}ru/catalog/`}>
            Каталог
          </a>
        </p>
      </section>
    );
  }
  const topic = topics.find((item) => item.id === latest.topicId);
  const level = topic?.levels.find((item) => item.level === latest.level);
  if (!topic || !level) return null;
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
