import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CONTROL_QUERIES } from '../../src/lib/search/control-queries.ts';
import { buildCorpus } from '../../src/lib/search/corpus.ts';
import { buildIndex, displayOrder, groupHits, searchDocs } from '../../src/lib/search/engine.ts';
import { evaluate, TOP } from '../../src/lib/search/evaluate.ts';
import { stemRussian } from '../../src/lib/search/stem-ru.ts';
import { compileSynonyms, expandQuery, PROTOTYPE_SYNONYMS, synonymGroupsFromGlossary } from '../../src/lib/search/synonyms.ts';
import { normalize, searchTerms, tokenize } from '../../src/lib/search/text.ts';

const root = new URL('../../', import.meta.url).pathname;
const { docs, glossary } = buildCorpus(root);
const synonyms = compileSynonyms([...synonymGroupsFromGlossary(glossary), ...PROTOTYPE_SYNONYMS]);
const index = buildIndex(docs);

describe('стеммер русского языка', () => {
  it('совпадает с эталонной реализацией Snowball на всех словах ТЗ и каталога', () => {
    const oracle = createRequire(import.meta.url)('snowball-stemmers').newStemmer('russian') as { stem(word: string): string };
    const text = ['docs/tz.md', 'docs/catalog.md'].map((file) => readFileSync(`${root}${file}`, 'utf8')).join(' ');
    const words = [...new Set(normalize(text).match(/[а-я]+/g) ?? [])];
    expect(words.length).toBeGreaterThan(3000);
    const mismatches = words.filter((word) => stemRussian(word) !== oracle.stem(word));
    expect(mismatches).toEqual([]);
  });

  it('сводит формы слова к одной основе', () => {
    const forms = ['сортировка', 'сортировки', 'сортировкой', 'сортировку', 'сортировках'];
    expect(new Set(forms.map(stemRussian))).toEqual(new Set(['сортировк']));
    expect(stemRussian('подсчётом')).toBe(stemRussian('подсчетом'));
  });
});

describe('подготовка текста', () => {
  it('регистр, ё, C++ и подчёркивание', () => {
    expect(tokenize('Хеш-таблицы в C++: unique_ptr, Ёлка')).toEqual(['хеш', 'таблицы', 'в', 'cpp', 'unique_ptr', 'елка']);
  });

  it('служебные слова не ищутся', () => {
    expect(searchTerms('обход в глубину и в ширину')).toEqual(['обход', 'глубин', 'ширин']);
  });

  it('синонимы расширяют запрос, но «большое» без «O» — не асимптотика', () => {
    expect(expandQuery('хэш-таблица', synonyms)).toEqual(expect.arrayContaining(['хеш', 'hash', 'table']));
    expect(expandQuery('O большое', synonyms)).toEqual(expect.arrayContaining(['асимптотик']));
    expect(expandQuery('большие числа', synonyms)).not.toContain('асимптотик');
    expect(expandQuery('стабильная сортировка', synonyms)).toEqual(expect.arrayContaining(['устойчив']));
  });
});

describe('контрольные запросы', () => {
  it('ровно 50, и все верные ответы есть в индексе', () => {
    expect(CONTROL_QUERIES).toHaveLength(50);
    const titles = new Set(docs.map((doc) => doc.title.toLocaleLowerCase('ru-RU')));
    const missing = CONTROL_QUERIES.flatMap((item) => item.expect).filter((title) => !titles.has(title.toLocaleLowerCase('ru-RU')));
    expect(missing).toEqual([]);
  });

  it(`нужная тема в первых ${TOP} результатах — не меньше чем для 90% запросов`, () => {
    // Оцениваем порядок, который видит человек: темы, затем термины и блоки.
    const result = evaluate(CONTROL_QUERIES, (query) => displayOrder(searchDocs(index, query, synonyms)));
    const misses = result.outcomes.filter((item) => item.rank === null || item.rank > TOP);
    expect(result.hits / result.total, `промахи: ${JSON.stringify(misses, null, 2)}`).toBeGreaterThanOrEqual(0.9);
  });

  it('результаты группируются: темы, термины, блоки', () => {
    const groups = groupHits(searchDocs(index, 'сортировка вставками', synonyms));
    expect(groups.map((group) => group.kind)).toEqual(['topic', 'term', 'block']);
  });

  it('индекс переживает сохранение в JSON', async () => {
    const { loadIndex } = await import('../../src/lib/search/engine.ts');
    const restored = loadIndex(JSON.parse(JSON.stringify(index)));
    expect(searchDocs(restored, 'дийкстра', synonyms).map((hit) => hit.id)).toEqual(searchDocs(index, 'дийкстра', synonyms).map((hit) => hit.id));
  });
});
