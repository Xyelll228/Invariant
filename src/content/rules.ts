/**
 * Правила шаблона темы (ТЗ, «Из чего состоит тема» и чек-лист «Тема готова»).
 */
import type { BlockKind, Level, Topic } from './schema.ts';

/** Обязательные блоки текста на уровне — по виду темы. */
export function requiredBlocks(topic: Pick<Topic, 'kind' | 'confusableWith'>, level: Level): BlockKind[] {
  const algorithm = topic.kind === 'algorithm';
  const visual = topic.kind === 'algorithm' || topic.kind === 'structure';
  const kinds: BlockKind[] = ['explanation', 'misconceptions'];
  if (level !== 'depth') kinds.push('worked-example');
  if (visual && level !== 'depth') kinds.push('visualization');
  if (algorithm && level !== 'fundament') kinds.push('code', 'measurement', 'proof');
  if (algorithm && level === 'base') kinds.push('complexity');
  if (topic.confusableWith.length > 0) kinds.push('confusion-pairs');
  return kinds;
}

/** Блоки, которые тема пропускает с указанной причиной. */
export function skippedBlocks(topic: Pick<Topic, 'skipped'>, level: Level): Set<BlockKind> {
  return new Set(topic.skipped.filter((item) => item.levels.includes(level)).map((item) => item.block));
}

/** Минимум заданий на уровне для публикации: 10 вопросов или шаблонов, 4 типа, есть свободный ввод. */
export const READY_MIN_QUESTIONS = 10;
export const READY_MIN_TYPES = 4;
export const READY_MIN_PRE_QUESTIONS = 2;
export const READY_MIN_MUTANTS = 3;

/** Находит цикл в графе «тема → её предпосылки»; возвращает путь цикла или null. */
export function findCycle(edges: ReadonlyMap<string, readonly string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    const current = state.get(node);
    if (current === 'done') return null;
    if (current === 'visiting') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (!edges.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };

  for (const node of [...edges.keys()].sort()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

/** Идентификаторы внутри темы: блок b, вопрос q, навык s, заблуждение m. */
export function childIdPrefix(topicId: string, kind: 'b' | 'q' | 's' | 'm'): string {
  return `${topicId}.${kind}.`;
}
