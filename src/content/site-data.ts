/**
 * Данные справочника для страниц сайта: какие темы вышли, их уровни, блоки,
 * вопросы, источники и термины. Собирается один раз за сборку из коллекций
 * контента Astro.
 *
 * Черновик (review.status: draft) на основном сайте не публикуется; в превью
 * правок и сборке для автопроверок он виден с пометкой «черновик».
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import type { PreparedTopic } from '../lib/learning/question-types.ts';
import { showDrafts } from '../lib/site.ts';
import { prepareTopic, type MutantLike } from './prepare.ts';
import { catalogTopics, folders } from './catalog-data.ts';
import type { TopicWithModule } from './catalog.ts';
import { levelPath, modulePath, sectionPath, topicPath } from './paths.ts';
import { LEVEL_TITLES, LEVELS, type Level, type QuestionsFile, type SourcesFile, type Term, type Topic } from './schema.ts';
import { parseMdx, type MdxBlock } from './text.ts';

/** Скорость чтения учебного текста, слов в минуту. */
const WORDS_PER_MINUTE = 150;

export interface LevelPage {
  level: Level;
  title: string;
  /** Адрес уровня без base. */
  path: string;
  /** id записи в коллекции levels — для render(). */
  entryId: string;
  version: number;
  blocks: MdxBlock[];
  /** Примерное время чтения в минутах, не меньше одной. */
  minutes: number;
}

export interface TopicPage {
  topic: Topic;
  catalog: TopicWithModule;
  draft: boolean;
  /** Папка темы относительно content/ru, например algorithms/sorting/insertion-sort. */
  dir: string;
  path: string;
  modulePath: string;
  sectionPath: string;
  levels: LevelPage[];
  questions: QuestionsFile | null;
  sources: SourcesFile | null;
}

export interface BlockRef {
  topicId: string;
  level: Level;
  title: string;
  version: number;
  /** Адрес блока без base: адрес уровня и якорь. */
  path: string;
}

export interface SiteData {
  /** Темы, страницы которых есть в этой сборке. */
  pages: Map<string, TopicPage>;
  blocks: Map<string, BlockRef>;
  glossary: Map<string, Term>;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function build(): Promise<SiteData> {
  const [topics, levels, questions, sources, glossary] = await Promise.all([
    getCollection('topics'),
    getCollection('levels'),
    getCollection('questions'),
    getCollection('sources'),
    getCollection('glossary'),
  ]);
  const levelByPath = new Map<string, CollectionEntry<'levels'>>(levels.map((entry) => [entry.id, entry]));
  const questionsById = new Map(questions.map((entry) => [entry.id, entry.data]));
  const sourcesById = new Map(sources.map((entry) => [entry.id, entry.data]));

  const pages = new Map<string, TopicPage>();
  const blocks = new Map<string, BlockRef>();

  for (const entry of topics) {
    const topic = entry.data;
    const draft = topic.review.status === 'draft';
    if (draft && !showDrafts) continue;
    const catalog = catalogTopics.get(topic.id);
    if (!catalog) throw new Error(`Темы ${topic.id} нет в content/topics.yaml`);
    const dir = (entry.filePath ?? '').replace(/^content\/ru\//, '').replace(/\/topic\.yaml$/, '');

    const levelPages: LevelPage[] = [];
    for (const level of LEVELS) {
      if (!topic.levels.includes(level)) continue;
      const levelEntry = levelByPath.get(`${dir}/${level}`);
      // Уровень без файла — неполнота черновика: страницы у него нет.
      if (!levelEntry) continue;
      const parsed = parseMdx(levelEntry.body ?? '');
      const words = countWords(parsed.prose.map((fragment) => fragment.text).join(' '));
      const path = levelPath(topic.id, level, topic.levels, folders);
      levelPages.push({
        level,
        title: LEVEL_TITLES[level],
        path,
        entryId: levelEntry.id,
        version: levelEntry.data.version,
        blocks: parsed.blocks,
        minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
      });
      for (const block of parsed.blocks) {
        blocks.set(block.id, { topicId: topic.id, level, title: block.title, version: block.version ?? 1, path: `${path}#${block.id}` });
      }
    }
    if (levelPages.length === 0) continue;

    pages.set(topic.id, {
      topic,
      catalog,
      draft,
      dir,
      path: topicPath(topic.id, folders),
      modulePath: modulePath(topic.module, folders),
      sectionPath: sectionPath(catalog.module.section.id, folders),
      levels: levelPages,
      questions: questionsById.get(topic.id) ?? null,
      sources: sourcesById.get(topic.id) ?? null,
    });
  }

  return { pages, blocks, glossary: new Map(glossary.map((entry) => [entry.id, entry.data])) };
}

let cached: Promise<SiteData> | null = null;

/** Данные справочника; при сборке вычисляются один раз. */
export function loadSite(): Promise<SiteData> {
  cached ??= build();
  return cached;
}

const referenceModules = import.meta.glob<Record<string, unknown>>('/content/ru/**/reference.ts', { eager: true });
const mutantModules = import.meta.glob<{ mutants?: MutantLike[] }>('/content/ru/**/mutants.ts', { eager: true });
const vectorFiles = import.meta.glob<{ inputs?: unknown[][] }>('/content/ru/**/vectors.json', { eager: true, import: 'default' });
const prepared = new Map<string, PreparedTopic>();

/**
 * Задания темы для браузера: всё вычислимое уже вычислено (src/content/prepare.ts).
 * Ошибка подготовки останавливает сборку с понятным текстом.
 */
export async function preparedTopicFor(topicId: string): Promise<PreparedTopic> {
  const cached = prepared.get(topicId);
  if (cached) return cached;
  const site = await loadSite();
  const page = site.pages.get(topicId);
  if (!page) throw new Error(`Нет страницы темы ${topicId}`);
  const blockPaths = new Map([...site.blocks.entries()].map(([id, block]) => [id, block.path]));
  const levelPaths = Object.fromEntries(page.levels.map((level) => [level.level, level.path]));
  const root = `/content/ru/${page.dir}`;
  const result = prepareTopic({
    topic: page.topic,
    dir: page.dir,
    questions: page.questions,
    levelPaths,
    blockPaths,
    reference: referenceModules[`${root}/reference.ts`],
    mutants: mutantModules[`${root}/mutants.ts`]?.mutants ?? [],
    vectors: vectorFiles[`${root}/vectors.json`]?.inputs ?? [],
  });
  prepared.set(topicId, result);
  return result;
}
