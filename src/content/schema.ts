/**
 * Схемы учебного контента. Их используют коллекции Astro (src/content.config.ts),
 * проверка контента (scripts/check-content.ts) и тесты. Описание формата для
 * авторов — docs/content-guide.md.
 */
import { z } from 'astro/zod';

export const LEVELS = ['fundament', 'base', 'depth'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_TITLES: Record<Level, string> = { fundament: 'Фундамент', base: 'База', depth: 'Глубина' };

/** Блоки шаблона темы, которые пишутся текстом в файлах уровней (ТЗ, «Из чего состоит тема»). */
export const BLOCK_KINDS = [
  'explanation',
  'worked-example',
  'visualization',
  'code',
  'complexity',
  'measurement',
  'proof',
  'misconceptions',
  'confusion-pairs',
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_TITLES: Record<BlockKind, string> = {
  explanation: 'Объяснение с примером',
  'worked-example': 'Разобранный пример с подцелями',
  visualization: 'Визуализация и ручная симуляция',
  code: 'Код',
  complexity: 'Сложность и свойства',
  measurement: 'Измерение на растущих данных',
  proof: 'Доказательство корректности и сложности',
  misconceptions: 'Частые ошибки и заблуждения',
  'confusion-pairs': 'Пары путаницы',
};

export const TOPIC_KINDS = ['algorithm', 'structure', 'concept', 'language', 'sql'] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

/** Классы сложности, которые умеет проверять эксперимент удвоения. */
export const COMPLEXITY_CLASSES = ['1', 'log n', 'n', 'n log n', 'n^2', 'n^3', '2^n'] as const;
export type ComplexityClass = (typeof COMPLEXITY_CLASSES)[number];

/** Виды входных данных для эксперимента удвоения. */
export const INPUT_KINDS = ['sorted', 'reversed', 'random', 'equal'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

/** 17 типов заданий тренажёра (ТЗ, раздел «Тренажёры»). */
export const QUESTION_TYPES = [
  'choice',
  'free',
  'trace',
  'output',
  'simulation',
  'predict',
  'parsons',
  'fill',
  'write',
  'find-bug',
  'which-algorithm',
  'complexity',
  'terms',
  'confusion',
  'proof',
  'sql',
  'explain',
] as const;

const SEGMENT = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
const ID = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})+$`);

/** Постоянный идентификатор: латиница, цифры и дефисы, части через точку. */
export const idSchema = z.string().regex(ID, 'идентификатор: латинские буквы, цифры и дефисы, части через точку');
export const moduleIdSchema = z.string().regex(new RegExp(`^${SEGMENT}\\.${SEGMENT}$`), 'id модуля вида раздел.модуль');
export const topicIdSchema = z
  .string()
  .regex(new RegExp(`^${SEGMENT}\\.${SEGMENT}\\.${SEGMENT}$`), 'id темы вида раздел.модуль.тема');
const levelSchema = z.enum(LEVELS);
const textSchema = z.string().trim().min(1);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата вида ГГГГ-ММ-ДД');
const versionSchema = z.number().int().positive();

// ---------- topic.yaml ----------

export const topicSchema = z
  .object({
    id: topicIdSchema,
    version: versionSchema,
    title: textSchema,
    module: moduleIdSchema,
    kind: z.enum(TOPIC_KINDS),
    /** Уровни темы по порядку. Тема с пометкой (Г) в каталоге — только [depth]. */
    levels: z.array(levelSchema).min(1),
    /** Краткое определение в одно-два предложения. */
    summary: textSchema,
    prerequisites: z.array(z.object({ topic: topicIdSchema, level: levelSchema }).strict()).default([]),
    related: z.array(topicIdSchema).default([]),
    /** Похожие темы: для них обязателен блок «Пары путаницы». */
    confusableWith: z.array(topicIdSchema).default([]),
    terms: z.array(idSchema).default([]),
    complexity: z
      .object({
        time: z
          .object({
            best: z.enum(COMPLEXITY_CLASSES),
            average: z.enum(COMPLEXITY_CLASSES),
            worst: z.enum(COMPLEXITY_CLASSES),
          })
          .strict(),
        memory: z.enum(COMPLEXITY_CLASSES),
      })
      .strict()
      .optional(),
    properties: z.object({ stable: z.boolean().optional(), inPlace: z.boolean().optional() }).strict().optional(),
    /** Как запускать версии кода при проверке: вид входных данных и имена функций. */
    code: z
      .object({
        harness: z.enum(['sort-numbers']),
        js: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
        cpp: z.string().regex(/^[a-z_][a-z0-9_]*$/),
        py: z.string().regex(/^[a-z_][a-z0-9_]*$/),
        /** Какие входные данные дают лучший, средний и худший случай — для эксперимента удвоения. */
        cases: z
          .object({
            best: z.enum(INPUT_KINDS),
            average: z.enum(INPUT_KINDS),
            worst: z.enum(INPUT_KINDS),
          })
          .strict(),
      })
      .strict()
      .optional(),
    /** Шаги цикла, которые теме не подходят, — с причиной (ТЗ, «Темы без алгоритма»). */
    skippedSteps: z
      .array(
        z
          .object({
            step: z.number().int().min(1).max(6),
            levels: z.array(levelSchema).min(1),
            reason: z.string().trim().min(15, 'причина пропуска — хотя бы одно предложение'),
          })
          .strict(),
      )
      .default([]),
    /** Необязательные блоки, которых нет, — с причиной. */
    skipped: z
      .array(
        z
          .object({
            block: z.enum(BLOCK_KINDS),
            levels: z.array(levelSchema).min(1),
            reason: z.string().trim().min(15, 'причина пропуска — хотя бы одно предложение'),
          })
          .strict(),
      )
      .default([]),
    review: z
      .object({
        /** draft — черновик, auto — проверено автоматически, expert — проверено экспертом. */
        status: z.enum(['draft', 'auto', 'expert']),
        date: dateSchema,
      })
      .strict(),
  })
  .strict();
export type Topic = z.infer<typeof topicSchema>;

// ---------- fundament.mdx, base.mdx, depth.mdx ----------

export const levelFrontmatterSchema = z
  .object({
    level: levelSchema,
    version: versionSchema,
  })
  .strict();

// ---------- questions.yaml ----------

export { STEPS, STEP_TITLES, type Step } from '../lib/learning/steps.ts';

/**
 * Как отвечают на задание: выбор, свободный ввод, порядок строк, код с
 * тестами, строка с ошибкой, объяснение с самопроверкой, ручная симуляция
 * или вариант генератора.
 */
export const ANSWER_FORMATS = ['choice', 'free', 'order', 'code', 'line', 'self', 'simulation', 'generated'] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

/** Какие форматы ответа подходят каждому типу задания. */
export const TYPE_FORMATS: Record<(typeof QUESTION_TYPES)[number], readonly AnswerFormat[]> = {
  choice: ['choice'],
  free: ['free'],
  trace: ['choice', 'free', 'generated'],
  output: ['choice', 'free', 'generated'],
  simulation: ['simulation'],
  predict: ['choice', 'generated'],
  parsons: ['order'],
  fill: ['code'],
  write: ['code'],
  'find-bug': ['line', 'generated'],
  'which-algorithm': ['choice', 'generated'],
  complexity: ['free', 'choice', 'generated'],
  terms: ['free', 'choice', 'generated'],
  confusion: ['choice'],
  proof: ['order', 'choice'],
  sql: ['generated'],
  explain: ['self'],
};

const optionSchema = z
  .object({
    text: textSchema,
    /** Верный ли вариант. У задания «Что выведет код» верный вариант вычисляет запуск кода — поле не пишется. */
    correct: z.boolean().optional(),
    /** Заблуждение, которое стоит за неверным вариантом. */
    misconception: idSchema.optional(),
  })
  .strict();

const questionBase = {
  id: idSchema,
  version: versionSchema,
  level: levelSchema,
  /** pre — предвопрос, practice — по ходу темы, check — итоговая и отложенная проверка. */
  role: z.enum(['pre', 'practice', 'check']),
  /** Шаг цикла: 0 — предвопросы, 1–6 — шаги уровня. У итоговой проверки шага нет. */
  step: z.number().int().min(0).max(6).optional(),
  /** Блок, после которого задание стоит на странице уровня. */
  block: idSchema.optional(),
  /** Навык — карточка повторения. Нужен у всех заданий, кроме предвопросов. */
  skill: idSchema.optional(),
  /** Тип задания из 17 типов тренажёра. */
  type: z.enum(QUESTION_TYPES),
  /** Подсказки ступенями: намёк → подцель → часть решения. Открытая подсказка снижает оценку до Hard. */
  hints: z.array(textSchema).max(3).default([]),
  /** Почему верный ответ верен: показывается после ответа. */
  explanation: textSchema.optional(),
};

/** Условие: текст, в котором `код` выделяется обратными кавычками, и необязательный фрагмент кода под ним. */
const promptFields = {
  prompt: textSchema,
  code: z.string().optional(),
  language: z.enum(['js', 'cpp', 'py', 'text']).default('js'),
};

export const questionSchema = z.discriminatedUnion('format', [
  z
    .object({
      ...questionBase,
      ...promptFields,
      format: z.literal('choice'),
      multiple: z.boolean().default(false),
      options: z.array(optionSchema).min(2),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      ...promptFields,
      format: z.literal('free'),
      /** Верные ответы. У задания «Что выведет код» ответ вычисляет запуск кода — поле не пишется. */
      answers: z.array(textSchema).min(1).optional(),
      /** Как сравнивать: текст, число, сложность, вывод программы, список чисел («[1, 2, 3]», «1 2 3»). */
      normalize: z.enum(['text', 'number', 'complexity', 'output', 'list']).default('text'),
      /** Засчитывать ответ с одной опечаткой (в словах от пяти букв). */
      typos: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      ...promptFields,
      format: z.literal('order'),
      /** Строки в верном порядке; indent — отступ строки в шагах (для задач Парсонса). */
      items: z.array(z.object({ text: textSchema, indent: z.number().int().min(0).max(6).default(0) }).strict()).min(3),
      /** Лишние строки, которые не входят в ответ. */
      distractors: z.array(textSchema).default([]),
      /** Проверять ли отступы. */
      indent: z.boolean().default(false),
      /** Другие допустимые порядки: номера строк из items (с нуля). */
      alternatives: z.array(z.array(z.number().int().min(0))).default([]),
      /**
       * Для задачи Парсонса: имя функции, которую собирают. Собранный из строк
       * код запускается при сборке на тестах и сверяется с эталоном solution.
       */
      function: z.string().regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/).optional(),
      solution: z.string().min(1).optional(),
      tests: z.array(z.array(z.unknown())).default([]),
      hidden: z.union([z.array(z.array(z.unknown())), z.literal('vectors')]).default([]),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      ...promptFields,
      format: z.literal('code'),
      /** Имя функции, которую пишет человек. */
      function: z.string().regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/),
      /** Начальный код: заготовка или код с пропусками ___. */
      starter: z.string().min(1),
      /** Эталонное решение на JS: по нему вычисляются ожидаемые ответы тестов. «reference» — эталон темы. */
      solution: z.string().min(1),
      /** Аргументы видимых тестов: список вызовов, у каждого — список аргументов. */
      tests: z.array(z.array(z.unknown())).min(1),
      /** Аргументы скрытых тестов. «vectors» — общие тестовые данные темы. */
      hidden: z.union([z.array(z.array(z.unknown())), z.literal('vectors')]).default([]),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      prompt: textSchema,
      format: z.literal('line'),
      /** Испорченная версия эталона из mutants.ts: её код и строка с ошибкой. */
      mutant: z.string().regex(/^[a-z][a-z0-9-]*$/),
      /** Почему это ошибка: варианты, ровно один верный. */
      reasons: z.array(optionSchema).min(2),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      ...promptFields,
      format: z.literal('self'),
      /** Эталонное объяснение для сравнения. */
      reference: textSchema,
      /** Критерии самопроверки. */
      criteria: z.array(textSchema).min(2),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      prompt: textSchema,
      format: z.literal('simulation'),
      /** Эталон из src/lib/viz/algorithms.ts. */
      algorithm: topicIdSchema,
      input: z.array(z.number().int()).min(5).max(8),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      format: z.literal('generated'),
      /** Имя функции в generators.ts темы. */
      generator: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    })
    .strict(),
]);
export type Question = z.infer<typeof questionSchema>;

export const questionsFileSchema = z
  .object({
    topic: topicIdSchema,
    /** Навыки — карточки повторения. Повторяется навык, а не конкретный вопрос. */
    skills: z.array(z.object({ id: idSchema, version: versionSchema.default(1), title: textSchema, level: levelSchema }).strict()).default([]),
    misconceptions: z
      .array(
        z
          .object({
            id: idSchema,
            text: textSchema,
            /** Разбор: почему так думать неверно и как правильно. */
            explanation: textSchema,
            /** Блок справочника, где это объясняется. */
            block: idSchema.optional(),
            /** Тема-предпосылка, к которой ведёт это заблуждение: при повторах приложение предложит к ней вернуться. */
            prerequisite: topicIdSchema.optional(),
          })
          .strict(),
      )
      .default([]),
    questions: z.array(questionSchema).default([]),
  })
  .strict();
export type QuestionsFile = z.infer<typeof questionsFileSchema>;

// ---------- sources.yaml ----------

/** Лицензии, под которыми текст можно пересказывать и адаптировать под CC BY-SA 4.0. */
export const ADAPTABLE_LICENSES = [
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
  'CC0-1.0',
  'public-domain',
  'MIT',
  '0BSD',
] as const;
/** Дополнительно для сверки фактов (текст не переносим, пересказываем своими словами). */
export const REFERENCE_LICENSES = [...ADAPTABLE_LICENSES, 'PSF-2.0'] as const;

export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: textSchema,
    authors: z.array(textSchema).min(1),
    url: z.url(),
    license: textSchema,
    /** adapted — основа текста; reference — сверка фактов; read-more — «читать дальше», только ссылка. */
    use: z.enum(['adapted', 'reference', 'read-more']),
    chapters: textSchema.optional(),
    note: textSchema.optional(),
  })
  .strict();

export const sourcesFileSchema = z
  .object({
    topic: topicIdSchema,
    /** Строка на странице темы: «Основано на: …». */
    basedOn: z.string().trim().startsWith('Основано на: '),
    sources: z.array(sourceSchema).min(1),
  })
  .strict();
export type SourcesFile = z.infer<typeof sourcesFileSchema>;

// ---------- content/<язык>/glossary/*.yaml ----------

export const termSchema = z
  .object({
    id: idSchema,
    version: versionSchema,
    /** Русское название — единственный разрешённый вариант в текстах. */
    term: textSchema,
    en: textSchema,
    definition: textSchema,
    example: textSchema.optional(),
    topic: topicIdSchema.optional(),
    confusedWith: z.array(idSchema).default([]),
    /** Допустимые синонимы и варианты написания: из них строится словарь поиска. */
    synonyms: z.array(textSchema).default([]),
    /** Запрещённые варианты: проверка не пропустит их в текстах. */
    forbidden: z.array(textSchema).default([]),
  })
  .strict();
export type Term = z.infer<typeof termSchema>;
