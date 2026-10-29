/**
 * Что ищет поиск (ТЗ, «Поиск»): темы каталога, термины глоссария и блоки
 * написанных тем. Документы собираются при сборке из файлов репозитория.
 *
 * В индексе — все 427 тем каталога: у вышедшей темы ссылка ведёт на её
 * страницу, у остальных — на место в каталоге с волной выхода. Блоки
 * ищутся только у тем, страницы которых есть в этой сборке.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseCatalog, type Catalog } from '../../content/catalog.ts';
import { blockPath, catalogTopicPath, sectionFolders, termPath, topicPath, type SectionFolders } from '../../content/paths.ts';
import type { Level } from '../../content/schema.ts';
import { parseMdx } from '../../content/text.ts';
import type { SearchDoc } from './engine.ts';
import type { GlossaryTermLike } from './synonyms.ts';

export interface GlossaryEntry extends GlossaryTermLike {
  id: string;
  definition: string;
  example?: string;
}

/** Тема, у которой в этой сборке есть страница. */
export interface WrittenTopic {
  id: string;
  title: string;
  levels: Level[];
  draft: boolean;
  dir: string;
}

function files(dir: string, suffix: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) result.push(...files(full, suffix));
    else if (name.endsWith(suffix)) result.push(full);
  }
  return result.sort();
}

/** С большой буквы: в каталоге темы модуля перечислены через точку посередине. */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

export function readCatalog(root: string): Catalog {
  return parseCatalog(
    readFileSync(join(root, 'docs/catalog.md'), 'utf8'),
    readFileSync(join(root, 'content/modules.yaml'), 'utf8'),
    readFileSync(join(root, 'content/topics.yaml'), 'utf8'),
  );
}

export function readGlossary(root: string): GlossaryEntry[] {
  return files(join(root, 'content/ru/glossary'), '.yaml').map((file) => {
    const data = parseYaml(readFileSync(file, 'utf8')) as GlossaryEntry & { synonyms?: string[] };
    return { ...data, synonyms: data.synonyms ?? [] };
  });
}

/** Написанные темы. Черновики попадают в список, только если их показывает сборка (превью). */
export function readWrittenTopics(root: string, showDrafts: boolean): WrittenTopic[] {
  const result: WrittenTopic[] = [];
  for (const file of files(join(root, 'content/ru'), 'topic.yaml')) {
    const data = parseYaml(readFileSync(file, 'utf8')) as { id: string; title: string; levels: Level[]; review?: { status?: string } };
    const draft = data.review?.status === 'draft';
    if (draft && !showDrafts) continue;
    result.push({ id: data.id, title: data.title, levels: data.levels, draft, dir: file.slice(0, -'topic.yaml'.length) });
  }
  return result;
}

export function catalogDocs(catalog: Catalog, written: ReadonlyMap<string, WrittenTopic>, folders: SectionFolders): SearchDoc[] {
  return catalog.sections.flatMap((section) =>
    section.modules.flatMap((module) =>
      module.topics.map((topic) => ({
        id: `topic:${topic.id}`,
        kind: 'topic' as const,
        title: capitalize(topic.title),
        context: `${section.number}. ${section.title} · ${module.number} ${module.title}`,
        text: written.get(topic.id)?.title ?? '',
        url: written.has(topic.id) ? topicPath(topic.id, folders) : catalogTopicPath(topic.id),
        ...(written.has(topic.id) ? {} : { wave: topic.wave }),
      })),
    ),
  );
}

export function glossaryDocs(glossary: readonly GlossaryEntry[]): SearchDoc[] {
  return glossary.map((term) => ({
    id: `term:${term.id}`,
    kind: 'term' as const,
    title: capitalize(term.term),
    context: [term.en, ...term.synonyms].join(', '),
    text: [term.definition, term.example ?? ''].join(' '),
    url: termPath(term.id),
  }));
}

/** Блоки написанных тем: заголовок и текст блока. */
export function blockDocs(written: readonly WrittenTopic[], folders: SectionFolders): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const topic of written) {
    for (const level of topic.levels) {
      let source: string;
      try {
        source = readFileSync(join(topic.dir, `${level}.mdx`), 'utf8');
      } catch {
        continue;
      }
      const parsed = parseMdx(source);
      parsed.blocks.forEach((block, index) => {
        const next = parsed.blocks[index + 1]?.line ?? Number.POSITIVE_INFINITY;
        const text = parsed.prose
          .filter((fragment) => fragment.line > block.line && fragment.line < next)
          .map((fragment) => fragment.text)
          .join(' ');
        docs.push({
          id: `block:${block.id}`,
          kind: 'block',
          title: `${topic.title}: ${block.title}`,
          context: topic.title,
          text,
          url: blockPath(block.id, level, topic.levels, folders),
        });
      });
    }
  }
  return docs;
}

export interface CorpusOptions {
  /** Показывать ли черновики: в превью правок — да, на основном сайте — нет. */
  showDrafts?: boolean;
}

export function buildCorpus(root: string, options: CorpusOptions = {}): { docs: SearchDoc[]; glossary: GlossaryEntry[] } {
  const catalog = readCatalog(root);
  const folders = sectionFolders(catalog);
  const written = readWrittenTopics(root, options.showDrafts ?? false);
  const byId = new Map(written.map((topic) => [topic.id, topic]));
  const glossary = readGlossary(root);
  return { docs: [...catalogDocs(catalog, byId, folders), ...glossaryDocs(glossary), ...blockDocs(written, folders)], glossary };
}
