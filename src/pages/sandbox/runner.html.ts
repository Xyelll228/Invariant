/**
 * Страница песочницы для вложенного окна (iframe sandbox="allow-scripts").
 * Собирается при сборке: встроенный скрипт и его хеш в CSP. CSP запрещает
 * всё, кроме этого скрипта и фоновых потоков из blob: — без сети, картинок,
 * стилей и вложенных окон.
 */
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import runner from '../../sandbox/runner.js?raw';
import prefix from '../../sandbox/worker-prefix.js?raw';
import suffix from '../../sandbox/worker-suffix.js?raw';

export const prerender = true;

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

export const GET: APIRoute = () => {
  const script = buildRunnerScript();
  const hash = `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`;
  const policy = [`script-src '${hash}' blob:`, ...RUNNER_POLICY_WITHOUT_SCRIPT].join('; ');
  const html = [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="content-security-policy" content="${policy}">`,
    '<meta name="robots" content="noindex">',
    '<title>Песочница</title>',
    '</head>',
    '<body>',
    `<script>${script}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
