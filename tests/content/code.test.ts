/**
 * Автопроверки кода тем (ТЗ, раздел «Качество», таблица «Автопроверки»):
 * запуск всего кода (эталон на JS, версии на C++ и Python на общих данных),
 * свойства на случайных данных, мутанты, эксперимент удвоения и
 * однозначность заданий генераторов на 1000 вариантов.
 *
 * Запуск: npm run check:code. Нужны g++ и python3.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  type ComplexityClass,
  type InputKind,
  questionsFileSchema,
  topicSchema,
} from '../../src/content/schema.ts';
import { createRandom, type Random } from '../../src/lib/random.ts';
import { runFunction } from '../../src/lib/run/node-run.ts';
import { countOperations, recordTrace, replayArray, type TraceSink } from '../../src/lib/trace.ts';
import type { GeneratedVariant } from '../../src/lib/learning/question-types.ts';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const content = join(repo, 'content', 'ru');
const work = mkdtempSync(join(tmpdir(), 'invariant-code-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

type SortNumbers = (input: readonly number[], trace?: TraceSink) => number[];
type SortBy = <T>(input: readonly T[], key: (item: T) => number, trace?: TraceSink) => T[];
interface Mutant {
  id: string;
  description: string;
  sortBy: SortBy;
  code?: readonly string[];
  bugLine?: number;
}

function topicDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, 'topic.yaml'))) result.push(full);
    else result.push(...topicDirs(full));
  }
  return result;
}

const numericOrder = (a: number, b: number): number => a - b;
const sorted = (input: readonly number[]): number[] => [...input].sort(numericOrder);

function isNonDecreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as number) <= value);
}

/** Входные данные размера n для эксперимента удвоения. */
function inputOf(kind: InputKind, n: number, random: Random): number[] {
  switch (kind) {
    case 'sorted':
      return Array.from({ length: n }, (_, index) => index);
    case 'reversed':
      return Array.from({ length: n }, (_, index) => n - index);
    case 'equal':
      return Array.from({ length: n }, () => 7);
    case 'random':
      return random.shuffle(Array.from({ length: n }, (_, index) => index));
  }
}

/** Рост числа операций при переходе от n к 2n для класса сложности. */
function growth(complexity: ComplexityClass, n: number): number {
  switch (complexity) {
    case '1':
      return 1;
    case 'log n':
      return Math.log2(n);
    case 'n':
      return n;
    case 'n log n':
      return n * Math.log2(n);
    case 'n^2':
      return n * n;
    case 'n^3':
      return n ** 3;
    case '2^n':
      return 2 ** Math.min(n, 1000);
  }
}

function run(command: string, args: string[], input: string): string {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} завершился с кодом ${result.status}:\n${result.stderr}`);
  }
  return result.stdout;
}

const DOUBLING_SIZES = [128, 256, 512, 1024];
const DOUBLING_TOLERANCE = 0.15;
const RANDOM_REPEATS = 5;
const GENERATOR_VARIANTS = 1000;

for (const dir of topicDirs(content)) {
  const topic = topicSchema.parse(parseYaml(readFileSync(join(dir, 'topic.yaml'), 'utf8')));
  const code = topic.code;
  if (!code) continue;

  const reference = (await import(pathToFileURL(join(dir, 'reference.ts')).href)) as Record<string, unknown>;
  const sort = reference[code.js] as SortNumbers;
  const sortBy = reference[`${code.js}By`] as SortBy;
  const { mutants } = (await import(pathToFileURL(join(dir, 'mutants.ts')).href)) as { mutants: Mutant[] };
  const vectors = (JSON.parse(readFileSync(join(dir, 'vectors.json'), 'utf8')) as { inputs: number[][] }).inputs;

  describe(`${topic.title} (${topic.id})`, () => {
    it('эталон экспортирует функции и сортирует общие тестовые данные', () => {
      expect(typeof sort).toBe('function');
      expect(typeof sortBy).toBe('function');
      for (const input of vectors) {
        const copy = [...input];
        expect(sort(input), JSON.stringify(input)).toEqual(sorted(input));
        expect(input, 'эталон не меняет исходный массив').toEqual(copy);
      }
    });

    it('код, который видит ученик, запускается и даёт тот же результат, что эталон', () => {
      const shown = (reference.code as readonly string[] | undefined)?.join('\n');
      expect(shown, 'экспорт code в reference.ts').toBeTruthy();
      for (const input of vectors) {
        expect(runFunction(shown as string, code.js, [input]), JSON.stringify(input)).toEqual(sorted(input));
      }
    });

    it('код испорченных версий для «Найти ошибку»: ведёт себя как мутант, падает на тестах, отличается в строке с ошибкой', () => {
      const shownReference = reference.code as readonly string[];
      for (const mutant of mutants.filter((item) => item.code)) {
        const lines = mutant.code as readonly string[];
        const differing = lines.flatMap((line, index) => (line !== shownReference[index] ? [index + 1] : []));
        expect(differing, `${mutant.id}: отличается от эталона только строкой bugLine`).toEqual([mutant.bugLine]);
        let fails = false;
        for (const input of vectors) {
          const got = runFunction(lines.join('\n'), code.js, [input]);
          expect(got, `${mutant.id} на ${JSON.stringify(input)}: код и мутант ведут себя одинаково`).toEqual(mutant.sortBy(input, (x) => x));
          if (JSON.stringify(got) !== JSON.stringify(sorted(input))) fails = true;
        }
        expect(fails, `${mutant.id}: код с ошибкой должен падать хотя бы на одном тесте`).toBe(true);
      }
    });

    it('след эталона воспроизводит результат: обмены и записи дают тот же массив', () => {
      for (const input of vectors) {
        const { result, events } = recordTrace((sink) => sort(input, sink));
        expect(replayArray(input, events), JSON.stringify(input)).toEqual(result);
      }
    });

    it('свойства на случайных данных: результат упорядочен и является перестановкой входа', () => {
      fc.assert(
        fc.property(fc.array(fc.integer({ min: -1000, max: 1000 }), { maxLength: 60 }), (input) => {
          const result = sort(input);
          return isNonDecreasing(result) && JSON.stringify(sorted(result)) === JSON.stringify(sorted(input));
        }),
        { numRuns: 300, seed: 20261024 },
      );
    });

    if (topic.properties?.stable) {
      it('устойчивость: элементы с равными ключами сохраняют порядок', () => {
        fc.assert(
          fc.property(fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 40 }), (keys) => {
            const records = keys.map((key, index) => ({ key, index }));
            const result = sortBy(records, (record) => record.key);
            return result.every((record, position) => {
              const previous = result[position - 1];
              return !previous || previous.key < record.key || (previous.key === record.key && previous.index < record.index);
            });
          }),
          { numRuns: 300, seed: 20261024 },
        );
      });
    }

    it('версия на C++ даёт тот же результат (предупреждения как ошибки, санитайзеры)', () => {
      const binary = join(work, `${topic.id}.cpp.out`);
      run(
        'g++',
        [
          '-std=c++20',
          '-O1',
          '-g',
          '-Wall',
          '-Wextra',
          '-Wpedantic',
          '-Werror',
          '-fsanitize=address,undefined',
          '-fno-sanitize-recover=all',
          `-DINVARIANT_FUNCTION=${code.cpp}`,
          join(dir, 'impl.cpp'),
          join(repo, 'scripts', 'harness', 'sort_numbers.cpp'),
          '-o',
          binary,
        ],
        '',
      );
      const input = vectors.map((vector) => [vector.length, ...vector].join(' ')).join('\n');
      const lines = run(binary, [], `${input}\n`).split('\n').slice(0, vectors.length);
      expect(lines).toEqual(vectors.map((vector) => sorted(vector).join(' ')));
    });

    it('версия на Python даёт тот же результат', () => {
      const input = vectors.map((vector) => JSON.stringify(vector)).join('\n');
      const output = run('python3', ['-B', join(repo, 'scripts', 'harness', 'sort_numbers.py'), join(dir, 'impl.py'), code.py], `${input}\n`);
      const results = output.trim() === '' ? [] : output.trim().split('\n').map((line) => JSON.parse(line) as number[]);
      expect(results).toEqual(vectors.map(sorted));
    });

    it(`каждый мутант падает хотя бы на одном тесте (мутантов: ${mutants.length})`, () => {
      const survivors: string[] = [];
      for (const mutant of mutants) {
        const failsOnVectors = vectors.some((input) => JSON.stringify(mutant.sortBy(input, (x) => x)) !== JSON.stringify(sorted(input)));
        const failsOnProperties =
          fc.check(
            fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 30 }), (input) =>
              isNonDecreasing(mutant.sortBy(input, (x) => x)),
            ),
            { numRuns: 300, seed: 1 },
          ).failed ||
          (topic.properties?.stable === true &&
            fc.check(
              fc.property(fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 30 }), (keys) => {
                const records = keys.map((key, index) => ({ key, index }));
                const result = mutant.sortBy(records, (record) => record.key);
                return result.every((record, position) => {
                  const previous = result[position - 1];
                  return !previous || previous.key < record.key || (previous.key === record.key && previous.index < record.index);
                });
              }),
              { numRuns: 300, seed: 1 },
            ).failed);
        if (!failsOnVectors && !failsOnProperties) survivors.push(`${mutant.id}: ${mutant.description}`);
      }
      expect(survivors, 'мутанты, которых не ловит ни один тест — тесты слабые').toEqual([]);
    });

    if (topic.complexity && code.cases) {
      const complexity = topic.complexity.time;
      const cases = code.cases;
      for (const name of ['best', 'average', 'worst'] as const) {
        it(`эксперимент удвоения: ${name} — ${complexity[name]} (данные: ${cases[name]})`, () => {
          const measure = (n: number): number => {
            const repeats = cases[name] === 'random' ? RANDOM_REPEATS : 1;
            let total = 0;
            for (let seed = 1; seed <= repeats; seed++) {
              const input = inputOf(cases[name], n, createRandom(seed * 7919 + n));
              total += countOperations(recordTrace((sink) => sort(input, sink)).events).total;
            }
            return total / repeats;
          };
          const operations = DOUBLING_SIZES.map(measure);
          const report: string[] = [];
          for (let index = 1; index < DOUBLING_SIZES.length; index++) {
            const n = DOUBLING_SIZES[index - 1] as number;
            const previous = operations[index - 1] as number;
            const current = operations[index] as number;
            const measured = previous === 0 ? Number.POSITIVE_INFINITY : current / previous;
            const expected = growth(complexity[name], 2 * n) / growth(complexity[name], n);
            const deviation = Math.abs(measured / expected - 1);
            report.push(`n=${n}→${2 * n}: отношение ${measured.toFixed(3)}, ожидается ${expected.toFixed(3)}`);
            expect(deviation, report.join('; ')).toBeLessThanOrEqual(DOUBLING_TOLERANCE);
          }
        });
      }
    }
  });
}

for (const dir of topicDirs(content)) {
  const questionsFile = join(dir, 'questions.yaml');
  if (!existsSync(questionsFile)) continue;
  const data = questionsFileSchema.parse(parseYaml(readFileSync(questionsFile, 'utf8')));
  const generatedQuestions = data.questions.filter((question) => question.format === 'generated');
  if (generatedQuestions.length === 0) continue;
  const generators = (await import(pathToFileURL(join(dir, 'generators.ts')).href)) as Record<string, (random: Random) => GeneratedVariant>;
  const misconceptions = new Set(data.misconceptions.map((item) => item.id));

  describe(`генераторы заданий: ${data.topic}`, () => {
    for (const question of generatedQuestions) {
      if (question.format !== 'generated') continue;
      it(`${question.generator}: ${GENERATOR_VARIANTS} вариантов однозначны и воспроизводимы`, () => {
        const generate = generators[question.generator];
        expect(typeof generate, `функция ${question.generator}`).toBe('function');
        const failures: string[] = [];
        for (let seed = 1; seed <= GENERATOR_VARIANTS && failures.length < 5; seed++) {
          const variant = (generate as (random: Random) => GeneratedVariant)(createRandom(seed));
          const again = (generate as (random: Random) => GeneratedVariant)(createRandom(seed));
          if (JSON.stringify(variant) !== JSON.stringify(again)) failures.push(`зерно ${seed}: вариант не воспроизводится`);
          if (!('prompt' in variant) || !variant.prompt.trim()) failures.push(`зерно ${seed}: пустое условие`);
          if (variant.format === 'choice') {
            const correct = variant.options.filter((option) => option.correct).length;
            if (!variant.multiple && correct !== 1) failures.push(`зерно ${seed}: верных вариантов ${correct}`);
            const texts = variant.options.map((option) => option.text);
            if (new Set(texts).size !== texts.length) failures.push(`зерно ${seed}: варианты повторяются: ${texts.join(' | ')}`);
            for (const option of variant.options) {
              if (!option.correct && (!option.misconception || !misconceptions.has(option.misconception))) {
                failures.push(`зерно ${seed}: у неверного варианта ${option.text} нет заблуждения из questions.yaml`);
              }
            }
          } else if (variant.format === 'free') {
            if (variant.answers.length === 0 || variant.answers.some((answer) => !answer.trim())) failures.push(`зерно ${seed}: нет верного ответа`);
          } else {
            failures.push(`зерно ${seed}: формат ${variant.format} генераторы пока не дают`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  });
}
