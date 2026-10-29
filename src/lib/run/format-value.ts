/**
 * Как песочница печатает значения в консоль (src/sandbox/worker-prefix.js).
 * По тем же правилам при сборке вычисляется ответ заданий «Что выведет код»:
 * человек, запустив код в песочнице, увидит ровно этот вывод. Совпадение двух
 * реализаций проверяет тест tests/unit/format-value.test.ts.
 */
export function formatValue(value: unknown, depth = 0): string {
  if (typeof value === 'string') return depth === 0 ? value : JSON.stringify(value);
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return `функция ${value.name || ''}`.trim();
  if (typeof value !== 'object') return String(value);
  if (depth > 4) return '…';
  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => formatValue(item, depth + 1));
    if (value.length > 100) items.push(`… ещё ${value.length - 100}`);
    return `[${items.join(', ')}]`;
  }
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  const entries = Object.entries(value)
    .slice(0, 50)
    .map(([key, item]) => `${key}: ${formatValue(item, depth + 1)}`);
  return `{ ${entries.join(', ')} }`;
}

/** Строка консоли из аргументов console.log, как в песочнице. */
export function formatLogLine(args: readonly unknown[]): string {
  return args
    .map((item) => formatValue(item))
    .join(' ')
    .slice(0, 1000);
}
