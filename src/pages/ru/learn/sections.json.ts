/**
 * Что скачивать, чтобы раздел работал без сети (ТЗ, «Скорость»: «раздел
 * можно скачать заранее целиком»): страницы раздела, его модулей и вышедших
 * тем по всем уровням, а также задания тем для повторения. Адреса без base.
 */
import type { APIRoute } from 'astro';
import { catalog, folders } from '../../../content/catalog-data.ts';
import { modulePath, sectionPath } from '../../../content/paths.ts';
import { loadSite } from '../../../content/site-data.ts';
import type { SectionFiles } from '../../../lib/offline/download.ts';

export const GET: APIRoute = async () => {
  const site = await loadSite();
  const sections: SectionFiles[] = catalog.sections.map((section) => {
    const pages = [...site.pages.values()].filter((page) => page.catalog.module.section.id === section.id);
    return {
      id: section.id,
      title: section.title,
      pages: [sectionPath(section.id, folders), ...section.modules.map((module) => modulePath(module.id, folders)), ...pages.flatMap((page) => page.levels.map((level) => level.path))],
      data: pages.map((page) => `ru/learn/${page.topic.id}.json`),
      topics: pages.length,
    };
  });
  return new Response(JSON.stringify({ sections }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
