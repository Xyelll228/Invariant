#!/usr/bin/env node
/**
 * Проверка лицензий всех пакетов из package-lock.json.
 * Пропускаем только свободные лицензии; материалы с ограничениями NC и ND
 * запрещены (ТЗ, раздел «Качество», автопроверка «Лицензии»).
 *
 * Если пакет не указал лицензию в стандартном поле, его можно добавить в
 * EXCEPTIONS с точной версией и найденной вручную лицензией — после
 * обновления версии пакет придётся проверить заново.
 */
import { readFileSync } from 'node:fs';

/** Свободные лицензии (SPDX). Шрифты — OFL, данные — CC0 и CC BY. */
const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'Artistic-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'OFL-1.1',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]);

/** Пакеты без стандартного поля license. Ключ — имя@версия. */
const EXCEPTIONS = {
  // Поле устаревшего формата licenses: [{ type: "BSD" }], файл LICENSE — BSD-3-Clause.
  'parse-cache-control@1.0.1': 'BSD-3-Clause',
};

const FORBIDDEN_PATTERN = /-(NC|ND)(-|$)/;

function tokenize(expression) {
  return expression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/).filter(Boolean);
}

/** Разбор выражения SPDX: AND — нужны все, OR — достаточно одной, WITH — исключение к лицензии. */
function evaluate(expression) {
  const tokens = tokenize(expression);
  let index = 0;

  function primary() {
    const token = tokens[index++];
    if (token === '(') {
      const value = orExpression();
      if (tokens[index++] !== ')') throw new Error(`не закрыта скобка в «${expression}»`);
      return value;
    }
    if (!token || token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') {
      throw new Error(`не разобрать «${expression}»`);
    }
    let id = token.replace(/\+$/, '');
    if (tokens[index] === 'WITH') index += 2;
    if (FORBIDDEN_PATTERN.test(id)) return { ok: false, reason: `${id} — ограничение NC или ND запрещено` };
    // Устаревшие формы: GPL-2.0+ → GPL-2.0-or-later и т. п. не разрешаем молча.
    id = id.trim();
    return ALLOWED.has(id) ? { ok: true } : { ok: false, reason: `${id} нет в списке разрешённых` };
  }

  function andExpression() {
    let left = primary();
    while (tokens[index] === 'AND') {
      index++;
      const right = primary();
      left = left.ok && right.ok ? { ok: true } : { ok: false, reason: left.ok ? right.reason : left.reason };
    }
    return left;
  }

  function orExpression() {
    let left = andExpression();
    while (tokens[index] === 'OR') {
      index++;
      const right = andExpression();
      left = left.ok || right.ok ? { ok: true } : left;
    }
    return left;
  }

  const result = orExpression();
  if (index !== tokens.length) throw new Error(`лишнее в конце «${expression}»`);
  return result;
}

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const problems = [];
const counts = new Map();

for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (path === '') continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const id = `${name}@${meta.version}`;
  let license = typeof meta.license === 'string' ? meta.license : meta.license?.type;
  if (!license && EXCEPTIONS[id]) license = EXCEPTIONS[id];
  if (!license) {
    problems.push(`${id}: лицензия не указана`);
    continue;
  }
  try {
    const result = evaluate(license);
    if (!result.ok) problems.push(`${id}: ${license} — ${result.reason}`);
    else counts.set(license, (counts.get(license) ?? 0) + 1);
  } catch (error) {
    problems.push(`${id}: ${error.message}`);
  }
}

if (problems.length > 0) {
  console.error(`Проверка лицензий: проблем — ${problems.length}`);
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}: ${count}`);
console.log(`Проверка лицензий: все пакеты под свободными лицензиями (${summary.join(', ')}).`);
