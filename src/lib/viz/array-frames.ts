/**
 * Кадры визуализации массива из следа эталона. Кадр — состояние после одного
 * шага: сравнения, обмена, записи или пояснения. События line, region и
 * pointer шагами не считаются: они меняют подсветку строки и отметки.
 *
 * Каждый элемент получает постоянный номер (его индекс во входном массиве),
 * поэтому отметки «упорядочено» и «ключ» едут вместе с элементом при обменах,
 * а анимация знает, какой столбик куда переместился.
 */
import type { TraceEvent } from '../trace.ts';

export type StepEvent = Extract<TraceEvent, { t: 'compare' | 'swap' | 'set' | 'note' }>;

export interface ArrayFrame {
  /** Номер кадра: 0 — начальное состояние. */
  index: number;
  values: number[];
  /** Постоянный номер элемента в каждой ячейке. */
  ids: number[];
  /** Шаг, который привёл к этому кадру; у начального кадра — null. */
  step: StepEvent | null;
  /** Строка кода (с 1), которая выполняется на этом шаге. */
  line: number | null;
  /** Номера элементов в именованных частях массива, например sorted. */
  regions: Record<string, number[]>;
  /** Номер элемента, на который смотрит именованный указатель, например key. */
  pointers: Record<string, number>;
  counts: { compares: number; swaps: number; sets: number };
  /** Описание шага для человека и экранного диктора. */
  description: string;
}

export function formatArray(values: readonly number[]): string {
  return `[${values.join(', ')}]`;
}

function describe(step: StepEvent, before: readonly number[]): string {
  switch (step.t) {
    case 'compare': {
      const left = before[step.i] as number;
      const right = before[step.j] as number;
      const relation = left > right ? `${left} > ${right}` : left < right ? `${left} < ${right}` : `${left} = ${right}`;
      return `Сравниваем ${left} и ${right}: ${relation}.`;
    }
    case 'swap':
      return `Меняем местами ${before[step.i]} и ${before[step.j]}.`;
    case 'set':
      return `Записываем ${step.value} в ячейку с индексом ${step.i}.`;
    case 'note':
      return step.text;
  }
}

export function buildFrames(input: readonly number[], events: readonly TraceEvent[]): ArrayFrame[] {
  let values = [...input];
  let ids = input.map((_, index) => index);
  let line: number | null = null;
  let regions: Record<string, number[]> = {};
  let pointers: Record<string, number> = {};
  const counts = { compares: 0, swaps: 0, sets: 0 };

  const frames: ArrayFrame[] = [
    {
      index: 0,
      values: [...values],
      ids: [...ids],
      step: null,
      line: null,
      regions: {},
      pointers: {},
      counts: { ...counts },
      description: `Начало: массив ${formatArray(values)}.`,
    },
  ];

  for (const event of events) {
    if (event.t === 'line') {
      line = event.line;
      continue;
    }
    if (event.t === 'region') {
      regions = { ...regions, [event.name]: ids.slice(event.from, event.to) };
      continue;
    }
    if (event.t === 'pointer') {
      const next = { ...pointers };
      const id = event.i === null ? undefined : ids[event.i];
      if (id === undefined) delete next[event.name];
      else next[event.name] = id;
      pointers = next;
      continue;
    }
    if (event.t === 'visit') continue;

    const before = values;
    if (event.t === 'compare') {
      counts.compares++;
    } else if (event.t === 'swap') {
      counts.swaps++;
      values = [...values];
      ids = [...ids];
      [values[event.i], values[event.j]] = [values[event.j] as number, values[event.i] as number];
      [ids[event.i], ids[event.j]] = [ids[event.j] as number, ids[event.i] as number];
    } else if (event.t === 'set') {
      counts.sets++;
      values = [...values];
      values[event.i] = event.value;
    }
    frames.push({
      index: frames.length,
      values: [...values],
      ids: [...ids],
      step: event,
      line,
      regions,
      pointers,
      counts: { ...counts },
      description: describe(event, before),
    });
  }
  return frames;
}

/** Обмены по порядку — ожидаемые действия ученика в ручной симуляции. */
export interface ExpectedSwap {
  i: number;
  j: number;
  /** Почему именно этот обмен: пояснение текущего этапа и результат сравнения. */
  reason: string;
}

export function expectedSwaps(frames: readonly ArrayFrame[]): ExpectedSwap[] {
  const result: ExpectedSwap[] = [];
  let note = '';
  let lastCompare: { text: string; i: number; j: number } | null = null;
  for (const frame of frames) {
    const step = frame.step;
    if (!step) continue;
    if (step.t === 'note') note = step.text;
    if (step.t === 'compare') lastCompare = { text: frame.description, i: step.i, j: step.j };
    if (step.t === 'swap') {
      const compared = lastCompare && lastCompare.i === step.i && lastCompare.j === step.j ? ` ${lastCompare.text}` : '';
      result.push({ i: step.i, j: step.j, reason: `${note}${compared}`.trim() });
    }
  }
  return result;
}

/** Этап алгоритма: пояснение из следа и итог этапа — для разбора по шагам. */
export interface TraceStage {
  text: string;
  compares: number;
  swaps: number;
  sets: number;
  after: number[];
}

/**
 * Делит кадры на этапы по пояснениям (событиям note). Этап без действий —
 * например, финальное «Готово» — не показывается.
 */
export function stagesOf(frames: readonly ArrayFrame[]): TraceStage[] {
  const stages: TraceStage[] = [];
  let current: TraceStage | null = null;
  let actions = 0;
  const close = () => {
    if (current && actions > 0) stages.push(current);
  };
  for (const frame of frames) {
    const step = frame.step;
    if (!step) continue;
    if (step.t === 'note') {
      close();
      current = { text: step.text, compares: 0, swaps: 0, sets: 0, after: [...frame.values] };
      actions = 0;
      continue;
    }
    if (!current) continue;
    actions++;
    if (step.t === 'compare') current.compares++;
    if (step.t === 'swap') current.swaps++;
    if (step.t === 'set') current.sets++;
    current.after = [...frame.values];
  }
  close();
  return stages;
}
