/**
 * Синонимы и варианты написания (ТЗ, «Поиск»): «хеш» = «хэш» = hash,
 * «куча» = «пирамида» = heap, «ДП» = «динамическое программирование».
 *
 * В приложении словарь строится из глоссария: русское название термина,
 * английское и допустимые синонимы. В глоссарии пока три термина, поэтому
 * прототип добавляет к ним короткий список вручную; в волне 1 его заменит
 * глоссарий.
 */
import { isStopWord, stemToken, tokenize } from './text.ts';

export type SynonymGroup = readonly string[];

export const PROTOTYPE_SYNONYMS: readonly SynonymGroup[] = [
  ['хеш', 'хэш', 'hash'],
  ['кеш', 'кэш', 'cache'],
  ['куча', 'пирамида', 'heap'],
  ['таблица', 'table'],
  ['ДП', 'динамическое программирование', 'dynamic programming'],
  ['двоичный', 'бинарный', 'binary'],
  ['дерево', 'tree'],
  ['поиск', 'search'],
  ['сортировка', 'sort'],
  ['соединение', 'join'],
  ['взаимоблокировка', 'взаимная блокировка', 'deadlock'],
  ['основная теорема', 'master theorem'],
  // «O большое» набирают и латинской, и русской буквой «о».
  ['асимптотика', 'O большое', 'о большое', 'big O'],
  ['минимальное остовное дерево', 'MST'],
  ['Кнута — Морриса — Пратта', 'КМП', 'KMP'],
  ['математическое ожидание', 'матожидание', 'expected value'],
  ['плавающая точка', 'плавающая запятая', 'floating point'],
  ['обход в ширину', 'BFS'],
  ['обход в глубину', 'DFS'],
];

export interface GlossaryTermLike {
  term: string;
  en: string;
  synonyms: readonly string[];
}

/** Группа синонимов из термина глоссария: русское название, английское и синонимы. */
export function synonymGroupsFromGlossary(terms: readonly GlossaryTermLike[]): SynonymGroup[] {
  return terms.map((term) => [term.term, term.en, ...term.synonyms]);
}

/** Фраза как последовательность основ — со служебными словами: «O большое» ≠ «большое». */
function phraseStems(phrase: string): string[] {
  return tokenize(phrase).map(stemToken);
}

export type CompiledSynonyms = readonly (readonly string[][])[];

export function compileSynonyms(groups: readonly SynonymGroup[]): CompiledSynonyms {
  return groups.map((group) => group.map(phraseStems).filter((stems) => stems.length > 0));
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((stem, offset) => haystack[start + offset] === stem)) return true;
  }
  return false;
}

/**
 * Синонимы для текста документа — для индексов, которые не умеют расширять
 * запрос (так сравнивался Pagefind): если в тексте есть фраза группы,
 * к документу дописываются все фразы этой группы.
 */
export function expandDocument(text: string, groups: readonly SynonymGroup[]): string[] {
  const stems = phraseStems(text);
  return groups.filter((group) => group.some((phrase) => containsSequence(stems, phraseStems(phrase)))).flat();
}

/**
 * Дополнительные основы для запроса: если в запросе есть одна из фраз
 * группы, добавляются остальные фразы группы. Служебные слова не добавляются.
 */
export function expandQuery(query: string, synonyms: CompiledSynonyms): string[] {
  const stems = phraseStems(query);
  const present = new Set(stems);
  const extra = new Set<string>();
  for (const group of synonyms) {
    if (!group.some((phrase) => containsSequence(stems, phrase))) continue;
    for (const phrase of group) {
      for (const stem of phrase) {
        if (!present.has(stem) && !isStopWord(stem)) extra.add(stem);
      }
    }
  }
  return [...extra];
}
