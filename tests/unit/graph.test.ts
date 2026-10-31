import { describe, expect, it } from 'vitest';
import { assignLayers, layoutGraph, NODE_WIDTH, wrapTitle, type GraphEdge, type GraphNode } from '../../src/content/graph.ts';
import { mapState } from '../../src/lib/learning/map-state.ts';
import type { ProgressRecord } from '../../src/lib/learning/types.ts';

function node(id: string, order: number, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, title: `Тема ${id}`, href: `ru/${id}/`, external: false, module: '1.5', written: true, prerequisites: [], levels: ['fundament'], order, ...extra };
}

const prerequisite = (from: string, to: string): GraphEdge => ({ from, to, kind: 'prerequisite' });

describe('карта связей: раскладка', () => {
  it('название переносится по словам под ширину блока', () => {
    expect(wrapTitle('Сортировка вставками')).toEqual(['Сортировка вставками']);
    const lines = wrapTitle('Массив и доступ по индексу за O(1) и ещё несколько длинных слов');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(21);
  });

  it('слой — самый длинный путь от тем без предпосылок; «связано с» на слои не влияет', () => {
    const nodes = [node('a', 0), node('b', 1), node('c', 2), node('d', 3)];
    const edges = [prerequisite('a', 'b'), prerequisite('b', 'c'), prerequisite('a', 'c'), { from: 'c', to: 'd', kind: 'related' as const }];
    expect(Object.fromEntries(assignLayers(nodes, edges))).toEqual({ a: 0, b: 1, c: 2, d: 0 });
  });

  it('стрелки идут слева направо, блоки одного слоя не накладываются', () => {
    const nodes = [node('a', 0), node('b', 1), node('c', 2), node('x', 3, { external: true, module: '1.2', title: 'Массив и доступ по индексу за O(1)' })];
    const edges = [prerequisite('a', 'c'), prerequisite('b', 'c'), prerequisite('x', 'c')];
    const layout = layoutGraph(nodes, edges);
    const byId = new Map(layout.nodes.map((item) => [item.id, item]));
    for (const edge of edges) expect(byId.get(edge.from)!.x + NODE_WIDTH).toBeLessThan(byId.get(edge.to)!.x);
    const first = layout.layers[0]!;
    for (let index = 1; index < first.length; index++) {
      expect(first[index]!.y).toBeGreaterThanOrEqual(first[index - 1]!.y + first[index - 1]!.height);
    }
    expect(byId.get('x')!.lines[0]).toMatch(/^1\.2 · /);
    for (const item of layout.nodes) {
      expect(item.x + item.width).toBeLessThanOrEqual(layout.width);
      expect(item.y + item.height).toBeLessThanOrEqual(layout.height);
    }
    expect(layout.edges.every((edge) => edge.path.startsWith('M '))).toBe(true);
  });
});

describe('карта связей: состояние темы', () => {
  const record = (topicId: string, level: ProgressRecord['level'], status: ProgressRecord['status'], extra: Partial<ProgressRecord> = {}): ProgressRecord => ({
    topicId,
    level,
    status,
    completedSteps: [],
    paused: false,
    updatedAt: 0,
    ...extra,
  });
  const input = { topicId: 'sort', levels: ['fundament', 'base'] as const, prerequisites: [{ topic: 'array', level: 'base' as const }] };

  it('освоено — все уровни; изучается — начат хоть один', () => {
    expect(mapState({ ...input, levels: [...input.levels], records: [record('sort', 'fundament', 'mastered'), record('sort', 'base', 'mastered')] })).toBe('mastered');
    expect(mapState({ ...input, levels: [...input.levels], records: [record('sort', 'fundament', 'mastered')] })).toBe('in-progress');
    expect(mapState({ ...input, levels: [...input.levels], records: [record('sort', 'fundament', 'not-started', { lastQuestion: 'q' })] })).toBe('in-progress');
  });

  it('можно начинать — предпосылки освоены на нужном уровне или выше', () => {
    expect(mapState({ ...input, levels: [...input.levels], records: [record('array', 'fundament', 'mastered')] })).toBeNull();
    expect(mapState({ ...input, levels: [...input.levels], records: [record('array', 'base', 'mastered')] })).toBe('ready');
    expect(mapState({ ...input, levels: [...input.levels], records: [record('array', 'depth', 'mastered')] })).toBe('ready');
    // Тема без предпосылок или ещё не вышедшая — без пометки.
    expect(mapState({ ...input, levels: [...input.levels], prerequisites: [], records: [] })).toBeNull();
    expect(mapState({ ...input, levels: [], records: [record('array', 'base', 'mastered')] })).toBeNull();
  });
});
