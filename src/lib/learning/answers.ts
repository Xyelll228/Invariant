/**
 * Проверка ответов (ТЗ, «Тренажёры»): свободный ввод нормализуется —
 * «n*log(n)», «nlogn» и «n log₂ n» — один ответ; в терминах прощается одна
 * опечатка; если вопрос про Θ, ответ с O не засчитывается.
 */
import type { ChoiceBody, FreeBody, LineBody, OrderBody } from './question-types.ts';

/** Текст для сравнения: регистр, «ё», пробелы, кавычки и точка в конце не важны. */
export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»"“”„]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '')
    .trim();
}

/** Число: запятая и точка как разделитель, пробелы между разрядами. */
export function parseNumber(text: string): number | null {
  const clean = text.replace(/\s+/g, '').replace(',', '.').replace(/[−–]/g, '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  return Number(clean);
}

/** Расстояние Дамерау — Левенштейна (с перестановкой соседних букв), не больше limit + 1. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((d[i - 1]?.[j] ?? 0) + 1, (d[i]?.[j - 1] ?? 0) + 1, (d[i - 1]?.[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, (d[i - 2]?.[j - 2] ?? 0) + 1);
      (d[i] as number[])[j] = value;
    }
  }
  return d[a.length]?.[b.length] ?? limit + 1;
}

export type AsymptoticSymbol = 'O' | 'Ω' | 'Θ' | 'o' | 'ω';

export interface Complexity {
  symbol: AsymptoticSymbol | null;
  /** Выражение в едином виде: «n^2», «nlogn», «1». */
  body: string;
}

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/**
 * Приводит запись сложности к единому виду. Понимает O, Ω, Θ, o, ω (и
 * русскую «О»), «theta», степени ², ^2, **2, логарифмы log, log₂, lg, ln и
 * знаки умножения: «O(n*log(n))», «nlogn» и «n log₂ n» дают одно и то же.
 */
export function parseComplexity(text: string): Complexity | null {
  let rest = text.trim().replace(/[\s ]+/g, ' ');
  let symbol: AsymptoticSymbol | null = null;
  const prefix = /^(theta|тета|omega|омега|big-?o|θ|Θ|Ω|ω|O|О|o|о)\s*\(\s*(.*)\s*\)$/u.exec(rest);
  if (prefix) {
    const name = prefix[1] ?? '';
    symbol =
      /^(theta|тета|θ|Θ)$/iu.test(name) ? 'Θ'
      : /^(omega|омега|Ω)$/iu.test(name) && name !== 'ω' ? 'Ω'
      : name === 'ω' ? 'ω'
      : name === 'o' || name === 'о' ? 'o'
      : 'O';
    rest = prefix[2] ?? '';
  }
  let body = rest
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => `^${SUPERSCRIPTS[digit] ?? ''}`)
    .replace(/\*\*/g, '^')
    .replace(/[*·×⋅]/g, '')
    .replace(/\s+/g, '')
    .replace(/log_?2|log₂|lg|ln/g, 'log')
    .replace(/log\(([a-z0-9^]+)\)/g, 'log$1')
    .replace(/\^\((\d+)\)/g, '^$1')
    .replace(/\^1(?!\d)/g, '');
  // Скобки вокруг всего выражения: «(n^2)».
  while (/^\(.*\)$/.test(body)) body = body.slice(1, -1);
  if (body === '' || /[^a-z0-9^+\-/()!]/.test(body)) return null;
  // Множители в привычном порядке: «log n · n» → «nlogn».
  if (body === 'lognn') body = 'nlogn';
  return { symbol, body };
}

/** Подходит ли обозначение: в вопросе про Θ — только Θ; в вопросе про O — O или более точное Θ. */
function symbolAccepted(expected: AsymptoticSymbol | null, given: AsymptoticSymbol | null): boolean {
  if (given === null || expected === null) return true;
  if (expected === given) return true;
  if (expected === 'O' || expected === 'Ω') return given === 'Θ';
  return false;
}

export function complexityEquals(expectedText: string, givenText: string): boolean {
  const expected = parseComplexity(expectedText);
  const given = parseComplexity(givenText);
  if (!expected || !given) return false;
  return expected.body === given.body && symbolAccepted(expected.symbol, given.symbol);
}

/** Вывод программы: пробелы в конце строк и пустые строки в конце не важны. */
export function normalizeOutputText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/** Список целых чисел из ответа: «[1, 2, 3]», «1, 2, 3» и «1 2 3» — один ответ. */
export function parseNumberList(text: string): number[] | null {
  const inner = text
    .replace(/[−–]/g, '-')
    .trim()
    .replace(/^[[(]\s*/, '')
    .replace(/\s*[\])]$/, '');
  if (inner === '') return [];
  const parts = inner.split(/\s*[,;]\s*|\s+/);
  if (parts.some((part) => !/^-?\d+$/.test(part))) return null;
  return parts.map(Number);
}

export function checkFree(body: Pick<FreeBody, 'answers' | 'normalize' | 'typos'>, given: string): boolean {
  if (given.trim() === '') return false;
  switch (body.normalize) {
    case 'list': {
      const values = parseNumberList(given);
      return values !== null && body.answers.some((answer) => JSON.stringify(parseNumberList(answer)) === JSON.stringify(values));
    }
    case 'number': {
      const value = parseNumber(given);
      return value !== null && body.answers.some((answer) => parseNumber(answer) === value);
    }
    case 'complexity':
      return body.answers.some((answer) => complexityEquals(answer, given));
    case 'output':
      return body.answers.some((answer) => normalizeOutputText(answer) === normalizeOutputText(given));
    case 'text': {
      const text = normalizeText(given);
      return body.answers.some((answer) => {
        const expected = normalizeText(answer);
        if (expected === text) return true;
        return body.typos && expected.length >= 5 && editDistance(expected, text, 1) <= 1;
      });
    }
  }
}

/** Выбор ответа: выбраны ровно верные варианты. */
export function checkChoice(body: Pick<ChoiceBody, 'options'>, selected: readonly number[]): boolean {
  const chosen = new Set(selected);
  return body.options.every((option, index) => option.correct === chosen.has(index));
}

/** Ответ на задачу Парсонса или порядок шагов: номера строк items (лишние строки — номера ≥ items.length) и отступы. */
export interface OrderAnswer {
  lines: { item: number; indent: number }[];
}

export function checkOrder(body: Pick<OrderBody, 'items' | 'distractors' | 'indent' | 'alternatives'>, answer: OrderAnswer): boolean {
  // Сравниваются строки, а не их номера: одинаковые строки (например, «}») взаимозаменяемы.
  const textOf = (item: number): string | null => (item < body.items.length ? (body.items[item]?.text ?? null) : null);
  const given = answer.lines.map((line) => ({ text: textOf(line.item), indent: line.indent }));
  if (given.some((line) => line.text === null)) return false;
  const accepted = [body.items.map((_, index) => index), ...body.alternatives];
  return accepted.some(
    (variant) =>
      variant.length === given.length &&
      variant.every((item, index) => {
        const expected = body.items[item];
        const line = given[index];
        if (!expected || !line) return false;
        return expected.text === line.text && (!body.indent || expected.indent === line.indent);
      }),
  );
}

export function checkLine(body: Pick<LineBody, 'bugLine' | 'reasons'>, line: number | null, reason: number | null): boolean {
  return line === body.bugLine && reason !== null && body.reasons[reason]?.correct === true;
}
