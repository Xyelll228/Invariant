/**
 * Упражнения прототипа песочницы. Ожидаемые ответы вычисляет эталон темы,
 * а не пишутся руками.
 */
import vectors from '../../../content/ru/algorithms/sorting/insertion-sort/vectors.json';
import { insertionSort } from '../../../content/ru/algorithms/sorting/insertion-sort/reference.ts';
import { createRandom } from '../random.ts';
import { formatArray } from '../viz/array-frames.ts';
import type { SandboxTest } from './client.ts';

export interface Exercise {
  functionName: string;
  starterCode: string;
  visibleTests: { args: unknown[]; expected: unknown; call: string; expectedText: string }[];
  hiddenTests: SandboxTest[];
}

export function insertionSortExercise(): Exercise {
  const visibleInputs = [[7, 3, 5, 1, 4], [], [2, 1]];
  const random = createRandom(20261024);
  const randomInputs = Array.from({ length: 10 }, () =>
    Array.from({ length: random.int(0, 30) }, () => random.int(-50, 50)),
  );
  const hiddenInputs = [...(vectors as { inputs: number[][] }).inputs, ...randomInputs];
  return {
    functionName: 'insertionSort',
    starterCode: ['function insertionSort(a) {', '  // Упорядочьте массив a по возрастанию и верните его.', '  return a;', '}', ''].join('\n'),
    visibleTests: visibleInputs.map((input) => {
      const expected = insertionSort(input);
      return { args: [input], expected, call: `insertionSort(${formatArray(input)})`, expectedText: formatArray(expected) };
    }),
    hiddenTests: hiddenInputs.map((input) => ({ args: [input], expected: insertionSort(input) })),
  };
}

/** Примеры кода, которые пытаются выйти из песочницы: для проверки изоляции. */
export const isolationExamples = [
  {
    label: 'прочитать хранилище',
    code: [
      '// Пробуем открыть базу приложения «invariant», где хранится прогресс.',
      'function probe() {',
      '  return new Promise((resolve) => {',
      '    let request;',
      '    try {',
      "      request = indexedDB.open('invariant');",
      '    } catch (error) {',
      "      resolve('IndexedDB приложения: нет доступа (' + error.name + ')');",
      '      return;',
      '    }',
      '    request.onerror = (event) => {',
      '      event.preventDefault();',
      "      resolve('IndexedDB приложения: нет доступа (' + request.error.name + ')');",
      '    };',
      '    request.onsuccess = () => {',
      '      const stores = Array.from(request.result.objectStoreNames);',
      '      request.result.close();',
      '      resolve(',
      '        stores.length === 0',
      "          ? 'IndexedDB: открылась пустая база песочницы, данных приложения в ней нет'",
      "          : 'IndexedDB приложения: видны хранилища ' + JSON.stringify(stores),",
      '      );',
      '    };',
      '  });',
      '}',
      '',
    ].join('\n'),
  },
  {
    label: 'отправить запрос в сеть',
    code: [
      'async function probe() {',
      '  const report = [];',
      '  try {',
      "    await fetch('https://example.org/');",
      "    report.push('fetch: запрос прошёл');",
      '  } catch (error) {',
      "    report.push('fetch: ' + error.message);",
      '  }',
      '  // Обход заглушки: настоящий fetch из прототипа. Режим no-cors: без CSP',
      '  // такой запрос прошёл бы и вернул непрозрачный ответ. Его останавливает CSP.',
      '  try {',
      "    await WorkerGlobalScope.prototype.fetch.call(self, 'https://example.org/', { mode: 'no-cors' });",
      "    report.push('fetch в обход заглушки: запрос прошёл');",
      '  } catch (error) {',
      "    report.push('fetch в обход заглушки: заблокирован (' + error.name + ')');",
      '  }',
      "  return report.join('; ');",
      '}',
      '',
    ].join('\n'),
  },
  {
    label: 'бесконечный цикл',
    code: ['function probe() {', '  let steps = 0;', '  while (true) {', '    steps++;', '  }', '}', ''].join('\n'),
  },
];
