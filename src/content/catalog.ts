/**
 * Каталог тем: разбор docs/catalog.md, content/modules.yaml и content/topics.yaml.
 *
 * Источник правды по составу тем — docs/catalog.md (его читает человек),
 * постоянные идентификаторы разделов и модулей — content/modules.yaml,
 * идентификаторы и волны тем — content/topics.yaml.
 * Разбор не зависит от Astro: его используют страницы, проверки и тесты.
 */
import { parse as parseYaml } from 'yaml';

export interface CatalogTopic {
  /** Постоянный идентификатор из content/topics.yaml, например «algo.sorting.insertion». */
  id: string;
  /** Последняя часть id: часть адреса страницы темы. */
  slug: string;
  /** Название темы без пометки (Г), как в каталоге. */
  title: string;
  /** Тема только уровня Глубина — пометка (Г) в каталоге. */
  depthOnly: boolean;
  /** Волна выхода темы. */
  wave: number;
}

export interface CatalogModule {
  /** Номер в каталоге, например «1.5». */
  number: string;
  /** Постоянный идентификатор, например «algo.sorting». */
  id: string;
  title: string;
  /** Волны выхода: [1] или [1, 2]. */
  waves: number[];
  topics: CatalogTopic[];
}

export interface CatalogSection {
  number: number;
  id: string;
  /** Папка раздела в content/<язык>/. */
  folder: string;
  title: string;
  intro: string;
  modules: CatalogModule[];
}

export interface Catalog {
  sections: CatalogSection[];
}

interface ModulesFile {
  sections: { number: number; id: string; folder: string }[];
  modules: Record<string, string>;
}

/** content/topics.yaml: темы каждого модуля по порядку каталога. */
type TopicsFile = Record<string, { id: string; title: string; wave?: number }[]>;

const SECTION_HEADING = /^## (\d+)\. (.+)$/;
const TABLE_ROW = /^\| (\d+\.\d+) (.+?) \| (.+) \| (\d+(?:–\d+)?) \|$/;

/** Снимает экранирование Markdown: «A\*» → «A*». */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1');
}

function parseWaves(text: string): number[] {
  const [from, to] = text.split('–').map(Number);
  if (from === undefined || Number.isNaN(from)) throw new Error(`Не разобрать волну «${text}»`);
  if (to === undefined) return [from];
  if (Number.isNaN(to) || to < from) throw new Error(`Не разобрать волну «${text}»`);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function parseCatalog(markdown: string, modulesYaml: string, topicsYaml: string): Catalog {
  const ids = parseYaml(modulesYaml) as ModulesFile;
  const registry = (parseYaml(topicsYaml) ?? {}) as TopicsFile;
  const sections: CatalogSection[] = [];
  const seen = new Set<string>();
  const lines = markdown.split('\n');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const heading = SECTION_HEADING.exec(line);
    if (heading) {
      const number = Number(heading[1]);
      const meta = ids.sections.find((section) => section.number === number);
      if (!meta) throw new Error(`В content/modules.yaml нет раздела ${number}`);
      let intro = '';
      for (let next = index + 1; next < lines.length; next++) {
        const text = (lines[next] ?? '').trim();
        if (text === '') continue;
        if (!text.startsWith('|') && !text.startsWith('#')) intro = text;
        break;
      }
      sections.push({ number, id: meta.id, folder: meta.folder, title: heading[2] ?? '', intro, modules: [] });
      continue;
    }

    const row = TABLE_ROW.exec(line);
    if (row) {
      const section = sections.at(-1);
      const number = row[1] ?? '';
      if (!section) throw new Error(`Строка модуля ${number} до заголовка раздела`);
      if (!number.startsWith(`${section.number}.`)) {
        throw new Error(`Модуль ${number} стоит в разделе ${section.number}`);
      }
      const id = ids.modules[number];
      if (!id) throw new Error(`В content/modules.yaml нет модуля ${number}`);
      if (!id.startsWith(`${section.id}.`)) throw new Error(`Модуль ${number} (${id}) не из раздела ${section.id}`);
      const waves = parseWaves(row[4] ?? '');
      const entries = registry[id];
      if (!entries) throw new Error(`В content/topics.yaml нет модуля ${id}`);
      const titles = (row[3] ?? '').split(' · ').map((raw) => unescapeMarkdown(raw.trim()));
      if (entries.length !== titles.length) {
        throw new Error(`Модуль ${id}: в каталоге тем ${titles.length}, в content/topics.yaml — ${entries.length}`);
      }
      const topics = titles.map((raw, index): CatalogTopic => {
        const depthOnly = raw.endsWith(' (Г)');
        const title = depthOnly ? raw.slice(0, -' (Г)'.length) : raw;
        const entry = entries[index] as { id: string; title: string; wave?: number };
        if (entry.title !== title) {
          throw new Error(`Модуль ${id}, тема ${index + 1}: в каталоге «${title}», в content/topics.yaml «${entry.title}»`);
        }
        if (!entry.id.startsWith(`${id}.`) || entry.id.split('.').length !== 3) {
          throw new Error(`Тема «${title}»: id ${entry.id} должен быть вида ${id}.<тема>`);
        }
        if (seen.has(entry.id)) throw new Error(`id ${entry.id} в content/topics.yaml повторяется`);
        seen.add(entry.id);
        const wave = entry.wave ?? (waves.length === 1 ? waves[0] : undefined);
        if (wave === undefined || !waves.includes(wave)) {
          throw new Error(`Тема ${entry.id}: волна ${entry.wave ?? 'не указана'}, а модуль выходит в волнах ${waves.join('–')}`);
        }
        return { id: entry.id, slug: entry.id.split('.')[2] as string, title, depthOnly, wave };
      });
      section.modules.push({ number, id, title: unescapeMarkdown(row[2] ?? ''), waves, topics });
    }
  }

  const listed = new Set(sections.flatMap((section) => section.modules.map((module) => module.id)));
  for (const module of Object.keys(registry)) {
    if (!listed.has(module)) throw new Error(`В content/topics.yaml модуль ${module}, которого нет в каталоге`);
  }
  return { sections };
}

export interface CatalogTotals {
  sections: number;
  modules: number;
  topics: number;
}

export function catalogTotals(catalog: Catalog): CatalogTotals {
  const modules = catalog.sections.flatMap((section) => section.modules);
  return {
    sections: catalog.sections.length,
    modules: modules.length,
    topics: modules.reduce((sum, module) => sum + module.topics.length, 0),
  };
}

export type ModuleWithSection = CatalogModule & { section: CatalogSection };
export type TopicWithModule = CatalogTopic & { module: ModuleWithSection };

/** Все модули по идентификатору. */
export function modulesById(catalog: Catalog): Map<string, ModuleWithSection> {
  const result = new Map<string, ModuleWithSection>();
  for (const section of catalog.sections) {
    for (const module of section.modules) result.set(module.id, { ...module, section });
  }
  return result;
}

/** Все темы каталога по идентификатору. */
export function topicsById(catalog: Catalog): Map<string, TopicWithModule> {
  const result = new Map<string, TopicWithModule>();
  for (const module of modulesById(catalog).values()) {
    for (const topic of module.topics) result.set(topic.id, { ...topic, module });
  }
  return result;
}
