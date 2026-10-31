/**
 * Журнал ошибок (ТЗ, «Разбор ошибок и повторение»): ошибки с темой,
 * заблуждением и заметкой, фильтры, «мои частые заблуждения» и предложение
 * вернуться к предпосылке, если к ней ведут несколько ошибок. Чистые функции:
 * их проверяют модульные тесты, экран только показывает результат.
 */
import type { MisconceptionSummary, TopicLink, TopicsIndex } from './topics.ts';
import { topicOfSkill } from './topics.ts';
import type { ErrorRecord, UserCardRecord } from './types.ts';

export interface ErrorView {
  id: string;
  at: number;
  note: string;
  resolved: boolean;
  topicId: string;
  topicTitle: string;
  /** Адрес темы без base; null — темы нет в этой сборке. */
  topicPath: string | null;
  skillTitle: string | null;
  misconceptionId: string | null;
  misconception: MisconceptionSummary | null;
}

/** Ошибки с названиями тем, навыков и заблуждений — новые сверху. Ошибка в своей карточке подписана её вопросом. */
export function describeErrors(errors: readonly ErrorRecord[], index: TopicsIndex, userCards: readonly UserCardRecord[] = []): ErrorView[] {
  const topics = new Map(index.topics.map((topic) => [topic.id, topic]));
  const own = new Map(userCards.map((card) => [card.id, card]));
  return errors
    .map((error) => {
      const userCard = own.get(error.cardId);
      const topicId = userCard?.topicId ?? topicOfSkill(error.cardId);
      const topic = topics.get(topicId);
      return {
        id: error.id,
        at: error.at,
        note: error.note,
        resolved: error.resolved,
        topicId,
        topicTitle: topic?.title ?? topicId,
        topicPath: topic?.path ?? null,
        skillTitle: userCard ? `Своя карточка: ${userCard.question}` : (topic?.skills.find((skill) => skill.id === error.cardId)?.title ?? null),
        misconceptionId: error.misconception,
        misconception: error.misconception ? (topic?.misconceptions[error.misconception] ?? null) : null,
      };
    })
    .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
}

export interface FrequentMisconception {
  id: string;
  text: string;
  count: number;
  topicTitle: string;
  blockPath: string | null;
  /** Сколько из этих ошибок ещё не разобраны. */
  open: number;
  latest: number;
}

/** «Мои частые заблуждения»: по числу ошибок, при равенстве — самые свежие. */
export function frequentMisconceptions(views: readonly ErrorView[]): FrequentMisconception[] {
  const byId = new Map<string, FrequentMisconception>();
  for (const view of views) {
    if (!view.misconceptionId || !view.misconception) continue;
    const entry = byId.get(view.misconceptionId) ?? {
      id: view.misconceptionId,
      text: view.misconception.text,
      count: 0,
      topicTitle: view.topicTitle,
      blockPath: view.misconception.blockPath,
      open: 0,
      latest: 0,
    };
    entry.count++;
    if (!view.resolved) entry.open++;
    entry.latest = Math.max(entry.latest, view.at);
    byId.set(view.misconceptionId, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || b.latest - a.latest);
}

/** Со скольких неразобранных ошибок, ведущих к одной предпосылке, предлагать вернуться к ней. */
export const PREREQUISITE_SUGGESTION_MIN = 2;

/**
 * Предпосылки, к которым ведут повторяющиеся неразобранные ошибки
 * (ТЗ: «если ошибки повторяются и ведут к одной предпосылке — предложение вернуться к ней»).
 */
export function prerequisiteSuggestions(views: readonly ErrorView[]): (TopicLink & { count: number })[] {
  const byTopic = new Map<string, TopicLink & { count: number }>();
  for (const view of views) {
    const prerequisite = view.misconception?.prerequisite;
    if (!prerequisite || view.resolved) continue;
    const entry = byTopic.get(prerequisite.id) ?? { ...prerequisite, count: 0 };
    entry.count++;
    byTopic.set(prerequisite.id, entry);
  }
  return [...byTopic.values()].filter((entry) => entry.count >= PREREQUISITE_SUGGESTION_MIN).sort((a, b) => b.count - a.count);
}

export interface ErrorFilter {
  topicId: string | null;
  misconceptionId: string | null;
  hideResolved: boolean;
}

export function filterErrors(views: readonly ErrorView[], filter: ErrorFilter): ErrorView[] {
  return views.filter(
    (view) =>
      (filter.topicId === null || view.topicId === filter.topicId) &&
      (filter.misconceptionId === null || view.misconceptionId === filter.misconceptionId) &&
      (!filter.hideResolved || !view.resolved),
  );
}
