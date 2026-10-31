/**
 * Своя карточка в повторении (ТЗ, «Заметки и свои карточки»): вопрос, отметка
 * уверенности, затем ответ — и человек сам отмечает, вспомнил ли он его.
 * Оценка для повторения — по тем же правилам, что у навыков.
 */
import { useId, useState } from 'preact/hooks';
import { recordUserCardAnswer } from '../../lib/learning/personal.ts';
import type { Confidence, UserCardRecord } from '../../lib/learning/types.ts';
import '../learn/learn.css';

export interface UserCardQuestionProps {
  card: UserCardRecord;
  base: string;
  position: { index: number; total: number };
  onAnswered: (outcome: { correct: boolean; confidentError: boolean }) => void;
}

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: 'know', label: 'знаю' },
  { value: 'unsure', label: 'сомневаюсь' },
  { value: 'guess', label: 'наугад' },
];

export default function UserCardQuestion({ card, base, position, onAnswered }: UserCardQuestionProps) {
  const uid = useId();
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function answer(correct: boolean) {
    if (!confidence) return;
    setBusy(true);
    try {
      const { confidentError } = await recordUserCardAnswer({ card, correct, confidence });
      setResult(correct);
      onAnswered({ correct, confidentError });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class={result === null ? 'question' : 'question question--answered'} aria-labelledby={`${uid}-prompt`} data-user-card={card.id}>
      <p class="question__meta">
        <span>Своя карточка</span>
        <span>
          вопрос {position.index} из {position.total}
        </span>
      </p>
      <p id={`${uid}-prompt`} class="question__prompt user-card__text">
        {card.question}
      </p>
      <fieldset class="question__confidence" disabled={revealed}>
        <legend>Вспомните ответ. Насколько вы уверены?</legend>
        {CONFIDENCE.map((item) => (
          <label class="choice">
            <input type="radio" name={`${uid}-confidence`} checked={confidence === item.value} onChange={() => setConfidence(item.value)} />
            {item.label}
          </label>
        ))}
      </fieldset>
      {!revealed ? (
        <div class="question__actions">
          <button type="button" class="button button--primary" disabled={confidence === null} onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        </div>
      ) : (
        <>
          <div class="question__reference">
            <p class="block-note__label">Ответ</p>
            <p class="user-card__text">{card.answer}</p>
            {card.path && (
              <p>
                <a href={`${base}${card.path}`}>Откуда карточка{card.blockTitle ? `: «${card.blockTitle}»` : ''}</a>
              </p>
            )}
          </div>
          {result === null ? (
            <div class="question__actions">
              <button type="button" class="button button--primary" disabled={busy} onClick={() => void answer(true)}>
                Вспомнил верно
              </button>
              <button type="button" class="button" disabled={busy} onClick={() => void answer(false)}>
                Ошибся
              </button>
            </div>
          ) : (
            <div class="question__feedback" role="status">
              <p class="question__verdict">{result ? 'Верно.' : 'Неверно. Карточка вернётся скоро.'}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
