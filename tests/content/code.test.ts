/**
 * Автопроверки кода тем (ТЗ, раздел «Качество», таблица «Автопроверки»):
 * запуск всего кода (эталон на JS, версии на C++ и Python на общих данных),
 * свойства на случайных данных, мутанты, эксперимент удвоения,
 * утверждения текста, которые проверяет код (facts.ts), и однозначность
 * заданий генераторов на 1000 вариантов.
 *
 * Всё это — и для основного кода темы, и для её вариантов (code.variants
 * в topic.yaml): например, вставка сдвигами и бинарные вставки.
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
import { questionsFileSchema, topicSchema, type ComplexityClass } from '../../src/content/schema.ts';
import { expectedRatio, measureDoubling } from '../../src/lib/doubling.ts';
import type { TopicFact } from '../../src/lib/facts.ts';
import { createRandom, type Random } from '../../src/lib/random.ts';
import { runFunction } from '../../src/lib/run/node-run.ts';
import { recordTrace, replayArray, type TraceSink } from '../../src/lib/trace.ts';
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

/** Основной код темы или его вариант: всё, что проверяется одинаково. */
interface Implementation {
  /** Пусто у основного кода, id варианта — у варианта. */
  variant: string | null;
  title: string;
  js: string;
  cpp: string;
  py: string;
  cppFile: string;
  pyFile: string;
  shown: readonly string[] | undefined;
  stable: boolean;
  complexity: { best: ComplexityClass; average: ComplexityClass; worst: ComplexityClass } | undefined;
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

/** Сохраняет ли сортировка порядок записей с равными ключами. */
function keepsOrder(result: readonly { key: number; index: number }[]): boolean {
  return result.every((record, position) => {
    const previous = result[position - 1];
    return !previous || previous.key < record.key || (previous.key === record.key && previous.index < record.index);
  });
}

function run(command: string, args: string[], input: string): string {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} завершился с кодом ${result.status}:\n${result.stderr}`);
  }
  return result.stdout;
}

const DOUBLING_TOLERANCE = 0.15;
const GENERATOR_VARIANTS = 1000;

for (const dir of topicDirs(content)) {
  const topic = topicSchema.parse(parseYaml(readFileSync(join(dir, 'topic.yaml'), 'utf8')));
  const code = topic.code;
  if (!code) continue;

  const reference = (await import(pathToFileURL(join(dir, 'reference.ts')).href)) as Record<string, unknown>;
  const { mutants } = (await import(pathToFileURL(join(dir, 'mutants.ts')).href)) as { mutants: Mutant[] };
  const vectors = (JSON.parse(readFileSync(join(dir, 'vectors.json'), 'utf8')) as { inputs: number[][] }).inputs;
  const variantCode = (reference.variantCode ?? {}) as Record<string, readonly string[]>;
  const implementations: Implementation[] = [
    {
      variant: null,
      title: 'основной код',
      js: code.js,
      cpp: code.cpp,
      py: code.py,
      cppFile: join(dir, 'impl.cpp'),
      pyFile: join(dir, 'impl.py'),
      shown: reference.code as readonly string[] | undefined,
      stable: topic.properties?.stable === true,
      complexity: topic.complexity?.time,
    },
    ...code.variants.map((variant) => ({
      variant: variant.id,
      title: `вариант «${variant.title}»`,
      js: variant.js,
      cpp: variant.cpp,
      py: variant.py,
      cppFile: join(dir, `impl.${variant.id}.cpp`),
      pyFile: join(dir, `impl.${variant.id}.py`),
      shown: variantCode[variant.id],
      stable: variant.stable === true,
      complexity: variant.complexity ?? topic.complexity?.time,
    })),
  ];

  describe(`${topic.title} (${topic.id})`, () => {
    for (const impl of implementations) {
      const sort = reference[impl.js] as SortNumbers;
      const sortBy = reference[`${impl.js}By`] as SortBy;

      describe(impl.title, () => {
        it('эталон экспортирует функции и сортирует общие тестовые данные', () => {
          expect(typeof sort, `функция ${impl.js} в reference.ts`).toBe('function');
          expect(typeof sortBy, `функция ${impl.js}By в reference.ts`).toBe('function');
          for (const input of vectors) {
            const copy = [...input];
            expect(sort(input), JSON.stringify(input)).toEqual(sorted(input));
            expect(input, 'эталон не меняет исходный массив').toEqual(copy);
          }
        });

        it('код, который видит ученик, запускается и даёт тот же результат, что эталон', () => {
          const shown = impl.shown?.join('\n');
          expect(shown, impl.variant ? `variantCode.${impl.variant} в reference.ts` : 'экспорт code в reference.ts').toBeTruthy();
          for (const input of vectors) {
            expect(runFunction(shown as string, impl.js, [input]), JSON.stringify(input)).toEqual(sorted(input));
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

        if (impl.stable) {
          it('устойчивость: элементы с равными ключами сохраняют порядок', () => {
            fc.assert(
              fc.property(fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 40 }), (keys) =>
                keepsOrder(sortBy(keys.map((key, index) => ({ key, index })), (record) => record.key)),
              ),
              { numRuns: 300, seed: 20261024 },
            );
          });
        }

        it('версия на C++ даёт тот же результат (предупреждения как ошибки, санитайзеры)', () => {
          const binary = join(work, `${topic.id}.${impl.variant ?? 'main'}.cpp.out`);
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
              `-DINVARIANT_FUNCTION=${impl.cpp}`,
              impl.cppFile,
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
          const output = run('python3', ['-B', join(repo, 'scripts', 'harness', 'sort_numbers.py'), impl.pyFile, impl.py], `${input}\n`);
          const results = output.trim() === '' ? [] : output.trim().split('\n').map((line) => JSON.parse(line) as number[]);
          expect(results).toEqual(vectors.map(sorted));
        });

        if (impl.complexity && code.cases) {
          const complexity = impl.complexity;
          const cases = code.cases;
          for (const name of ['best', 'average', 'worst'] as const) {
            it(`эксперимент удвоения: ${name} — ${complexity[name]} (данные: ${cases[name]})`, () => {
              // Те же замеры, что в таблице «Измерение» на странице темы (src/lib/doubling.ts).
              const rows = measureDoubling(sort, cases[name]);
              const report: string[] = [];
              for (let index = 1; index < rows.length; index++) {
                const n = rows[index - 1]?.n as number;
                const measured = rows[index]?.ratio ?? Number.POSITIVE_INFINITY;
                const expected = expectedRatio(complexity[name], n);
                const deviation = Math.abs(measured / expected - 1);
                report.push(`n=${n}→${2 * n}: отношение ${measured.toFixed(3)}, ожидается ${expected.toFixed(3)}`);
                expect(deviation, report.join('; ')).toBeLessThanOrEqual(DOUBLING_TOLERANCE);
              }
            });
          }
        }
      });
    }

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
              fc.property(fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 30 }), (keys) =>
                keepsOrder(mutant.sortBy(keys.map((key, index) => ({ key, index })), (record) => record.key)),
              ),
              { numRuns: 300, seed: 1 },
            ).failed);
        if (!failsOnVectors && !failsOnProperties) survivors.push(`${mutant.id}: ${mutant.description}`);
      }
      expect(survivors, 'мутанты, которых не ловит ни один тест — тесты слабые').toEqual([]);
    });
  });
}

// Утверждения из текстов тем, которые можно проверить кодом (facts.ts): например,
// «число обменов равно числу инверсий». Проверяются на общих тестовых данных,
// на случайных массивах с повторами и перебором, если он задан.
for (const dir of topicDirs(content)) {
  const factsFile = join(dir, 'facts.ts');
  if (!existsSync(factsFile)) continue;
  const topicId = (parseYaml(readFileSync(join(dir, 'topic.yaml'), 'utf8')) as { id: string }).id;
  const { facts } = (await import(pathToFileURL(factsFile).href)) as { facts: TopicFact[] };
  const vectorsFile = join(dir, 'vectors.json');
  const vectors = existsSync(vectorsFile) ? (JSON.parse(readFileSync(vectorsFile, 'utf8')) as { inputs: number[][] }).inputs : [];

  describe(`утверждения текста: ${topicId}`, () => {
    for (const fact of facts) {
      it(fact.claim, () => {
        expect(fact.holds || fact.check, 'у утверждения нет проверки holds или check').toBeTruthy();
        if (fact.holds) {
          const holds = fact.holds;
          for (const input of vectors) expect(holds(input), JSON.stringify(input)).toBe(true);
          fc.assert(
            fc.property(fc.array(fc.integer({ min: -20, max: 20 }), { maxLength: 40 }), (input) => holds(input)),
            { numRuns: 500, seed: 20261031 },
          );
        }
        if (fact.check) expect(fact.check()).toBe(true);
      });
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
    const checked = new Set<string>();
    for (const question of generatedQuestions) {
      if (question.format !== 'generated' || checked.has(question.generator)) continue;
      checked.add(question.generator);
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
