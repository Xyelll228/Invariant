/**
 * Индекс поиска собирается при сборке сайта и лежит рядом со страницами:
 * поиск работает без сети и без сервера (ТЗ, «Поиск»).
 */
import type { APIRoute } from 'astro';
import { buildCorpus } from '../../lib/search/corpus.ts';
import { buildIndex, SEARCH_INDEX_VERSION } from '../../lib/search/engine.ts';
import { compileSynonyms, PROTOTYPE_SYNONYMS, synonymGroupsFromGlossary } from '../../lib/search/synonyms.ts';
import { showDrafts } from '../../lib/site.ts';

export const prerender = true;

export const GET: APIRoute = () => {
  const { docs, glossary } = buildCorpus(`${process.cwd()}/`, { showDrafts });
  const body = {
    version: SEARCH_INDEX_VERSION,
    synonyms: compileSynonyms([...synonymGroupsFromGlossary(glossary), ...PROTOTYPE_SYNONYMS]),
    index: buildIndex(docs).toJSON(),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
