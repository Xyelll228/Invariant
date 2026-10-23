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

const optionSchema = z
  .object({
    text: textSchema,
    correct: z.boolean().default(false),
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
  skill: idSchema.optional(),
};

export const questionSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...questionBase,
      type: z.literal('choice'),
      prompt: textSchema,
      multiple: z.boolean().default(false),
      options: z.array(optionSchema).min(2),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      type: z.literal('free'),
      prompt: textSchema,
      answers: z.array(textSchema).min(1),
      normalize: z.enum(['text', 'number', 'complexity']).default('text'),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      type: z.literal('generated'),
      /** Какой тип задания даёт генератор. */
      questionType: z.enum(QUESTION_TYPES),
      /** Имя функции в generators.ts темы. */
      generator: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    })
    .strict(),
]);

export const questionsFileSchema = z
  .object({
    topic: topicIdSchema,
    /** Навыки — карточки повторения. Повторяется навык, а не конкретный вопрос. */
    skills: z.array(z.object({ id: idSchema, title: textSchema, level: levelSchema }).strict()).default([]),
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
