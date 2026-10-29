/**
 * Поиск по справочнику на MiniSearch (ТЗ, «Поиск»): формы слов через
 * стеммер, синонимы через расширение запроса, опечатки через нечёткое
 * совпадение, подсказки при вводе через поиск по началу последнего слова.
 * Индекс строится при сборке и работает без сети.
 */
import MiniSearch, { type Options, type SearchResult } from 'minisearch';
import { expandQuery, type CompiledSynonyms } from './synonyms.ts';
import { isStopWord, searchTerms, stemToken, tokenize } from './text.ts';

export type SearchKind = 'topic' | 'term' | 'block';

export interface SearchDoc {
  id: string;
  kind: SearchKind;
  title: string;
  /** Где находится: раздел и модуль темы, английское название термина. */
  context: string;
  text: string;
  /** Адрес на сайте без base: страница темы, термина или блока, а у невышедшей темы — её место в каталоге. */
  url: string | null;
  /** Волна выхода темы, которой ещё нет на сайте. */
  wave?: number;
}

export type StoredDoc = Omit<SearchDoc, 'text'>;

/** Версия формата файла индекса: клиент сверяет её, чтобы не прочитать устаревший файл. */
export const SEARCH_INDEX_VERSION = 2;

export interface SearchIndexFile {
  version: number;
  synonyms: CompiledSynonyms;
  index: ReturnType<MiniSearch<SearchDoc>['toJSON']>;
}

const BLOCK_WEIGHT = 0.6;

export const SEARCH_OPTIONS: Options<SearchDoc> = {
  idField: 'id',
  fields: ['title', 'context', 'text'],
  storeFields: ['kind', 'title', 'context', 'url', 'wave'],
  tokenize,
  processTerm: (term) => (isStopWord(term) ? null : stemToken(term)),
  searchOptions: {
    // Запрос уже разобран на основы (см. searchDocs) — второй раз не обрабатываем.
    processTerm: (term) => term,
    boost: { title: 3, context: 1.5, text: 1 },
    // Опечатки: одна буква в словах от 4 букв, две — от 8. Короткие (BFS, GIL) — только точно.
    fuzzy: (term) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : false),
    // Подсказки при вводе: последнее слово ищется и по началу.
    prefix: (term, index, terms) => index === terms.length - 1 && term.length >= 2,
    combineWith: 'OR',
    // Блок темы весит меньше самой темы и термина: в названии блока повторяется название темы.
    boostDocument: (_id, _term, stored) => (stored?.kind === 'block' ? BLOCK_WEIGHT : 1),
  },
};

export function buildIndex(docs: readonly SearchDoc[]): MiniSearch<SearchDoc> {
  const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  index.addAll(docs);
  return index;
}

export function loadIndex(json: ReturnType<MiniSearch<SearchDoc>['toJSON']>): MiniSearch<SearchDoc> {
  return MiniSearch.loadJS<SearchDoc>(json, SEARCH_OPTIONS);
}

export interface Hit extends StoredDoc {
  score: number;
}

/** Синонимы в запросе весят меньше слов, которые набрал человек. */
const SYNONYM_WEIGHT = 0.7;

export function searchDocs(index: MiniSearch<SearchDoc>, query: string, synonyms: CompiledSynonyms, limit = 20): Hit[] {
  const own = searchTerms(query);
  if (own.length === 0) return [];
  const extra = expandQuery(query, synonyms);
  const ownSet = new Set(own);
  const results: SearchResult[] = index.search([...own, ...extra].join(' '), {
    boostTerm: (term) => (ownSet.has(term) ? 1 : SYNONYM_WEIGHT),
  });
  return results.slice(0, limit).map((result) => ({
    id: String(result.id),
    kind: result.kind as SearchKind,
    title: String(result.title),
    context: String(result.context),
    url: (result.url as string | null) ?? null,
    ...(typeof result.wave === 'number' ? { wave: result.wave } : {}),
    score: result.score,
  }));
}

export const KIND_TITLES: Record<SearchKind, string> = { topic: 'Темы', term: 'Термины', block: 'Блоки тем' };

export const KIND_ORDER: readonly SearchKind[] = ['topic', 'term', 'block'];

/** Результаты по группам в порядке «темы, термины, блоки»; внутри группы — по релевантности. */
export function groupHits(hits: readonly Hit[]): { kind: SearchKind; hits: Hit[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, hits: hits.filter((hit) => hit.kind === kind) })).filter((group) => group.hits.length > 0);
}

/** Порядок, в котором человек видит результаты: сначала темы, затем термины и блоки. */
export function displayOrder(hits: readonly Hit[]): Hit[] {
  return groupHits(hits).flatMap((group) => group.hits);
}
