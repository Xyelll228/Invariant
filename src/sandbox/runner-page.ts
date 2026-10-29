/**
 * Страница песочницы (sandbox/runner.html) и её скрипт. Собирается при сборке:
 * встроенный скрипт, его хеш в CSP. CSP страницы запрещает всё, кроме этого
 * скрипта и фоновых потоков из blob: — без сети, картинок, стилей и вложенных окон.
 *
 * Приложение кладёт эту страницу во вложенное окно атрибутом srcdoc (см.
 * src/lib/sandbox/client.ts). Такое окно получает CSP и страницы песочницы, и
 * страницы приложения, поэтому хеш скрипта песочницы и фоновые потоки из blob:
 * разрешены и в CSP страниц приложения (BaseLayout).
 */
import { scriptHash } from '../lib/csp.ts';
import runner from './runner.js?raw';
import prefix from './worker-prefix.js?raw';
import suffix from './worker-suffix.js?raw';

/** Строка JS без «</script>» и «<!--» внутри: такие сочетания сломали бы HTML. */
function jsString(text: string): string {
  return JSON.stringify(text).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
}

export function buildRunnerScript(): string {
  return runner
    .replace('__INVARIANT_PREFIX__', () => jsString(prefix.trimEnd()))
    .replace('__INVARIANT_SUFFIX__', () => jsString(suffix.trim()))
    .trim();
}

export const RUNNER_POLICY_WITHOUT_SCRIPT = [
  "default-src 'none'",
  'worker-src blob:',
  'child-src blob:',
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

/** Хеш скрипта песочницы для CSP. */
export function runnerScriptHash(): `sha256-${string}` {
  return scriptHash(buildRunnerScript());
}

export function buildRunnerPage(): string {
  const policy = [`script-src '${runnerScriptHash()}' blob:`, ...RUNNER_POLICY_WITHOUT_SCRIPT].join('; ');
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="content-security-policy" content="${policy}">`,
    '<meta name="robots" content="noindex">',
    '<title>Песочница</title>',
    '</head>',
    '<body>',
    `<script>${buildRunnerScript()}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
