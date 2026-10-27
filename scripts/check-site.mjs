#!/usr/bin/env node
/**
 * Проверка собранного сайта (по умолчанию папка dist).
 *
 * 1. Внутренние ссылки и ресурсы ведут на существующие файлы, якоря — на существующие id.
 * 2. Все внутренние адреса начинаются с base: иначе на GitHub Pages они уйдут мимо сайта.
 * 3. На каждой странице ровно один тег CSP, и в нём есть хеши всех встроенных скриптов и стилей.
 * 4. Нет атрибутов style="…" и on…="…": CSP без 'unsafe-inline' их не пропустит.
 *
 * Запуск: BASE_PATH=/Invariant/ node scripts/check-site.mjs [папка]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'node-html-parser';

const dist = process.argv[2] ?? 'dist';
const base = normalizeBase(process.env.BASE_PATH ?? '/Invariant/');
const problems = [];

function normalizeBase(path) {
  let result = path.trim();
  if (!result.startsWith('/')) result = `/${result}`;
  if (!result.endsWith('/')) result = `${result}/`;
  return result;
}

function htmlFiles(dir) {
  const result = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) result.push(...htmlFiles(full));
    else if (name.endsWith('.html')) result.push(full);
  }
  return result;
}

/** Адрес страницы на сайте по пути файла: dist/ru/index.html → /Invariant/ru/ */
function pageUrl(file) {
  const rel = relative(dist, file).split(sep).join('/');
  if (rel === 'index.html') return base;
  if (rel.endsWith('/index.html')) return `${base}${rel.slice(0, -'index.html'.length)}`;
  return `${base}${rel}`;
}

/** Файл в dist для адреса на сайте или null, если адрес вне сайта. */
function fileForPath(pathname) {
  if (!pathname.startsWith(base)) return null;
  const rest = decodeURIComponent(pathname.slice(base.length));
  const candidates = rest === '' || rest.endsWith('/') ? [join(dist, rest, 'index.html')] : [join(dist, rest), join(dist, rest, 'index.html')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? candidates[0];
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const root = parse(readFileSync(file, 'utf8'));
    idCache.set(file, new Set(root.querySelectorAll('[id]').map((element) => element.getAttribute('id'))));
  }
  return idCache.get(file);
}

function sha256(text) {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

function directiveSources(policy, names) {
  const sources = new Set();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name && names.includes(name.toLowerCase())) for (const value of values) sources.add(value.replace(/^'|'$/g, ''));
  }
  return sources;
}

const EXECUTABLE_SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const files = htmlFiles(dist);
if (files.length === 0) problems.push(`В папке ${dist} нет HTML-файлов — сайт не собран?`);

for (const file of files) {
  const where = relative(dist, file);
  const html = readFileSync(file, 'utf8');
  const root = parse(html);
  const here = pageUrl(file);

  // CSP
  const cspTags = root.querySelectorAll('meta').filter((meta) => (meta.getAttribute('http-equiv') ?? '').toLowerCase() === 'content-security-policy');
  if (cspTags.length !== 1) {
    problems.push(`${where}: тегов CSP ${cspTags.length}, нужен ровно один`);
  }
  const policy = cspTags[0]?.getAttribute('content') ?? '';
  const scriptSources = directiveSources(policy, ['script-src', 'script-src-elem']);
  const styleSources = directiveSources(policy, ['style-src', 'style-src-elem']);

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] ?? '';
    if (/\bsrc\s*=/.test(attributes)) continue;
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1] ?? '').toLowerCase();
    if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue;
    const code = match[2] ?? '';
    if (!scriptSources.has(sha256(code))) {
      problems.push(`${where}: встроенный скрипт без хеша в CSP: ${code.trim().slice(0, 60)}…`);
    }
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const code = match[1] ?? '';
    if (!styleSources.has(sha256(code))) {
      problems.push(`${where}: встроенный стиль без хеша в CSP: ${code.trim().slice(0, 60)}…`);
    }
  }

  for (const element of root.querySelectorAll('*')) {
    for (const name of Object.keys(element.attributes)) {
      const lower = name.toLowerCase();
      if (lower === 'style') problems.push(`${where}: атрибут style у <${element.tagName.toLowerCase()}> — CSP его заблокирует`);
      if (lower.startsWith('on')) problems.push(`${where}: обработчик ${name} в разметке — CSP его заблокирует`);
    }
  }

  // Ссылки и ресурсы
  const references = [];
  for (const element of root.querySelectorAll('[href], [src], [action], [srcset]')) {
    for (const attribute of ['href', 'src', 'action']) {
      const value = element.getAttribute(attribute);
      if (value !== undefined) references.push(value);
    }
    const srcset = element.getAttribute('srcset');
    if (srcset) for (const candidate of srcset.split(',')) references.push(candidate.trim().split(/\s+/)[0]);
  }

  for (const raw of references) {
    const value = raw.trim();
    if (value === '') {
      problems.push(`${where}: пустая ссылка`);
      continue;
    }
    if (/^(https?:|mailto:|tel:)/i.test(value)) continue;
    if (/^(javascript:|data:|\/\/)/i.test(value)) {
      problems.push(`${where}: недопустимая ссылка ${value}`);
      continue;
    }
    const target = new URL(value, `https://site.invalid${here}`);
    const fragment = decodeURIComponent(target.hash.slice(1));
    const targetFile = value.startsWith('#') ? file : fileForPath(target.pathname);
    if (targetFile === null) {
      problems.push(`${where}: ссылка ${value} ведёт мимо base ${base}`);
      continue;
    }
    if (!existsSync(targetFile)) {
      problems.push(`${where}: нет файла для ссылки ${value}`);
      continue;
    }
    if (fragment && targetFile.endsWith('.html') && !idsOf(targetFile).has(fragment)) {
      problems.push(`${where}: нет якоря #${fragment} для ссылки ${value}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Проверка сайта: найдено проблем — ${problems.length}`);
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}
console.log(`Проверка сайта: ${files.length} страниц, ссылки, якоря и CSP в порядке (base ${base}).`);
