import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';

/**
 * Адрес и путь сайта задаются при сборке.
 * Основная версия: https://xyelll228.github.io/Invariant/
 * Превью правки:   https://xyelll228.github.io/Invariant/pr-preview/pr-N/
 * В GitHub Actions BASE_PATH берётся из имени репозитория, поэтому
 * при переименовании репозитория конфиг менять не нужно.
 */
const site = process.env.SITE_URL ?? 'https://xyelll228.github.io';
const base = normalizeBase(process.env.BASE_PATH ?? '/Invariant/');

/**
 * Шрифты Fontsource с font-display: optional вместо swap. Если шрифт не
 * успел загрузиться к первой отрисовке, страница остаётся на системном
 * шрифте и текст не перестраивается (CLS ≤ 0,1 из ТЗ). Основные файлы
 * шрифта предзагружаются (BaseLayout), а при повторных визитах берутся из кеша.
 */
function fontDisplayOptional() {
  return {
    name: 'invariant:font-display-optional',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const path = id.split('?')[0] ?? '';
      if (!/@fontsource(?:-variable)?\/[^/]+\/[^/]+\.css$/.test(path)) return null;
      return { code: code.replaceAll('font-display: swap;', 'font-display: optional;'), map: null };
    },
  };
}

function normalizeBase(path: string): string {
  let result = path.trim();
  if (!result.startsWith('/')) result = `/${result}`;
  if (!result.endsWith('/')) result = `${result}/`;
  return result;
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  // HTML-правила сжатия пробелов: не склеивают слова между тегами.
  compressHTML: true,
  build: {
    format: 'directory',
    // Без подчёркивания в начале: GitHub Pages с Jekyll прячет такие папки.
    assets: 'assets',
    inlineStylesheets: 'never',
  },
  integrations: [preact(), mdx()],
  // Подсветку Shiki не используем: её встроенные стили несовместимы с CSP.
  markdown: {
    syntaxHighlight: false,
  },
  i18n: {
    locales: ['ru'],
    defaultLocale: 'ru',
    routing: {
      prefixDefaultLocale: true,
      // Корень ведёт на /ru/ своей страницей src/pages/index.astro.
      redirectToDefaultLocale: false,
    },
  },
  // CSP задаётся тегом meta: свои HTTP-заголовки GitHub Pages задать не даёт.
  // Хеши своих скриптов и стилей Astro добавляет сам.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  prefetch: false,
  devToolbar: { enabled: false },
  vite: {
    plugins: [fontDisplayOptional()],
    build: {
      // Никаких data:-адресов для шрифтов и картинок: CSP их не пропустит.
      assetsInlineLimit: 0,
    },
  },
});
