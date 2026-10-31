/**
 * Состояние темы на карте связей: «освоено» (освоены все уровни), «изучается»
 * (начат хоть один уровень) или «можно начинать» (тема не начата, а все её
 * предпосылки освоены на нужном уровне). Так по карте видно, что учить дальше.
 */
import type { Level, ProgressRecord } from './types.ts';

export type MapState = 'mastered' | 'in-progress' | 'ready' | null;

export const MAP_STATE_TEXT: Record<Exclude<MapState, null>, string> = {
  mastered: 'освоено',
  'in-progress': 'изучается',
  ready: 'можно начинать',
};

const LEVEL_RANK: Record<Level, number> = { fundament: 0, base: 1, depth: 2 };

function started(record: ProgressRecord): boolean {
  return record.status !== 'not-started' || record.lastQuestion !== undefined;
}

export function mapState(input: {
  topicId: string;
  levels: readonly Level[];
  prerequisites: readonly { topic: string; level: Level }[];
  records: readonly ProgressRecord[];
}): MapState {
  const own = input.records.filter((record) => record.topicId === input.topicId);
  if (input.levels.length > 0 && input.levels.every((level) => own.some((record) => record.level === level && record.status === 'mastered'))) {
    return 'mastered';
  }
  if (own.some(started)) return 'in-progress';
  if (input.levels.length === 0 || input.prerequisites.length === 0) return null;
  const satisfied = input.prerequisites.every((item) =>
    input.records.some((record) => record.topicId === item.topic && record.status === 'mastered' && LEVEL_RANK[record.level] >= LEVEL_RANK[item.level]),
  );
  return satisfied ? 'ready' : null;
}
