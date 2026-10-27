/**
 * Адреса страниц справочника. Строятся из постоянных идентификаторов, а не
 * из имён папок: ссылка на тему и её блоки не меняется при переименовании.
 *
 *   раздел   algo                     → ru/algorithms/
 *   модуль   algo.sorting             → ru/algorithms/sorting/
 *   тема     algo.sorting.insertion   → ru/algorithms/sorting/insertion/
 *   уровень  первый уровень темы      → адрес темы; остальные — ru/…/insertion/base/
 *   блок     algo.sorting.insertion.b.idea → адрес уровня + #algo.sorting.insertion.b.idea
 *
 * Адреса без base: на странице их оборачивает url() из src/lib/site.ts.
 */
import type { Catalog } from './catalog.ts';
import type { Level } from './schema.ts';

/** Папки разделов по id раздела: js → javascript. */
export type SectionFolders = ReadonlyMap<string, string>;

export function sectionFolders(catalog: Catalog): SectionFolders {
  return new Map(catalog.sections.map((section) => [section.id, section.folder]));
}

function folderOf(sectionId: string, folders: SectionFolders): string {
  const folder = folders.get(sectionId);
  if (!folder) throw new Error(`Нет раздела ${sectionId}`);
  return folder;
}

export function sectionPath(sectionId: string, folders: SectionFolders): string {
  return `ru/${folderOf(sectionId, folders)}/`;
}

export function modulePath(moduleId: string, folders: SectionFolders): string {
  const [section, module] = moduleId.split('.');
  if (!section || !module) throw new Error(`id модуля вида раздел.модуль: ${moduleId}`);
  return `ru/${folderOf(section, folders)}/${module}/`;
}

export function topicPath(topicId: string, folders: SectionFolders): string {
  const [section, module, topic] = topicId.split('.');
  if (!section || !module || !topic) throw new Error(`id темы вида раздел.модуль.тема: ${topicId}`);
  return `ru/${folderOf(section, folders)}/${module}/${topic}/`;
}

/** Первый уровень темы живёт по адресу самой темы, остальные — в подпапке. */
export function levelPath(topicId: string, level: Level, levels: readonly Level[], folders: SectionFolders): string {
  if (!levels.includes(level)) throw new Error(`У темы ${topicId} нет уровня ${level}`);
  const base = topicPath(topicId, folders);
  return levels[0] === level ? base : `${base}${level}/`;
}

/** Блок темы по его id: тема — первые три части id. */
export function topicIdOfChild(childId: string): string {
  return childId.split('.').slice(0, 3).join('.');
}

export function blockPath(blockId: string, level: Level, levels: readonly Level[], folders: SectionFolders): string {
  return `${levelPath(topicIdOfChild(blockId), level, levels, folders)}#${blockId}`;
}

/** Термин глоссария: term.stable-sort → ru/glossary/#term.stable-sort */
export function termPath(termId: string): string {
  return `ru/glossary/#${termId}`;
}

/** Место темы в каталоге: для тем, которые ещё не вышли. */
export function catalogTopicPath(topicId: string): string {
  return `ru/catalog/#${topicId}`;
}
