#!/usr/bin/env node
/**
 * Сравнение библиотек поиска на 50 контрольных запросах (ТЗ, «Поиск»):
 * MiniSearch со своим стеммером и синонимами против Pagefind со
 * встроенным стеммингом русского. Пишет отчёт в docs/search-prototype.md.
 *
 * Запуск: npm run search:compare. Pagefind ищет в браузере, поэтому
 * сравнение идёт в Chromium через Playwright. Свой Chromium:
 * PLAYWRIGHT_CHROMIUM_PATH=/путь/к/chrome npm run search:compare
 *
 * Чтобы сравнение было честным, тексты и запросы для обеих библиотек
 * одинаково нормализуются (регистр, «ё», C++), а синонимы Pagefind получает
 * при индексации — сам он расширять запрос не умеет.
 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import * as pagefind from 'pagefind';
import { CONTROL_QUERIES } from '../src/lib/search/control-queries.ts';
import { buildCorpus } from '../src/lib/search/corpus.ts';
import { buildIndex, displayOrder, KIND_ORDER, searchDocs, type SearchDoc } from '../src/lib/search/engine.ts';
import { evaluate, TOP, type Evaluation, type RankedItem } from '../src/lib/search/evaluate.ts';
import { compileSynonyms, expandDocument, PROTOTYPE_SYNONYMS, synonymGroupsFromGlossary } from '../src/lib/search/synonyms.ts';
import { normalize } from '../src/lib/search/text.ts';

const root = new URL('../', import.meta.url).pathname;
const { docs, glossary } = buildCorpus(root);
const groups = [...synonymGroupsFromGlossary(glossary), ...PROTOTYPE_SYNONYMS];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function folderSize(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await folderSize(full);
      files += inner.files;
      bytes += inner.bytes;
    } else {
      files++;
      bytes += (await stat(full)).size;
    }
  }
  return { files, bytes };
}

// ---------- MiniSearch ----------
const miniStarted = performance.now();
const miniIndex = buildIndex(docs);
const miniBuildMs = performance.now() - miniStarted;
const synonyms = compileSynonyms(groups);
const miniJson = JSON.stringify(miniIndex);
const queryStarted = performance.now();
const mini = evaluate(CONTROL_QUERIES, (query) => displayOrder(searchDocs(miniIndex, query, synonyms)));
const miniQueryMs = (performance.now() - queryStarted) / CONTROL_QUERIES.length;

// ---------- Pagefind ----------
const site = await mkdtemp(join(tmpdir(), 'invariant-pagefind-'));
const { index, errors } = await pagefind.createIndex({ forceLanguage: 'ru' });
if (!index) throw new Error(`Pagefind не создал индекс: ${errors.join('; ')}`);
for (const doc of docs as SearchDoc[]) {
  const extra = expandDocument(`${doc.title} ${doc.context} ${doc.text}`, groups);
  const html = [
    '<html lang="ru"><body>',
    `<h1>${escapeHtml(normalize(doc.title))}</h1>`,
    `<p>${escapeHtml(normalize(doc.context))}</p>`,
    `<p>${escapeHtml(normalize(doc.text))}</p>`,
    extra.length > 0 ? `<p>${escapeHtml(normalize(extra.join(' ')))}</p>` : '',
    `<span data-pagefind-meta="title" hidden>${escapeHtml(doc.title)}</span>`,
    `<span data-pagefind-meta="kind" hidden>${doc.kind}</span>`,
    '</body></html>',
  ].join('');
  const result = await index.addHTMLFile({ url: `/${encodeURIComponent(doc.id)}/`, content: html });
  if (result.errors.length > 0) throw new Error(result.errors.join('; '));
}
await index.writeFiles({ outputPath: join(site, 'pagefind') });
await pagefind.close();
const pagefindSize = await folderSize(join(site, 'pagefind'));

const types: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  if (path === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Pagefind</title>');
    return;
  }
  try {
    const body = await readFile(join(site, path));
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Сервер не запустился');

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${address.port}/`);
const pagefindResults = await page.evaluate(
  async ({ queries, modulePath }) => {
    // Путь передаётся строкой: модуль есть только на тестовом сервере, не в проекте.
    const engine = await import(modulePath);
    await engine.init();
    const results: Record<string, { title: string; kind: string }[]> = {};
    let total = 0;
    for (const query of queries) {
      const started = performance.now();
      const search = await engine.search(query);
      const data = await Promise.all(search.results.slice(0, 20).map((result: { data(): Promise<{ meta: Record<string, string> }> }) => result.data()));
      total += performance.now() - started;
      results[query] = data.map((item) => ({ title: item.meta.title ?? '', kind: item.meta.kind ?? '' }));
    }
    return { results, averageMs: total / queries.length };
  },
  { queries: CONTROL_QUERIES.map((item) => normalize(item.query)), modulePath: '/pagefind/pagefind.js' },
);
await browser.close();
server.close();
await rm(site, { recursive: true, force: true });

const pf = evaluate(CONTROL_QUERIES, (query) => {
  const items = (pagefindResults.results[normalize(query)] ?? []) as RankedItem[];
  // Тот же порядок показа, что и у MiniSearch: группы «темы, термины, блоки».
  return KIND_ORDER.flatMap((kind) => items.filter((item) => item.kind === kind));
});

// ---------- Отчёт ----------
function byKind(result: Evaluation) {
  const kinds = [...new Set(CONTROL_QUERIES.map((item) => item.kind))];
  return kinds.map((kind) => {
    const items = result.outcomes.filter((item) => item.kind === kind);
    return { kind, hits: items.filter((item) => item.rank !== null && item.rank <= TOP).length, total: items.length };
  });
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} КБ`;
const percent = (result: Evaluation) => `${Math.round((result.hits / result.total) * 100)}%`;
const rankText = (rank: number | null) => (rank === null ? '—' : String(rank));
const miniKinds = byKind(mini);
const pfKinds = byKind(pf);

const lines = [
  '# Поиск по-русски: выбор библиотеки',
  '',
  '> Отчёт создан командой `npm run search:compare`. Не правьте его руками — перезапустите сравнение.',
  '',
  `Сравнение на ${CONTROL_QUERIES.length} контрольных запросах из \`src/lib/search/control-queries.ts\` (ТЗ, раздел «Поиск»). ` +
    `Индекс — ${docs.length} документов: все темы каталога по названиям, модулям и разделам, термины глоссария и блоки темы-образца. ` +
    `Попадание — верный ответ среди первых ${TOP} результатов своей группы; группы идут в порядке «темы, термины, блоки». ` +
    'Порог из критериев приёмки — 90%.',
  '',
  'Оговорка: запросы составлены по требованиям ТЗ (формы слов, синонимы, опечатки, английские названия, сокращения), ' +
    'а настройки MiniSearch подбирались на них же. Поэтому в волне 1 набор пополнится запросами по написанным темам, ' +
    'и автотест поиска будет проверять уже его.',
  '',
  '## Итог',
  '',
  '| | MiniSearch + свой стеммер и синонимы | Pagefind |',
  '| --- | --- | --- |',
  `| Попаданий в первые ${TOP} | **${mini.hits} из ${mini.total} (${percent(mini)})** | ${pf.hits} из ${pf.total} (${percent(pf)}) |`,
  ...miniKinds.map((item, index) => `| — ${item.kind} | ${item.hits} из ${item.total} | ${pfKinds[index]?.hits ?? 0} из ${pfKinds[index]?.total ?? 0} |`),
  `| Размер индекса | ${kb(miniJson.length)}, сжатый ${kb(gzipSync(miniJson).length)}; грузится целиком | ${kb(pagefindSize.bytes)} в ${pagefindSize.files} файлах; грузится частями |`,
  `| Время запроса | ${miniQueryMs.toFixed(1)} мс (сборка индекса ${miniBuildMs.toFixed(0)} мс) | ${pagefindResults.averageMs.toFixed(1)} мс в Chromium вместе с загрузкой частей |`,
  '| Формы слов | свой стеммер Snowball | встроенный стемминг |',
  '| Синонимы | расширение запроса из глоссария | нет: только приписывание синонимов к тексту при индексации |',
  '| Опечатки | нечёткое совпадение (1–2 буквы) | нет: только поиск по началу слова |',
  '| Подсказки при вводе | поиск по началу последнего слова | поиск по началу слова |',
  '',
  '## Запросы',
  '',
  `Место первого верного ответа в своей группе; «—» — ответа нет среди первых 20.`,
  '',
  '| Запрос | Вид | MiniSearch | Pagefind |',
  '| --- | --- | --- | --- |',
  ...mini.outcomes.map((item, index) => `| ${item.query} | ${item.kind} | ${rankText(item.rank)} | ${rankText(pf.outcomes[index]?.rank ?? null)} |`),
  '',
];
await writeFile(join(root, 'docs/search-prototype.md'), `${lines.join('\n')}\n`);
console.log(`MiniSearch: ${mini.hits}/${mini.total}, Pagefind: ${pf.hits}/${pf.total}. Отчёт — docs/search-prototype.md`);
