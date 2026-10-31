/**
 * Тренажёр терминов на странице глоссария: короткая сессия вопросов по
 * терминам — выбрать термин по определению, определение по термину, написать
 * русское название по английскому. Тон нейтральный, счёт — «N из M», без очков.
 */
import { useId, useState } from 'preact/hooks';
import { checkFree } from '../../lib/learning/answers.ts';
import { termSession, type TermQuestion, type TrainerTerm } from '../../lib/learning/terms-trainer.ts';
import { createRandom, randomSeed } from '../../lib/random.ts';
import '../learn/learn.css';

export interface TermsTrainerProps {
  terms: TrainerTerm[];
}

const SESSION = 10;

interface Outcome {
  correct: boolean;
  /** Выбранный неверный термин, если его часто путают с верным. */
  confusedWith: TrainerTerm | null;
}

export default function TermsTrainer({ terms }: TermsTrainerProps) {
  const uid = useId();
  const [session, setSession] = useState<TermQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [score, setScore] = useState(0);
  const byId = new Map(terms.map((term) => [term.id, term]));

  const start = () => {
    setSession(termSession(terms, Math.min(SESSION, Math.max(terms.length * 2, 3)), createRandom(randomSeed())));
    setIndex(0);
    setScore(0);
    reset();
  };

  function reset() {
    setSelected(null);
    setText('');
    setOutcome(null);
  }

  if (terms.length === 0) return null;
  if (!session) {
    return (
      <div class="check-panel">
        <p>Короткая тренировка по терминам глоссария: определения, названия, английские эквиваленты. Ответы не идут в повторение.</p>
        <div class="question__actions">
          <button type="button" class="button button--primary" onClick={start}>
            Начать тренировку
          </button>
        </div>
      </div>
    );
  }

  const question = session[index];
  if (!question) {
    return (
      <div class="check-panel" role="status">
        <p class="question__verdict">
          Тренировка закончена: верно {score} из {session.length}.
        </p>
        <div class="question__actions">
          <button type="button" class="button" onClick={start}>
            Ещё раз
          </button>
        </div>
      </div>
    );
  }

  const target = byId.get(question.termId);
  const check = () => {
    let result: Outcome;
    if (question.kind === 'russian-by-english') {
      result = { correct: checkFree({ answers: question.answers, normalize: 'text', typos: true }, text), confusedWith: null };
    } else {
      const correct = selected === question.termId;
      const chosen = selected ? byId.get(selected) : undefined;
      const confused = !correct && chosen && target && (target.confusedWith.includes(chosen.id) || chosen.confusedWith.includes(target.id)) ? chosen : null;
      result = { correct, confusedWith: confused ?? null };
    }
    setOutcome(result);
    if (result.correct) setScore((value) => value + 1);
  };
  const ready = question.kind === 'russian-by-english' ? text.trim() !== '' : selected !== null;

  return (
    <section class={outcome ? 'question question--answered' : 'question'} aria-labelledby={`${uid}-prompt`}>
      <p class="question__meta">
        <span>Тренажёр терминов</span>
        <span>
          вопрос {index + 1} из {session.length}
        </span>
      </p>
      <p id={`${uid}-prompt`} class="question__prompt">
        {question.prompt}
      </p>
      {question.kind === 'russian-by-english' ? (
        <p>
          <label for={`${uid}-answer`}>Ваш ответ</label>
          <input
            id={`${uid}-answer`}
            type="text"
            autocomplete="off"
            value={text}
            disabled={outcome !== null}
            onInput={(event) => setText((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready && !outcome) check();
            }}
          />
        </p>
      ) : (
        <fieldset>
          <legend class="visually-hidden">Варианты ответа</legend>
          <div class="question__options">
            {question.options.map((option) => (
              <label class="choice">
                <input type="radio" name={`${uid}-option`} checked={selected === option.termId} disabled={outcome !== null} onChange={() => setSelected(option.termId)} />
                {option.text}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!outcome ? (
        <div class="question__actions">
          <button type="button" class="button button--primary" disabled={!ready} onClick={check}>
            Проверить
          </button>
        </div>
      ) : (
        <>
          <div class="question__feedback" role="status">
            <p class="question__verdict">{outcome.correct ? 'Верно.' : 'Неверно.'}</p>
            {target && (
              <p>
                {target.term.charAt(0).toLocaleUpperCase('ru-RU') + target.term.slice(1)} ({target.en}) — {target.definition}
              </p>
            )}
            {outcome.confusedWith && (
              <p>
                Эти термины часто путают. {outcome.confusedWith.term.charAt(0).toLocaleUpperCase('ru-RU') + outcome.confusedWith.term.slice(1)} — {outcome.confusedWith.definition}
              </p>
            )}
            {target && (
              <p>
                <a href={`#${target.id}`}>Карточка термина</a>
              </p>
            )}
          </div>
          <div class="question__actions">
            <button
              type="button"
              class="button button--primary"
              onClick={() => {
                setIndex(index + 1);
                reset();
              }}
            >
              {index + 1 < session.length ? 'Следующий вопрос' : 'Итог'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
