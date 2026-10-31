/**
 * Данные карты связей для модуля или раздела: вышедшие темы этой части
 * каталога, их предпосылки (в том числе из других модулей и разделов) и
 * связи «связано с». Темы, у которых ещё нет страницы, на карту не попадают,
 * если они не чья-то предпосылка: про их связи ещё ничего не известно.
 */
import { catalogTopics } from './catalog-data.ts';
import type { GraphEdge, GraphNode } from './graph.ts';
import { catalogTopicPath } from './paths.ts';
import type { SiteData, TopicPage } from './site-data.ts';
import { capitalize } from '../lib/format.ts';

export function mapGraph(site: SiteData, inScope: (page: TopicPage) => boolean): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const order = new Map([...catalogTopics.keys()].map((id, index) => [id, index]));
  const scoped = [...site.pages.values()].filter(inScope);
  const scopeIds = new Set(scoped.map((page) => page.topic.id));
  const nodes = new Map<string, GraphNode>();

  const nodeFor = (id: string, external: boolean): GraphNode => {
    const page = site.pages.get(id);
    const listed = catalogTopics.get(id);
    return {
      id,
      title: page?.topic.title ?? capitalize(listed?.title ?? id),
      href: page?.path ?? catalogTopicPath(id),
      external,
      module: listed?.module.number ?? '',
      written: page !== undefined,
      prerequisites: page?.topic.prerequisites.map((item) => ({ topic: item.topic, level: item.level })) ?? [],
      levels: page?.levels.map((level) => level.level) ?? [],
      order: order.get(id) ?? Number.MAX_SAFE_INTEGER,
    };
  };

  const edges: GraphEdge[] = [];
  for (const page of scoped) {
    nodes.set(page.topic.id, nodeFor(page.topic.id, false));
    for (const item of page.topic.prerequisites) {
      if (!nodes.has(item.topic)) nodes.set(item.topic, nodeFor(item.topic, !scopeIds.has(item.topic)));
      edges.push({ from: item.topic, to: page.topic.id, kind: 'prerequisite' });
    }
  }
  // Предпосылка из этой же части каталога могла попасть на карту раньше своей страницы — поправим признак.
  for (const id of scopeIds) nodes.set(id, nodeFor(id, false));
  for (const page of scoped) {
    for (const other of page.topic.related) {
      if (nodes.has(other) && !edges.some((edge) => (edge.from === other && edge.to === page.topic.id) || (edge.from === page.topic.id && edge.to === other))) {
        edges.push({ from: page.topic.id, to: other, kind: 'related' });
      }
    }
  }
  return { nodes: [...nodes.values()], edges };
}
