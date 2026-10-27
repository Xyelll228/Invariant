/**
 * Что ищет поиск (ТЗ, «Поиск»): темы каталога, термины глоссария и блоки
 * написанных тем. Документы собираются при сборке из файлов репозитория.
 * Пока тем почти нет, поэтому в индексе — все 427 тем каталога по названиям,
 * модулям и разделам.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseCatalog } from '../../content/catalog.ts';
import { parseMdx } from '../../content/text.ts';
import type { SearchDoc } from './engine.ts';
import type { GlossaryTermLike } from './synonyms.ts';

export interface GlossaryEntry extends GlossaryTermLike {
  id: string;
  definition: string;
  example?: string;
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

export function readGlossary(root: string): GlossaryEntry[] {
  return files(join(root, 'content/ru/glossary'), '.yaml').map((file) => {
    const data = parseYaml(readFileSync(file, 'utf8')) as GlossaryEntry & { synonyms?: string[] };
    return { ...data, synonyms: data.synonyms ?? [] };
  });
}

export function catalogDocs(root: string): SearchDoc[] {
  const catalog = parseCatalog(readFileSync(join(root, 'docs/catalog.md'), 'utf8'), readFileSync(join(root, 'content/modules.yaml'), 'utf8'));
  return catalog.sections.flatMap((section) =>
    section.modules.flatMap((module) =>
      module.topics.map((topic, index) => ({
        id: `topic:${module.id}:${index}`,
        kind: 'topic' as const,
        title: capitalize(topic.title),
        context: `${section.number}. ${section.title} · ${module.number} ${module.title}`,
        text: '',
        url: null,
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
    url: null,
  }));
}

/** Блоки тем: заголовок и текст блока. Пока есть только черновик-образец. */
export function blockDocs(root: string): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const topicFile of files(join(root, 'content/ru'), 'topic.yaml')) {
    const topic = parseYaml(readFileSync(topicFile, 'utf8')) as { id: string; title: string; review?: { status?: string } };
    const dir = topicFile.slice(0, -'topic.yaml'.length);
    // Черновик-образец опубликован только как прототип страницы темы.
    const page = topic.review?.status === 'draft' ? 'ru/prototypes/topic/' : null;
    for (const level of ['fundament', 'base', 'depth']) {
      let source: string;
      try {
        source = readFileSync(join(dir, `${level}.mdx`), 'utf8');
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
          url: page === null ? null : `${page}#${block.id}`,
        });
      });
    }
  }
  return docs;
}

export function buildCorpus(root: string): { docs: SearchDoc[]; glossary: GlossaryEntry[] } {
  const glossary = readGlossary(root);
  return { docs: [...catalogDocs(root), ...glossaryDocs(glossary), ...blockDocs(root)], glossary };
}
