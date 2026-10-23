/**
 * Каталог тем: разбор docs/catalog.md и content/modules.yaml.
 *
 * Источник правды по составу тем — docs/catalog.md (его читает человек),
 * постоянные идентификаторы разделов и модулей — content/modules.yaml.
 * Разбор не зависит от Astro: его используют страницы, проверки и тесты.
 */
import { parse as parseYaml } from 'yaml';

export interface CatalogTopic {
  /** Название темы без пометки (Г). */
  title: string;
  /** Тема только уровня Глубина — пометка (Г) в каталоге. */
  depthOnly: boolean;
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

export function parseCatalog(markdown: string, modulesYaml: string): Catalog {
  const ids = parseYaml(modulesYaml) as ModulesFile;
  const sections: CatalogSection[] = [];
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
      const topics = (row[3] ?? '').split(' · ').map((raw) => {
        const title = unescapeMarkdown(raw.trim());
        const depthOnly = title.endsWith(' (Г)');
        return { title: depthOnly ? title.slice(0, -' (Г)'.length) : title, depthOnly };
      });
      section.modules.push({ number, id, title: unescapeMarkdown(row[2] ?? ''), waves: parseWaves(row[4] ?? ''), topics });
    }
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

/** Все модули по идентификатору. */
export function modulesById(catalog: Catalog): Map<string, CatalogModule & { section: CatalogSection }> {
  const result = new Map<string, CatalogModule & { section: CatalogSection }>();
  for (const section of catalog.sections) {
    for (const module of section.modules) result.set(module.id, { ...module, section });
  }
  return result;
}
