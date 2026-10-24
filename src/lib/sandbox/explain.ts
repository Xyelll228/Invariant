/**
 * Понятные объяснения частых ошибок по-русски (ТЗ, «Лаборатория кода»).
 * Сообщения браузеров различаются, поэтому разбираем и формат Chrome,
 * и Firefox, и Safari.
 */
import type { SandboxError } from './client.ts';

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function explainError(error: SandboxError): string {
  const { name, message } = error;
  const where = error.line ? ` Строка ${error.line}.` : '';

  if (name === 'ReferenceError' || /is not defined|Can't find variable/.test(message)) {
    const identifier = firstMatch(message, [/^(\S+) is not defined/, /Can't find variable: (\S+)/, /'(\S+)' is not defined/]);
    return `Имя ${identifier ? `«${identifier}» ` : ''}не объявлено: проверьте кавычки и опечатки. Переменную объявляют через let или const.${where}`;
  }
  if (/is not a function|is not a constructor/.test(message)) {
    return `Это значение нельзя вызвать как функцию: проверьте имя и скобки при вызове.${where}`;
  }
  if (/undefined|null/.test(message) && name === 'TypeError') {
    return `Значение — undefined или null, у него нет свойств. Проверьте, что переменная получила значение и что индекс не вышел за границы массива.${where}`;
  }
  if (/Maximum call stack|too much recursion/i.test(message) || name === 'InternalError') {
    return `Слишком глубокая рекурсия: проверьте базовый случай — функция должна когда-то перестать вызывать себя.${where}`;
  }
  if (name === 'SyntaxError' || /SyntaxError|Unexpected|expected/i.test(message)) {
    return `Синтаксическая ошибка: проверьте скобки, запятые и кавычки.${where}`;
  }
  if (/недоступен в песочнице/.test(message)) {
    return `В песочнице нет сети: код может работать только с данными, которые получил.${where}`;
  }
  if (name === 'RangeError') {
    return `Значение вне допустимых пределов: например, массив отрицательной длины.${where}`;
  }
  return `${name}: ${message}.${where}`;
}

export function explainTimeout(timeoutMs: number): string {
  const seconds = (timeoutMs / 1000).toLocaleString('ru-RU');
  return `Тест не уложился в ${seconds} с. Возможно, цикл никогда не заканчивается: проверьте, что его условие когда-нибудь становится ложным.`;
}
