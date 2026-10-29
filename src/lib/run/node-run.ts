/**
 * Запуск кода заданий при сборке (только Node): «Что выведет код» и
 * ожидаемые ответы тестов по эталонному решению. Так ответы вычисляются, а не
 * пишутся руками (ТЗ, «Тренажёры»), и в тексте нет кода, который не запускался.
 *
 * Код — наш учебный контент, а не код ученика: он выполняется в отдельном
 * контексте node:vm с лимитом времени, без доступа к модулям Node.
 */
import { createContext, runInContext } from 'node:vm';
import { formatLogLine } from './format-value.ts';

const TIMEOUT_MS = 2000;

export class RunError extends Error {}

function sandboxContext(lines: string[]) {
  const log = (...args: unknown[]) => lines.push(formatLogLine(args));
  return createContext({ console: { log, info: log, warn: log, error: log, debug: log } });
}

/** Что выведет код: строки консоли через перевод строки. */
export function runOutput(code: string): string {
  const lines: string[] = [];
  try {
    runInContext(code, sandboxContext(lines), { timeout: TIMEOUT_MS, filename: 'задание.js' });
  } catch (error) {
    throw new RunError(`код задания упал: ${(error as Error).message}`);
  }
  return lines.join('\n');
}

/**
 * Вызывает функцию из кода решения на копиях аргументов и возвращает
 * результат как JSON-значение — так же, как его сравнивает песочница: если
 * функция ничего не вернула, результатом считается первый аргумент (массив,
 * изменённый на месте).
 */
export function runFunction(solution: string, name: string, args: readonly unknown[]): unknown {
  const lines: string[] = [];
  const context = sandboxContext(lines);
  context.__args = JSON.parse(JSON.stringify(args));
  try {
    const result = runInContext(
      `${solution}\n;{ const __result = ${name}(...__args); JSON.stringify(__result === undefined ? __args[0] : __result); }`,
      context,
      { timeout: TIMEOUT_MS, filename: 'решение.js' },
    );
    return result === undefined ? undefined : JSON.parse(result as string);
  } catch (error) {
    throw new RunError(`эталонное решение упало на ${JSON.stringify(args)}: ${(error as Error).message}`);
  }
}
