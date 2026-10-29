/**
 * Сведения о темах для экранов вне страницы темы: повторения, журнала ошибок
 * и настроек. Список тем с навыками и заблуждениями — один небольшой файл
 * ru/learn/index.json; задания темы целиком — ru/learn/<id темы>.json, он
 * загружается, только когда пора повторить её навык. Оба файла собираются
 * при сборке, а без сети берутся из кеша Service Worker.
 */
import type { Level, PreparedTopic } from './question-types.ts';

export interface TopicLink {
  id: string;
  title: string;
  /** Адрес без base: страница темы или, если тема ещё не вышла, её место в каталоге. */
  path: string;
}

export interface MisconceptionSummary {
  text: string;
  /** Адрес блока, где это объясняется, без base. */
  blockPath: string | null;
  /** Тема-предпосылка, к которой ведёт это заблуждение. */
  prerequisite: TopicLink | null;
}

export interface TopicSummary {
  id: string;
  title: string;
  /** Адрес темы без base. */
  path: string;
  levels: { level: Level; title: string; path: string }[];
  skills: { id: string; title: string; level: Level }[];
  misconceptions: Record<string, MisconceptionSummary>;
  /** Похожие темы: в повторении их навыки ставятся рядом. */
  confusableWith: string[];
}

export interface TopicsIndex {
  topics: TopicSummary[];
}

export function learnIndexUrl(base: string): string {
  return `${base}ru/learn/index.json`;
}

export function learnTopicUrl(base: string, topicId: string): string {
  return `${base}ru/learn/${topicId}.json`;
}

const loaded = new Map<string, Promise<unknown>>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`не удалось загрузить ${url}: ${response.status}`);
  return response.json();
}

function once<T>(url: string): Promise<T> {
  let promise = loaded.get(url);
  if (!promise) {
    promise = fetchJson(url).catch((error: unknown) => {
      // Неудачную загрузку не запоминаем: без сети можно попробовать ещё раз позже.
      loaded.delete(url);
      throw error;
    });
    loaded.set(url, promise);
  }
  return promise as Promise<T>;
}

export function loadTopicsIndex(base: string): Promise<TopicsIndex> {
  return once<TopicsIndex>(learnIndexUrl(base));
}

export function loadTopic(base: string, topicId: string): Promise<PreparedTopic> {
  return once<PreparedTopic>(learnTopicUrl(base, topicId));
}

/** Тема навыка: id навыка — id темы, «.s.» и имя навыка. */
export function topicOfSkill(skillId: string): string {
  const index = skillId.indexOf('.s.');
  return index === -1 ? skillId : skillId.slice(0, index);
}
