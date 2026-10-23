/**
 * След алгоритма — последовательность событий одного формата (ТЗ, раздел
 * «Техническая архитектура»). Из него строятся анимация, ручная симуляция,
 * вопросы «что будет после k шагов», счётчики операций и проверка мутантов.
 */
export type TraceEvent =
  | { t: 'compare'; i: number; j: number }
  | { t: 'swap'; i: number; j: number }
  | { t: 'set'; i: number; value: number }
  | { t: 'visit'; node: string }
  | { t: 'line'; line: number } // текущая строка кода
  | { t: 'note'; text: string }; // пояснение шага для человека

export type TraceSink = (event: TraceEvent) => void;

/** Пустой приёмник: эталон без записи следа. */
export const noTrace: TraceSink = () => {};

/** Записывает след в массив. */
export function recordTrace<T>(run: (sink: TraceSink) => T): { result: T; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  const result = run((event) => events.push(event));
  return { result, events };
}

export interface OperationCounts {
  compares: number;
  swaps: number;
  sets: number;
  /** Сравнения + обмены + записи: главная метрика шага «Измерить». */
  total: number;
}

export function countOperations(events: readonly TraceEvent[]): OperationCounts {
  let compares = 0;
  let swaps = 0;
  let sets = 0;
  for (const event of events) {
    if (event.t === 'compare') compares++;
    else if (event.t === 'swap') swaps++;
    else if (event.t === 'set') sets++;
  }
  return { compares, swaps, sets, total: compares + swaps + sets };
}

/**
 * Применяет к массиву события swap и set из следа. Если след верен,
 * результат совпадает с тем, что вернул эталон.
 */
export function replayArray(input: readonly number[], events: readonly TraceEvent[]): number[] {
  const a = [...input];
  for (const event of events) {
    if (event.t === 'swap') {
      const left = a[event.i];
      const right = a[event.j];
      if (left === undefined || right === undefined) throw new Error(`Обмен вне массива: ${event.i}, ${event.j}`);
      a[event.i] = right;
      a[event.j] = left;
    } else if (event.t === 'set') {
      if (event.i < 0 || event.i >= a.length) throw new Error(`Запись вне массива: ${event.i}`);
      a[event.i] = event.value;
    }
  }
  return a;
}
