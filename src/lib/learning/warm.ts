/**
 * Задания темы — в кеш Service Worker, чтобы повторение работало без сети
 * (ТЗ, критерий приёмки «Повторения … переживают работу без сети»). Запрос
 * идёт к своему сайту и только после ответа на задание темы: с этого момента
 * навыки темы попадают в повторение. Один раз на страницу.
 */
import { learnTopicUrl } from './topics.ts';

const warmed = new Set<string>();

export function warmTopic(base: string, topicId: string): void {
  if (warmed.has(topicId) || typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  warmed.add(topicId);
  void fetch(learnTopicUrl(base, topicId)).catch(() => warmed.delete(topicId));
}
