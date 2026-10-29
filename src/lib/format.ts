import type { ComplexityClass } from '../content/schema.ts';

const SUPERSCRIPT: Record<string, string> = { '2': '²', '3': '³' };

/** 'n^2' → «O(n²)», 'n log n' → «O(n log n)», '1' → «O(1)». */
export function formatComplexity(value: ComplexityClass): string {
  const body = value.replace(/\^(\d)/g, (_, digit: string) => SUPERSCRIPT[digit] ?? `^${digit}`);
  return `O(${body})`;
}

/** '2026-10-24' → «24 октября 2026 г.» */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/** С большой буквы: в каталоге темы модуля перечислены через точку посередине и начинаются со строчной. */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

/** 1 минута, 2 минуты, 5 минут. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
