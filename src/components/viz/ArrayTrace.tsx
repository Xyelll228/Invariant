/**
 * Визуализация массива по следу эталона: шаги вперёд и назад, в начало,
 * автопроигрывание, клавиши, режим предсказания, свои данные, описание шагов
 * для экранного диктора и таблица состояний вместо анимации.
 */
import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import type { TargetedKeyboardEvent, TargetedSubmitEvent } from 'preact';
import { recordTrace } from '../../lib/trace.ts';
import { arrayAlgorithms, type ArrayAlgorithmId } from '../../lib/viz/algorithms.ts';
import { buildFrames, formatArray, type ArrayFrame } from '../../lib/viz/array-frames.ts';
import { limitsHint, parseArrayInput } from '../../lib/viz/input.ts';
import { ArrayBars } from './ArrayBars.tsx';
import { CodePanel } from './CodePanel.tsx';
import { useReducedMotion } from './useReducedMotion.ts';
import './viz.css';

export interface ArrayTraceProps {
  algorithm: ArrayAlgorithmId;
  input: number[];
}

type Mode = 'watch' | 'predict';

type Question =
  | { kind: 'swap'; i: number; j: number; answer: boolean }
  | { kind: 'compare'; answer: [number, number] };

interface Feedback {
  correct: boolean;
  text: string;
}

const SPEEDS = [
  { value: 0.5, label: '0,5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
];

/** Вопрос перед шагом в режиме предсказания или null, если шаг очевиден. */
export function questionAt(frames: readonly ArrayFrame[], position: number): Question | null {
  const current = frames[position];
  const next = frames[position + 1];
  if (!current || !next) return null;
  if (current.step?.t === 'compare') {
    const { i, j } = current.step;
    return { kind: 'swap', i, j, answer: next.step?.t === 'swap' && next.step.i === i && next.step.j === j };
  }
  if (next.step?.t === 'compare') return { kind: 'compare', answer: [next.step.i, next.step.j] };
  return null;
}

export default function ArrayTrace({ algorithm, input: initialInput }: ArrayTraceProps) {
  const spec = arrayAlgorithms[algorithm];
  const [input, setInput] = useState<number[]>(initialInput);
  const frames = useMemo(() => buildFrames(input, recordTrace((sink) => spec.run(input, sink)).events), [input, spec]);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<Mode>('watch');
  const [question, setQuestion] = useState<Question | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState({ asked: 0, correct: 0 });
  const [showTable, setShowTable] = useState(false);
  const [draft, setDraft] = useState(initialInput.join(', '));
  const [inputError, setInputError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const hintId = useId();
  const speedId = useId();

  const frame = frames[Math.min(position, frames.length - 1)] as ArrayFrame;
  const atEnd = position >= frames.length - 1;

  useEffect(() => {
    if (!playing) return undefined;
    if (atEnd) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setPosition((value) => Math.min(value + 1, frames.length - 1)), 1200 / speed);
    return () => clearTimeout(timer);
  }, [playing, position, speed, atEnd, frames.length]);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  const resetQuestion = () => {
    setQuestion(null);
    setSelection([]);
    setFeedback(null);
  };

  const goTo = (next: number) => {
    resetQuestion();
    setPosition(Math.max(0, Math.min(next, frames.length - 1)));
  };

  const stopAndGo = (next: number) => {
    setPlaying(false);
    goTo(next);
  };

  const forward = () => {
    if (atEnd) return;
    if (feedback) {
      goTo(position + 1);
      return;
    }
    if (mode === 'predict' && !question) {
      const upcoming = questionAt(frames, position);
      if (upcoming) {
        setPlaying(false);
        setQuestion(upcoming);
        return;
      }
    }
    if (question) return;
    goTo(position + 1);
  };

  const answer = (correct: boolean, text: string) => {
    setScore((value) => ({ asked: value.asked + 1, correct: value.correct + (correct ? 1 : 0) }));
    setFeedback({ correct, text });
  };

  const answerSwap = (guess: boolean) => {
    if (question?.kind !== 'swap') return;
    const left = frame.values[question.i] as number;
    const right = frame.values[question.j] as number;
    const truth = question.answer
      ? `Поменяются: ${left} > ${right}.`
      : `Не поменяются: ${left} не больше ${right}.`;
    answer(guess === question.answer, guess === question.answer ? `Верно. ${truth}` : `Неверно. ${truth}`);
  };

  const checkCompare = () => {
    if (question?.kind !== 'compare' || selection.length !== 2) return;
    const [a, b] = question.answer;
    const correct = selection.includes(a) && selection.includes(b);
    const truth = `Сравнятся ${frame.values[a]} и ${frame.values[b]} (индексы ${a} и ${b}).`;
    answer(correct, correct ? `Верно. ${truth}` : `Неверно. ${truth}`);
  };

  const select = (index: number) => {
    setSelection((current) => {
      if (current.includes(index)) return current.filter((item) => item !== index);
      return current.length >= 2 ? [current[1] as number, index] : [...current, index];
    });
  };

  const onKeyDown = (event: TargetedKeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea')) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      forward();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stopAndGo(position - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      stopAndGo(0);
    } else if (event.key === ' ' && mode === 'watch' && !reducedMotion && target.closest('button') === null) {
      event.preventDefault();
      setPlaying((value) => !value);
    }
  };

  const applyInput = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseArrayInput(draft);
    if (!result.ok) {
      setInputError(result.error);
      return;
    }
    setInputError(null);
    setPlaying(false);
    resetQuestion();
    setScore({ asked: 0, correct: 0 });
    setInput(result.values);
    setPosition(0);
  };

  const compare = frame.step?.t === 'compare' ? ([frame.step.i, frame.step.j] as const) : null;
  const swap = frame.step?.t === 'swap' ? ([frame.step.i, frame.step.j] as const) : null;

  return (
    <section class="viz" aria-label={`Визуализация: ${spec.title}`} tabIndex={0} onKeyDown={onKeyDown}>
      <div class="viz__modes" role="group" aria-label="Режим">
        {(['watch', 'predict'] as const).map((value) => (
          <button
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setPlaying(false);
              resetQuestion();
            }}
          >
            {value === 'watch' ? 'Смотреть' : 'Предсказывать'}
          </button>
        ))}
      </div>

      <div class="viz__layout viz__layout--with-code">
        <div>
          <ArrayBars
            values={frame.values}
            ids={frame.ids}
            sorted={frame.regions.sorted ?? []}
            keyId={frame.pointers.key}
            compare={compare}
            swap={swap}
            selected={selection}
            {...(question?.kind === 'compare' && !feedback ? { onSelect: select } : {})}
            label={`Массив ${formatArray(frame.values)}`}
          />
          <p class="viz__description" aria-live="polite">
            {frame.description}
          </p>
          <p class="viz__counters">
            <span>
              Шаг <b>{position}</b> из <b>{frames.length - 1}</b>
            </span>
            <span>
              Сравнений: <b>{frame.counts.compares}</b>
            </span>
            <span>
              Обменов: <b>{frame.counts.swaps}</b>
            </span>
            {mode === 'predict' && (
              <span>
                Предсказаний верно: <b>{score.correct}</b> из <b>{score.asked}</b>
              </span>
            )}
          </p>
        </div>
        <CodePanel lines={spec.code} current={frame.line} label="Код алгоритма" />
      </div>

      {question && !feedback && question.kind === 'swap' && (
        <div class="viz-question">
          <p>
            <strong>Что произойдёт?</strong> Поменяются ли местами {frame.values[question.i]} и {frame.values[question.j]}?
          </p>
          <div class="button-row">
            <button type="button" class="button" onClick={() => answerSwap(true)}>
              Да, поменяются
            </button>
            <button type="button" class="button" onClick={() => answerSwap(false)}>
              Нет
            </button>
          </div>
        </div>
      )}

      {question && !feedback && question.kind === 'compare' && (
        <div class="viz-question">
          <p>
            <strong>Что произойдёт?</strong> Какие два элемента сравнятся дальше? Выберите их на рисунке.
          </p>
          <div class="button-row">
            <button type="button" class="button button--primary" disabled={selection.length !== 2} onClick={checkCompare}>
              Проверить
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div class="viz-feedback" role="status">
          <p>{feedback.text}</p>
        </div>
      )}

      <div class="viz__controls">
        <button type="button" class="button" onClick={() => stopAndGo(0)} disabled={position === 0}>
          <span aria-hidden="true">⏮</span>
          <span class="visually-hidden">В начало</span>
        </button>
        <button type="button" class="button" onClick={() => stopAndGo(position - 1)} disabled={position === 0}>
          ← Назад
        </button>
        <button type="button" class="button button--primary" onClick={forward} disabled={atEnd || (question !== null && !feedback)}>
          {feedback ? 'Дальше →' : 'Вперёд →'}
        </button>
        {mode === 'watch' && !reducedMotion && (
          <>
            <button type="button" class="button" onClick={() => setPlaying((value) => !value)} disabled={atEnd}>
              {playing ? 'Пауза' : 'Пуск'}
            </button>
            {/* Кнопки, а не <select>: WebKit оформляет список встроенным стилем, и строгая CSP его блокирует. */}
            <span class="viz__speed" role="group" aria-labelledby={speedId}>
              <span id={speedId}>Скорость</span>
              <span class="viz__modes viz__modes--inline">
                {SPEEDS.map((item) => (
                  <button type="button" aria-pressed={speed === item.value} onClick={() => setSpeed(item.value)}>
                    {item.label}
                  </button>
                ))}
              </span>
            </span>
          </>
        )}
      </div>
      <p class="viz__position">Клавиши: ← и → — шаги, Home — в начало{reducedMotion ? '' : ', пробел — пуск и пауза'}.</p>

      <form class="viz-own-data" onSubmit={applyInput}>
        <label>
          Свои данные
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
            aria-describedby={hintId}
            aria-invalid={inputError !== null}
          />
        </label>
        <button type="submit" class="button">
          Показать
        </button>
        <p id={hintId} class={inputError ? 'viz-own-data__hint is-error' : 'viz-own-data__hint muted'}>
          {inputError ?? limitsHint()}
        </p>
      </form>

      <p>
        <button type="button" class="button" aria-expanded={showTable} onClick={() => setShowTable((value) => !value)}>
          {showTable ? 'Скрыть таблицу шагов' : 'Показать таблицу шагов'}
        </button>
      </p>
      {showTable && (
        <div class="table-wrap viz-table" tabIndex={0} role="region" aria-label="Таблица шагов">
          <table>
            <thead>
              <tr>
                <th scope="col">Шаг</th>
                <th scope="col">Что происходит</th>
                <th scope="col">Массив</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((item) => (
                <tr aria-current={item.index === position ? 'step' : undefined}>
                  <td>{item.index}</td>
                  <td>{item.description}</td>
                  <td>{formatArray(item.values)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
