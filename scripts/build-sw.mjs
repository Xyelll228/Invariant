#!/usr/bin/env node
/**
 * Service Worker для работы без сети (ТЗ: «Работает без сети после первого
 * посещения»). Запускается после astro build: Workbox кладёт в кеш все
 * страницы, скрипты, стили, шрифты и индекс поиска из папки dist.
 *
 * - Новая версия ждёт и включается при следующем открытии или по кнопке
 *   «Обновить» (skipWaiting: false — сообщение SKIP_WAITING от страницы).
 * - Страница, которой нет в кеше, без сети открывает offline/ с объяснением.
 * - Адреса /pr-preview/ основной Service Worker не обслуживает: у каждого
 *   превью свой Service Worker в своей папке и свой кеш.
 */
import { generateSW } from 'workbox-build';

function normalizeBase(path) {
  let result = path.trim();
  if (!result.startsWith('/')) result = `/${result}`;
  if (!result.endsWith('/')) result = `${result}/`;
  return result;
}

const base = normalizeBase(process.env.BASE_PATH ?? '/Invariant/');
const pr = process.env.PUBLIC_PREVIEW_PR?.trim() || null;

/**
 * Какие переходы между страницами обслуживать. Функция попадает в sw.js
 * текстом, поэтому адрес превью вписывается в неё строкой: замыкание на
 * переменные этого скрипта в Service Worker не переедет.
 * Основной сайт пропускает /pr-preview/: там живут превью со своими Service Worker.
 */
const excluded = pr === null ? `${base}pr-preview/` : null;
const isNavigation = new Function(
  '{ request, url }',
  excluded === null
    ? "return request.mode === 'navigate';"
    : `return request.mode === 'navigate' && !url.pathname.startsWith(${JSON.stringify(excluded)});`,
);

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist',
  globPatterns: ['**/*.{html,js,css,woff2,svg,png,json,webmanifest}'],
  globIgnores: ['sw.js', 'pr-preview/**'],
  swDest: 'dist/sw.js',
  cacheId: pr === null ? 'invariant' : `invariant-pr-${pr}`,
  directoryIndex: 'index.html',
  cleanupOutdatedCaches: true,
  skipWaiting: false,
  clientsClaim: false,
  inlineWorkboxRuntime: true,
  sourcemap: false,
  mode: 'production',
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  // Файлы сборки Astro с хешем в имени не нужно перепроверять по содержимому.
  dontCacheBustURLsMatching: /\/assets\/.+\.[\w-]{8}\.\w+$/,
  runtimeCaching: [
    {
      // Страница не из кеша: сначала сеть, без сети — понятная страница offline/.
      urlPattern: isNavigation,
      handler: 'NetworkOnly',
      options: { precacheFallback: { fallbackURL: 'offline/index.html' } },
    },
  ],
});

for (const warning of warnings) console.warn(`Service Worker: ${warning}`);
console.log(`Service Worker: в кеш при первом посещении — ${count} файлов, ${(size / 1024).toFixed(0)} КБ (область ${base}).`);
