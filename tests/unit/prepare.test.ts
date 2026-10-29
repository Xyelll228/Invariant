import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { assembleOrder, normalizeOutput, prepareTopic, PrepareError, type PrepareInput } from '../../src/content/prepare.ts';
import { questionsFileSchema, topicSchema } from '../../src/content/schema.ts';
import { formatValue } from '../../src/lib/run/format-value.ts';
import { runFunction, runOutput } from '../../src/lib/run/node-run.ts';

describe('печать значений: как в песочнице', () => {
  it('formatValue совпадает с форматом worker-prefix.js на разных значениях', () => {
    const source = readFileSync(new URL('../../src/sandbox/worker-prefix.js', import.meta.url), 'utf8');
    const context = createContext({ self: { postMessage() {} }, console: {} });
    runInContext(`${source}\n;globalThis.__format = __invariant.format;`, context);
    // Значения строятся в каждом «мире» отдельно: instanceof Map не работает между контекстами.
    const expressions = [
      "'строка'",
      '42',
      '-0',
      '1.5',
      'null',
      'undefined',
      'true',
      '10n',
      "[1, 'два', [3]]",
      '({ a: 1, b: [2] })',
      'new Map([[1, 2]])',
      'new Set([1])',
      'Array.from({ length: 105 }, (_, index) => index)',
      '(function named() {})',
    ];
    for (const expression of expressions) {
      const value = new Function(`return ${expression};`)() as unknown;
      for (const depth of [0, 1]) {
        expect(formatValue(value, depth), expression).toBe(runInContext(`__format(${expression}, ${depth})`, context));
      }
    }
  });
});

describe('запуск кода заданий при сборке', () => {
  it('«Что выведет код»: строки консоли в формате песочницы', () => {
    expect(runOutput('console.log(0.1 + 0.2); console.log([1, 2], "a");')).toBe('0.30000000000000004\n[1, 2] a');
    expect(() => runOutput('throw new Error("сбой")')).toThrow(/сбой/);
    expect(() => runOutput('while (true) {}')).toThrow();
  });

  it('эталонное решение: результат, а если функция ничего не вернула — изменённый первый аргумент', () => {
    expect(runFunction('function f(a) { return a.length; }', 'f', [[1, 2, 3]])).toBe(3);
    expect(runFunction('function f(a) { a.reverse(); }', 'f', [[1, 2, 3]])).toEqual([3, 2, 1]);
    // Аргументы копируются: решение не портит данные тестов.
    const args = [[3, 1]];
    runFunction('function f(a) { a.sort(); }', 'f', args);
    expect(args).toEqual([[3, 1]]);
  });

  it('вывод сравнивается без пробелов в конце строк', () => {
    expect(normalizeOutput('a  \nb\n\n')).toBe('a\nb');
  });
});

const topic = topicSchema.parse({
  id: 'algo.sorting.bubble',
  version: 1,
  title: 'Т',
  module: 'algo.sorting',
  kind: 'concept',
  levels: ['fundament', 'base', 'depth'],
  summary: 'К.',
  review: { status: 'draft', date: '2026-10-27' },
});

function input(questions: unknown[]): PrepareInput {
  return {
    topic,
    dir: 'algorithms/sorting/x',
    questions: questionsFileSchema.parse({ topic: topic.id, questions }),
    levelPaths: {},
    blockPaths: new Map(),
  };
}

const base = { version: 1, level: 'fundament', role: 'practice', step: 1, skill: 'algo.sorting.bubble.s.x' };

describe('подготовка заданий: вычислимое вычисляется', () => {
  it('у «Что выведет код» с выбором верный вариант определяет запуск', () => {
    const prepared = prepareTopic(
      input([
        {
          ...base,
          id: 'algo.sorting.bubble.q.out',
          type: 'output',
          format: 'choice',
          prompt: 'Что выведет код?',
          code: 'console.log(1 + "1");',
          options: [{ text: '2', misconception: 'algo.sorting.bubble.m.x' }, { text: '11' }],
        },
      ]),
    );
    const question = prepared.questions[0];
    expect(question?.format === 'choice' && question.options.map((option) => option.correct)).toEqual([false, true]);
  });

  it('если ни один вариант не совпал с выводом — ошибка сборки с понятным текстом', () => {
    expect(() =>
      prepareTopic(
        input([{ ...base, id: 'algo.sorting.bubble.q.out', type: 'output', format: 'choice', prompt: 'Что?', code: 'console.log(3)', options: [{ text: '1' }, { text: '2' }] }]),
      ),
    ).toThrow(PrepareError);
  });

  it('у свободного ответа «Что выведет код» ответ — вывод кода', () => {
    const prepared = prepareTopic(input([{ ...base, id: 'algo.sorting.bubble.q.out', type: 'output', format: 'free', prompt: 'Что?', code: 'console.log([1, 2].map((x) => x * 2))' }]));
    const question = prepared.questions[0];
    expect(question?.format === 'free' && question.answers).toEqual(['[2, 4]']);
  });

  it('задание с кодом: ожидаемые ответы тестов — по эталонному решению', () => {
    const prepared = prepareTopic(
      input([
        {
          ...base,
          step: 4,
          id: 'algo.sorting.bubble.q.code',
          type: 'write',
          format: 'code',
          prompt: 'Напишите.',
          function: 'double',
          starter: 'function double(x) {}',
          solution: 'function double(x) { return x * 2; }',
          tests: [[2], [5]],
          hidden: [[0]],
        },
      ]),
    );
    const question = prepared.questions[0];
    if (question?.format !== 'code') throw new Error('не задание с кодом');
    expect(question.visibleTests.map((test) => [test.call, test.expectedText])).toEqual([
      ['double(2)', '4'],
      ['double(5)', '10'],
    ]);
    expect(question.hiddenTests).toEqual([{ args: [0], expected: 0 }]);
  });

  it('задача Парсонса: собранный код запускается и сверяется с эталоном', () => {
    const items = [
      { text: 'function sum(a) {', indent: 0 },
      { text: 'let s = 0;', indent: 1 },
      { text: 'for (const x of a) s += x;', indent: 1 },
      { text: 'return s;', indent: 1 },
      { text: '}', indent: 0 },
    ];
    expect(assembleOrder(items)).toBe('function sum(a) {\n  let s = 0;\n  for (const x of a) s += x;\n  return s;\n}');
    const ok = { ...base, step: 4, id: 'algo.sorting.bubble.q.p', type: 'parsons', format: 'order', prompt: 'Соберите.', indent: true, items, function: 'sum', solution: 'function sum(a) { return a.reduce((x, y) => x + y, 0); }', tests: [[[1, 2, 3]]] };
    expect(() => prepareTopic(input([ok]))).not.toThrow();
    const broken = { ...ok, items: items.map((item) => (item.text === 'return s;' ? { ...item, text: 'return s + 1;' } : item)) };
    expect(() => prepareTopic(input([broken]))).toThrow(/собранный из строк код на \[\[1,2,3\]\] даёт 7, а эталон — 6/);
  });
});
