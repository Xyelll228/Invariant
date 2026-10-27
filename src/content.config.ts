/**
 * Коллекции контента Astro. Схемы — в src/content/schema.ts; их же
 * использует проверка контента (scripts/check-content.ts).
 * Одна папка на тему: content/<язык>/<раздел>/<модуль>/<тема>/.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  levelFrontmatterSchema,
  questionsFileSchema,
  sourcesFileSchema,
  termSchema,
  topicSchema,
} from './content/schema.ts';

const base = './content/ru';

/** Идентификатор записи — постоянный id из файла, а не путь. */
const byDataId = ({ data, entry }: { data: Record<string, unknown>; entry: string }): string => {
  const id = data.id ?? data.topic;
  if (typeof id !== 'string') throw new Error(`В ${entry} нет поля id или topic`);
  return id;
};

const topics = defineCollection({
  loader: glob({ pattern: '**/topic.yaml', base, generateId: byDataId }),
  schema: topicSchema,
});

const levels = defineCollection({
  loader: glob({
    pattern: '**/{fundament,base,depth}.mdx',
    base,
    // id уровня: путь папки темы + уровень, например algorithms/sorting/insertion-sort/base
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: levelFrontmatterSchema,
});

const questions = defineCollection({
  loader: glob({ pattern: '**/questions.yaml', base, generateId: byDataId }),
  schema: questionsFileSchema,
});

const sources = defineCollection({
  loader: glob({ pattern: '**/sources.yaml', base, generateId: byDataId }),
  schema: sourcesFileSchema,
});

const glossary = defineCollection({
  loader: glob({ pattern: 'glossary/*.yaml', base, generateId: byDataId }),
  schema: termSchema,
});

export const collections = { topics, levels, questions, sources, glossary };
