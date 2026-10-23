import { ru, type MessageKey } from './ru.ts';

export type Locale = 'ru';

const dictionaries: Record<Locale, Record<MessageKey, string>> = { ru };

/**
 * Возвращает строку интерфейса и подставляет параметры вида {name}.
 * Неизвестный параметр оставляется как есть, чтобы ошибку было видно.
 */
export function t(
  key: MessageKey,
  params: Record<string, string | number> = {},
  locale: Locale = 'ru',
): string {
  const template = dictionaries[locale][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
