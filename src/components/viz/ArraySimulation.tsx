/**
 * Ручная симуляция: человек сам выполняет алгоритм — выбирает пару элементов
 * для обмена. Каждый шаг сверяется со следом эталона. При ошибке показывается
 * правильный шаг и причина; шаг можно повторить. Итог — число верных шагов.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';
import { recordTrace } from '../../lib/trace.ts';
import { arrayAlgorithms, type ArrayAlgorithmId } from '../../lib/viz/algorithms.ts';
import { buildFrames, expectedSwaps, formatArray } from '../../lib/viz/array-frames.ts';
import { limitsHint, parseArrayInput } from '../../lib/viz/input.ts';
import { ArrayBars } from './ArrayBars.tsx';
import './viz.css';

export interface SimulationStats {
  firstTry: number;
  errors: number;
  shown: number;
  steps: number;
}

export interface ArraySimulationProps {
  algorithm: ArrayAlgorithmId;
  input: number[];
  /** Вызывается один раз, когда массив упорядочен: итог для задания «Ручная симуляция». */
  onFinish?: (stats: SimulationStats) => void;
  /** В задании свои данные не вводятся: проверяется заданный вариант. */
  ownData?: boolean;
}

interface Feedback {
  kind: 'correct' | 'wrong' | 'shown';
  text: string;
}

export default function ArraySimulation({ algorithm, input: initialInput, onFinish, ownData = true }: ArraySimulationProps) {
  const spec = arrayAlgorithms[algorithm];
  const [input, setInput] = useState<number[]>(initialInput);
  const swaps = useMemo(
    () => expectedSwaps(buildFrames(input, recordTrace((sink) => spec.run(input, sink)).events)),
    [input, spec],
  );
  const [done, setDone] = useState(0);
  const [values, setValues] = useState<number[]>(initialInput);
  const [ids, setIds] = useState<number[]>(initialInput.map((_, index) => index));
  const [selection, setSelection] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [stats, setStats] = useState({ firstTry: 0, errors: 0, shown: 0 });
  const [failedCurrent, setFailedCurrent] = useState(false);
  const [draft, setDraft] = useState(initialInput.join(', '));
  const [inputError, setInputError] = useState<string | null>(null);
  const hintId = useId();

  const expected = swaps[done];
  const finished = done >= swaps.length;
  const reported = useRef(false);
  useEffect(() => {
    if (!finished || reported.current || !onFinish) return;
    reported.current = true;
    onFinish({ ...stats, steps: swaps.length });
  }, [finished, onFinish, stats, swaps.length]);

  const restart = (next: number[]) => {
    setInput(next);
    setValues(next);
    setIds(next.map((_, index) => index));
    setDone(0);
    setSelection([]);
    setFeedback(null);
    setStats({ firstTry: 0, errors: 0, shown: 0 });
    setFailedCurrent(false);
    reported.current = false;
  };

  const applySwap = (i: number, j: number) => {
    const nextValues = [...values];
    const nextIds = [...ids];
    [nextValues[i], nextValues[j]] = [nextValues[j] as number, nextValues[i] as number];
    [nextIds[i], nextIds[j]] = [nextIds[j] as number, nextIds[i] as number];
    setValues(nextValues);
    setIds(nextIds);
    setDone((value) => value + 1);
    setFailedCurrent(false);
  };

  const attempt = (pair: number[]) => {
    if (!expected || pair.length !== 2) return;
    const [a, b] = pair as [number, number];
    const left = values[expected.i] as number;
    const right = values[expected.j] as number;
    if ((a === expected.i && b === expected.j) || (a === expected.j && b === expected.i)) {
      if (!failedCurrent) setStats((value) => ({ ...value, firstTry: value.firstTry + 1 }));
      setFeedback({ kind: 'correct', text: `Верно: меняем местами ${left} и ${right}.` });
      applySwap(expected.i, expected.j);
    } else {
      setStats((value) => ({ ...value, errors: value.errors + 1 }));
      setFailedCurrent(true);
      setFeedback({
        kind: 'wrong',
        text: `Неверно: обмен ${values[a]} и ${values[b]} сейчас не нужен. Правильный шаг — поменять местами ${left} и ${right} (индексы ${expected.i} и ${expected.j}). ${expected.reason} Попробуйте ещё раз.`,
      });
    }
    setSelection([]);
  };

  const select = (index: number) => {
    if (finished) return;
    if (selection.includes(index)) {
      setSelection(selection.filter((item) => item !== index));
      return;
    }
    const next = [...selection, index];
    if (next.length === 2) attempt(next);
    else setSelection(next);
  };

  const showStep = () => {
    if (!expected) return;
    const left = values[expected.i] as number;
    const right = values[expected.j] as number;
    setStats((value) => ({ ...value, shown: value.shown + 1 }));
    setFeedback({ kind: 'shown', text: `Правильный шаг: поменять местами ${left} и ${right}. ${expected.reason}` });
    setSelection([]);
    applySwap(expected.i, expected.j);
  };

  const applyInput = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseArrayInput(draft, { minLength: 3, maxLength: 8, min: 0, max: 99 });
    if (!result.ok) {
      setInputError(result.error);
      return;
    }
    setInputError(null);
    restart(result.values);
  };

  return (
    <section class="viz" aria-label={`Ручная симуляция: ${spec.title}`}>
      <p>
        Выполните алгоритм сами: нажмите на два элемента, которые нужно поменять местами следующими. Выбор снимается
        повторным нажатием.
      </p>
      <ArrayBars
        values={values}
        ids={ids}
        selected={selection}
        {...(finished ? {} : { onSelect: select })}
        label={`Массив ${formatArray(values)}`}
      />
      <p class="viz__counters" aria-live="polite">
        <span>
          Шагов сделано: <b>{done}</b> из <b>{swaps.length}</b>
        </span>
        <span>
          Верно с первой попытки: <b>{stats.firstTry}</b>
        </span>
        <span>
          Ошибок: <b>{stats.errors}</b>
        </span>
      </p>
      {feedback && (
        <div class="viz-feedback" role="status">
          <p>{feedback.text}</p>
        </div>
      )}
      {finished && (
        <div class="viz-feedback" role="status">
          <p>
            {swaps.length === 0
              ? 'Массив уже упорядочен: обменов не нужно.'
              : `Готово: массив упорядочен. Верных шагов с первой попытки — ${stats.firstTry} из ${swaps.length}, ошибок — ${stats.errors}, показанных шагов — ${stats.shown}.`}
          </p>
        </div>
      )}
      <div class="viz__controls">
        <button type="button" class="button" onClick={showStep} disabled={finished}>
          Показать правильный шаг
        </button>
        <button type="button" class="button" onClick={() => restart(input)}>
          Начать заново
        </button>
      </div>
      {ownData && (
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
          Начать с этими данными
        </button>
        <p id={hintId} class={inputError ? 'viz-own-data__hint is-error' : 'viz-own-data__hint muted'}>
          {inputError ?? limitsHint({ minLength: 3, maxLength: 8, min: 0, max: 99 })}
        </p>
      </form>
      )}
    </section>
  );
}
