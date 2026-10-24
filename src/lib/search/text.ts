/**
 * Подготовка текста для поиска: регистр, «ё», слова, основы слов.
 * Одни и те же правила работают при сборке индекса и при запросе.
 */
import { stemRussian } from './stem-ru.ts';

/**
 * Служебные слова, которые есть почти в каждом названии и только мешают
 * ранжированию: «и», «в», «для», «как»…
 */
const STOP_WORDS = new Set([
  'а', 'без', 'в', 'во', 'для', 'до', 'же', 'за', 'и', 'из', 'или', 'к', 'как', 'ко', 'ли', 'на', 'над', 'не', 'но', 'о', 'об', 'от',
  'по', 'под', 'при', 'про', 'с', 'со', 'то', 'у', 'что', 'чем', 'это',
  'a', 'an', 'and', 'in', 'of', 'on', 'or', 'the', 'to',
]);

/** Нижний регистр, «ё» → «е», «C++» → «cpp»: иначе плюсы потерялись бы. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/([cс])\+\+/g, 'cpp');
}

/** Слова: буквы, цифры и подчёркивание (unique_ptr); всё остальное — разделители. */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((token) => token !== '');
}

export function isStopWord(token: string): boolean {
  return STOP_WORDS.has(token);
}

/** Основа слова: русские слова через стеммер, остальные — как есть. */
export function stemToken(token: string): string {
  return /^[а-я]+$/.test(token) ? stemRussian(token) : token;
}

/** Основы значимых слов текста по порядку. */
export function searchTerms(text: string): string[] {
  return tokenize(text)
    .filter((token) => !isStopWord(token))
    .map(stemToken);
}
