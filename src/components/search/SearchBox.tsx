// cspell:ignore дийкстра хэш — нарочно написанные с ошибкой примеры запросов
/**
 * Поиск по справочнику: результаты появляются при вводе и группируются —
 * темы, термины, блоки. Индекс загружается при первом обращении к полю и
 * дальше работает без сети.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type MiniSearch from 'minisearch';
import { buildIndex, groupHits, KIND_TITLES, loadIndex, searchDocs, SEARCH_INDEX_VERSION, type SearchDoc, type SearchIndexFile } from '../../lib/search/engine.ts';
import type { CompiledSynonyms } from '../../lib/search/synonyms.ts';
import './search.css';

export interface SearchBoxProps {
  /** Адрес файла индекса с учётом base. */
  indexUrl: string;
  /** base сайта: к нему приклеиваются адреса результатов. */
  base: string;
}

/** Сколько результатов показывать в каждой группе. */
const PER_GROUP = 5;

type LoadState = { status: 'idle' | 'loading' } | { status: 'ready'; index: MiniSearch<SearchDoc>; synonyms: CompiledSynonyms } | { status: 'error'; message: string };

/**
 * Заметки и свои карточки человека лежат только в браузере: их маленький индекс
 * строится здесь же. Хранилище подключается отдельным файлом — только в поиске.
 */
async function loadPersonalIndex(): Promise<MiniSearch<SearchDoc> | null> {
  try {
    const { personalSearchDocs } = await import('../../lib/learning/personal.ts');
    const docs = await personalSearchDocs();
    return docs.length > 0 ? buildIndex(docs) : null;
  } catch {
    return null;
  }
}

export default function SearchBox({ indexUrl, base }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [personal, setPersonal] = useState<MiniSearch<SearchDoc> | null>(null);
  const loading = useRef<Promise<void> | null>(null);

  function ensureIndex(): void {
    if (loading.current) return;
    setState({ status: 'loading' });
    void loadPersonalIndex().then(setPersonal);
    loading.current = (async () => {
      try {
        const response = await fetch(indexUrl);
        if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
        const file = (await response.json()) as SearchIndexFile;
        if (file.version !== SEARCH_INDEX_VERSION) throw new Error('файл индекса другой версии — обновите страницу');
        setState({ status: 'ready', index: loadIndex(file.index), synonyms: file.synonyms });
      } catch (error) {
        loading.current = null;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 80);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = useMemo(() => {
    if (state.status !== 'ready' || debounced.trim() === '') return null;
    const own = personal ? searchDocs(personal, debounced, state.synonyms, 20) : [];
    return groupHits([...searchDocs(state.index, debounced, state.synonyms, 60), ...own]);
  }, [state, personal, debounced]);

  const found = groups?.reduce((sum, group) => sum + group.hits.length, 0) ?? 0;

  return (
    <div class="search">
      <label for="search-input">Поиск по справочнику</label>
      <input
        id="search-input"
        type="search"
        class="search__input"
        placeholder="Например: сортировка вставками, хэш, дийкстра"
        autocomplete="off"
        spellcheck={false}
        value={query}
        onFocus={ensureIndex}
        onInput={(event) => {
          ensureIndex();
          setQuery(event.currentTarget.value);
        }}
      />
      <p class="search__status muted" role="status">
        {state.status === 'loading' && 'Загружаю индекс…'}
        {state.status === 'error' && `Поиск не загрузился: ${state.message}.`}
        {groups !== null && (found === 0 ? 'Ничего не найдено. Попробуйте другое слово или английское название.' : `Найдено: ${found}.`)}
      </p>
      {groups !== null &&
        groups.map((group) => (
          <section class="search__group" aria-label={KIND_TITLES[group.kind]}>
            <h3 class="search__group-title">{KIND_TITLES[group.kind]}</h3>
            <ul class="search__results">
              {group.hits.slice(0, PER_GROUP).map((hit) => (
                <li class="search__result">
                  {hit.url === null ? <span class="search__title">{hit.title}</span> : <a class="search__title" href={`${base}${hit.url}`}>{hit.title}</a>}
                  <span class="search__context muted">
                    {hit.context}
                    {hit.wave !== undefined ? ` · тема выйдет в волне ${hit.wave}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {group.hits.length > PER_GROUP && <p class="muted search__more">И ещё {group.hits.length - PER_GROUP}.</p>}
          </section>
        ))}
    </div>
  );
}
