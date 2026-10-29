/**
 * Подготовка заданий темы при сборке: из questions.yaml — в данные для
 * браузера (src/lib/learning/question-types.ts). Всё, что можно вычислить,
 * вычисляется здесь:
 *
 * - «Что выведет код» — запуском кода (верный вариант или ответ не пишутся руками);
 * - ожидаемые результаты тестов к заданиям с кодом — по эталонному решению;
 * - код и строка с ошибкой для «Найти ошибку» — из испорченной версии эталона.
 *
 * Работает в Node: его вызывают страницы при сборке и проверка контента.
 */
import { formatValue } from '../lib/run/format-value.ts';
import { RunError, runFunction, runOutput } from '../lib/run/node-run.ts';
import type {
  PreparedMisconception,
  PreparedOption,
  PreparedQuestion,
  PreparedTopic,
} from '../lib/learning/question-types.ts';
import { levelSteps } from './rules.ts';
import type { Level, Question, QuestionsFile, Topic } from './schema.ts';

/** Испорченная версия эталона с кодом для показа (mutants.ts). */
export interface MutantLike {
  id: string;
  description: string;
  /** Код испорченной версии, как его видит ученик. */
  code?: readonly string[];
  /** Номер строки с ошибкой в code, с единицы. */
  bugLine?: number;
}

export interface PrepareInput {
  topic: Topic;
  /** Папка темы относительно content/ru. */
  dir: string;
  questions: QuestionsFile | null;
  levelPaths: Partial<Record<Level, string>>;
  /** Адреса блоков без base. */
  blockPaths: ReadonlyMap<string, string>;
  /** Экспорт reference.ts темы: эталон для заданий с кодом. */
  reference?: Record<string, unknown>;
  mutants?: readonly MutantLike[];
  /** Входные массивы из vectors.json. */
  vectors?: readonly unknown[][];
}

export class PrepareError extends Error {
  readonly questionId: string;

  constructor(questionId: string, message: string) {
    super(`${questionId}: ${message}`);
    this.questionId = questionId;
  }
}

/** Как показать значение в условии теста: строки — в кавычках, массивы — через запятую. */
export function showValue(value: unknown): string {
  return formatValue(value, 1);
}

/** Сравнение вывода без учёта пробелов в конце строк и пустых строк в конце. */
export function normalizeOutput(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

type WithSolution = { id: string; solution?: string; function?: string };

/** Код задачи Парсонса в верном порядке: отступ — два пробела на шаг. */
export function assembleOrder(items: readonly { text: string; indent: number }[]): string {
  return items.map((item) => `${'  '.repeat(item.indent)}${item.text}`).join('\n');
}

function expectedFor(question: WithSolution, input: PrepareInput, args: readonly unknown[]): unknown {
  if (!question.solution || !question.function) throw new PrepareError(question.id, 'нет эталонного решения solution или имени функции function');
  if (question.solution === 'reference') {
    const name = input.topic.code?.js;
    const run = name ? input.reference?.[name] : undefined;
    if (typeof run !== 'function') throw new PrepareError(question.id, 'solution: reference, но у темы нет эталона с функцией из code.js');
    const copy = JSON.parse(JSON.stringify(args)) as unknown[];
    const result = (run as (...values: unknown[]) => unknown)(...copy);
    return JSON.parse(JSON.stringify(result === undefined ? copy[0] : result));
  }
  try {
    return runFunction(question.solution, question.function, args);
  } catch (error) {
    throw new PrepareError(question.id, (error as Error).message);
  }
}

function prepareOne(question: Question, input: PrepareInput): PreparedQuestion {
  const base = {
    id: question.id,
    version: question.version,
    level: question.level,
    role: question.role,
    step: question.role === 'check' ? null : (question.step ?? (question.role === 'pre' ? 0 : null)),
    block: question.block ?? null,
    skill: question.skill ?? null,
    type: question.type,
    hints: question.hints,
    explanation: question.explanation ?? null,
  };

  switch (question.format) {
    case 'choice': {
      let options: PreparedOption[];
      if (question.type === 'output') {
        if (!question.code) throw new PrepareError(question.id, 'у задания «Что выведет код» нет кода');
        let output: string;
        try {
          output = normalizeOutput(runOutput(question.code));
        } catch (error) {
          throw new PrepareError(question.id, (error as RunError).message);
        }
        options = question.options.map((option) => ({
          text: option.text,
          correct: normalizeOutput(option.text) === output,
          ...(option.misconception ? { misconception: option.misconception } : {}),
        }));
        const correct = options.filter((option) => option.correct).length;
        if (correct !== 1) {
          throw new PrepareError(question.id, `код выводит «${output}»: верным должен быть ровно один вариант, совпало ${correct}`);
        }
      } else {
        options = question.options.map((option) => ({
          text: option.text,
          correct: option.correct === true,
          ...(option.misconception ? { misconception: option.misconception } : {}),
        }));
      }
      return { ...base, format: 'choice', prompt: question.prompt, code: question.code ?? null, language: question.language, multiple: question.multiple, options };
    }
    case 'free': {
      let answers = question.answers;
      let normalize = question.normalize;
      if (question.type === 'output') {
        if (!question.code) throw new PrepareError(question.id, 'у задания «Что выведет код» нет кода');
        try {
          answers = [normalizeOutput(runOutput(question.code))];
        } catch (error) {
          throw new PrepareError(question.id, (error as RunError).message);
        }
        normalize = 'output';
      }
      if (!answers || answers.length === 0) throw new PrepareError(question.id, 'нет верных ответов answers');
      return {
        ...base,
        format: 'free',
        prompt: question.prompt,
        code: question.code ?? null,
        language: question.language,
        answers,
        normalize,
        typos: question.typos,
      };
    }
    case 'order':
      // Задача Парсонса с функцией: собранный в верном порядке код запускается
      // на тестах и сверяется с эталоном — в задании только проверенный код.
      if (question.function) {
        const program = assembleOrder(question.items);
        const hiddenArgs: unknown[][] = question.hidden === 'vectors' ? (input.vectors ?? []).map((vector) => [vector]) : question.hidden;
        const cases = [...question.tests, ...hiddenArgs];
        if (cases.length === 0) throw new PrepareError(question.id, 'у задачи Парсонса с функцией нет тестов tests или hidden');
        for (const args of cases) {
          const expected = expectedFor(question, input, args);
          let got: unknown;
          try {
            got = runFunction(program, question.function, args);
          } catch (error) {
            throw new PrepareError(question.id, `собранный из строк код не запускается: ${(error as Error).message}`);
          }
          if (JSON.stringify(got) !== JSON.stringify(expected)) {
            throw new PrepareError(question.id, `собранный из строк код на ${JSON.stringify(args)} даёт ${JSON.stringify(got)}, а эталон — ${JSON.stringify(expected)}`);
          }
        }
      }
      return {
        ...base,
        format: 'order',
        prompt: question.prompt,
        code: question.code ?? null,
        language: question.language,
        items: question.items,
        distractors: question.distractors,
        indent: question.indent,
        alternatives: question.alternatives,
      };
    case 'code': {
      const hiddenArgs: unknown[][] =
        question.hidden === 'vectors' ? (input.vectors ?? []).map((vector) => [vector]) : question.hidden;
      const visibleTests = question.tests.map((args) => {
        const expected = expectedFor(question, input, args);
        return { args, expected, call: `${question.function}(${args.map(showValue).join(', ')})`, expectedText: showValue(expected) };
      });
      const hiddenTests = hiddenArgs.map((args) => ({ args, expected: expectedFor(question, input, args) }));
      return {
        ...base,
        format: 'code',
        prompt: question.prompt,
        code: question.code ?? null,
        language: question.language,
        function: question.function,
        starter: question.starter,
        visibleTests,
        hiddenTests,
      };
    }
    case 'line': {
      const mutant = input.mutants?.find((item) => item.id === question.mutant);
      if (!mutant) throw new PrepareError(question.id, `испорченной версии ${question.mutant} нет в mutants.ts`);
      if (!mutant.code || !mutant.bugLine) throw new PrepareError(question.id, `у испорченной версии ${question.mutant} нет кода code и строки bugLine`);
      return {
        ...base,
        format: 'line',
        prompt: question.prompt,
        lines: [...mutant.code],
        bugLine: mutant.bugLine,
        reasons: question.reasons.map((option) => ({
          text: option.text,
          correct: option.correct === true,
          ...(option.misconception ? { misconception: option.misconception } : {}),
        })),
      };
    }
    case 'self':
      return {
        ...base,
        format: 'self',
        prompt: question.prompt,
        code: question.code ?? null,
        language: question.language,
        reference: question.reference,
        criteria: question.criteria,
      };
    case 'simulation':
      return { ...base, format: 'simulation', prompt: question.prompt, algorithm: question.algorithm, input: question.input };
    case 'generated':
      return { ...base, format: 'generated', generator: question.generator };
  }
}

export function prepareTopic(input: PrepareInput): PreparedTopic {
  const file = input.questions;
  const misconceptions: Record<string, PreparedMisconception> = {};
  for (const item of file?.misconceptions ?? []) {
    misconceptions[item.id] = {
      text: item.text,
      explanation: item.explanation,
      blockPath: item.block ? (input.blockPaths.get(item.block) ?? null) : null,
      prerequisite: item.prerequisite ?? null,
    };
  }
  const steps: Partial<Record<Level, number[]>> = {};
  for (const level of input.topic.levels) steps[level] = levelSteps(input.topic, level);
  return {
    topicId: input.topic.id,
    title: input.topic.title,
    dir: input.dir,
    kind: input.topic.kind,
    levelPaths: input.levelPaths,
    skills: (file?.skills ?? []).map((skill) => ({ id: skill.id, version: skill.version, title: skill.title, level: skill.level })),
    misconceptions,
    questions: (file?.questions ?? []).map((question) => prepareOne(question, input)),
    steps,
    confusableWith: input.topic.confusableWith,
  };
}
