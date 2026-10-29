#!/usr/bin/env node
/**
 * Итог Lighthouse CI для правки на GitHub: какие страницы и пороги не прошли.
 * Запускается после npm run lighthouse, если тот упал: подробный журнал CI
 * доступен не всем, а пометки (annotations) видны прямо в правке.
 */
import { existsSync, readFileSync } from 'node:fs';

const file = '.lighthouseci/assertion-results.json';
if (!existsSync(file)) {
  console.log('::error title=Lighthouse::Нет файла с итогами проверок — Lighthouse не дошёл до проверки порогов.');
  process.exit(0);
}
const results = JSON.parse(readFileSync(file, 'utf8'));
const failed = results.filter((item) => !item.passed);
const lines = failed.map((item) => {
  const page = new URL(item.url).pathname;
  const actual = typeof item.actual === 'number' ? Math.round(item.actual * 1000) / 1000 : item.actual;
  return `${page} — ${item.auditId ?? item.name}: ${actual}, порог ${item.operator ?? ''} ${item.expected}`;
});
const text = lines.join('\n').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
console.log(`::warning title=Lighthouse: не прошли пороги (${failed.length})::${text}`);
