/**
 * Карта связей (ТЗ, «Предпосылки и карта связей»): граф тем модуля или
 * раздела. Стрелка ведёт от предпосылки к теме, которой она нужна; пунктир —
 * связь «связано с». Раскладка по слоям считается при сборке: слой темы —
 * длина самого длинного пути до неё от тем без предпосылок, поэтому каждая
 * стрелка идёт слева направо. Порядок внутри слоя — по среднему положению
 * соседей (так меньше пересечений), при равенстве — по каталогу.
 */

export interface GraphNode {
  id: string;
  title: string;
  /** Адрес без base: страница темы, а у невышедшей — её место в каталоге. */
  href: string;
  /** Тема из другого модуля или раздела — показывается с его номером. */
  external: boolean;
  /** Подпись модуля для внешней темы: «1.2». */
  module: string;
  /** Есть ли у темы страница в этой сборке. */
  written: boolean;
  /** Предпосылки с уровнем: по ним в браузере видно, можно ли начинать тему. */
  prerequisites: { topic: string; level: string }[];
  /** Уровни темы, у которых есть страницы: тема освоена, когда освоены все. */
  levels: string[];
  /** Порядок в каталоге — для устойчивой раскладки. */
  order: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'prerequisite' | 'related';
}

export interface PlacedNode extends GraphNode {
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

export interface PlacedEdge extends GraphEdge {
  path: string;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
  /** Темы по слоям — для текстовой версии карты. */
  layers: PlacedNode[][];
}

export const NODE_WIDTH = 184;
const PADDING_X = 12;
const PADDING_Y = 10;
const LINE_HEIGHT = 18;
const LAYER_GAP = 64;
const NODE_GAP = 18;
const MARGIN = 8;
/** Средняя ширина буквы при размере 14 px — с запасом для кириллицы. */
const CHAR_WIDTH = 7.8;

/** Перенос названия по словам под ширину блока; самое длинное слово занимает строку целиком. */
export function wrapTitle(text: string, width = NODE_WIDTH - 2 * PADDING_X): string[] {
  const limit = Math.max(4, Math.floor(width / CHAR_WIDTH));
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit || current === '') current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Слои: длина самого длинного пути от тем без входящих стрелок. Связи «связано с» на слои не влияют. */
export function assignLayers(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== 'prerequisite' || !ids.has(edge.from) || !ids.has(edge.to)) continue;
    const list = incoming.get(edge.to);
    if (list) list.push(edge.from);
    else incoming.set(edge.to, [edge.from]);
  }
  const layers = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (id: string): number => {
    const known = layers.get(id);
    if (known !== undefined) return known;
    // Граф предпосылок без циклов (это проверяет check:content); защита на случай ошибки.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const value = Math.max(-1, ...(incoming.get(id) ?? []).map(layerOf)) + 1;
    visiting.delete(id);
    layers.set(id, value);
    return value;
  };
  for (const node of nodes) layerOf(node.id);
  return layers;
}

export function layoutGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphLayout {
  const layerOf = assignLayers(nodes, edges);
  const count = Math.max(0, ...layerOf.values()) + 1;
  const layers: GraphNode[][] = Array.from({ length: count }, () => []);
  for (const node of [...nodes].sort((a, b) => a.order - b.order)) layers[layerOf.get(node.id) ?? 0]?.push(node);

  // Порядок внутри слоя: по среднему месту соседей в предыдущем слое (два прохода).
  const position = new Map<string, number>();
  const remember = () => layers.forEach((layer) => layer.forEach((node, index) => position.set(node.id, index)));
  remember();
  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== 'prerequisite') continue;
    neighbours.set(edge.to, [...(neighbours.get(edge.to) ?? []), edge.from]);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let index = 1; index < layers.length; index++) {
      const layer = layers[index] as GraphNode[];
      const weight = (node: GraphNode): number => {
        const around = (neighbours.get(node.id) ?? []).map((id) => position.get(id)).filter((value): value is number => value !== undefined);
        return around.length === 0 ? Number.POSITIVE_INFINITY : around.reduce((sum, value) => sum + value, 0) / around.length;
      };
      layer.sort((a, b) => weight(a) - weight(b) || a.order - b.order);
      remember();
    }
  }

  const placed = new Map<string, PlacedNode>();
  let height = 0;
  layers.forEach((layer, layerIndex) => {
    let y = MARGIN;
    for (const node of layer) {
      const lines = wrapTitle(node.external ? `${node.module} · ${node.title}` : node.title);
      // Ещё одна строка — под состояние темы («освоено», «изучается»), его дописывает браузер.
      const nodeHeight = 2 * PADDING_Y + (lines.length + 1) * LINE_HEIGHT;
      placed.set(node.id, {
        ...node,
        layer: layerIndex,
        x: MARGIN + layerIndex * (NODE_WIDTH + LAYER_GAP),
        y,
        width: NODE_WIDTH,
        height: nodeHeight,
        lines,
      });
      y += nodeHeight + NODE_GAP;
    }
    height = Math.max(height, y - NODE_GAP + MARGIN);
  });

  const placedEdges: PlacedEdge[] = [];
  for (const edge of edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) continue;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max(24, (x2 - x1) / 2);
    // Связь «связано с» внутри одного слоя — дугой справа.
    const path =
      x2 > x1
        ? `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1 + LAYER_GAP / 2} ${y1}, ${x1 + LAYER_GAP / 2} ${to.y + to.height / 2}, ${to.x + to.width} ${to.y + to.height / 2}`;
    placedEdges.push({ ...edge, path });
  }

  return {
    nodes: [...placed.values()],
    edges: placedEdges,
    width: MARGIN * 2 + count * NODE_WIDTH + Math.max(0, count - 1) * LAYER_GAP,
    height: Math.max(height, 2 * MARGIN),
    layers: layers.map((layer) => layer.map((node) => placed.get(node.id) as PlacedNode)),
  };
}
