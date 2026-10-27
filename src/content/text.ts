/**
 * Разбор текстов темы и правила написания (ТЗ, «Правила написания»).
 * MDX разбирается тем же процессором Sätteri, что и при сборке Astro.
 */
import { mdxToMdast } from 'satteri';

export interface MdxBlock {
  id: string;
  kind: string;
  version: number | null;
  title: string;
  line: number;
}

export interface ProseFragment {
  text: string;
  line: number;
}

export interface ParsedMdx {
  frontmatter: string | null;
  blocks: MdxBlock[];
  /** Абзацы, заголовки и пункты списков без кода, формул и разметки. */
  prose: ProseFragment[];
  /** Имена компонентов, которые встречаются в тексте. */
  components: string[];
}

interface Node {
  type: string;
  value?: unknown;
  name?: string | null;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: Node[];
  position?: { start?: { line?: number } };
}

const PROSE_CONTAINERS = new Set(['paragraph', 'heading', 'tableCell']);
const SKIPPED = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'mdxFlowExpression', 'mdxTextExpression', 'mdxjsEsm', 'html']);

function attribute(node: Node, name: string): string | null {
  const found = node.attributes?.find((item) => item.type === 'mdxJsxAttribute' && item.name === name);
  if (!found) return null;
  if (typeof found.value === 'string') return found.value;
  if (found.value && typeof found.value === 'object' && 'value' in found.value) {
    const value = (found.value as { value: unknown }).value;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function inlineText(node: Node): string {
  if (SKIPPED.has(node.type)) return node.type === 'inlineCode' || node.type === 'inlineMath' ? 'X' : '';
  if (node.type === 'text') return String(node.value ?? '');
  if (node.type === 'break') return ' ';
  return (node.children ?? []).map(inlineText).join('');
}

/** Разбирает MDX; бросает ошибку с номером строки, если MDX не собрать. */
export function parseMdx(source: string): ParsedMdx {
  const tree = mdxToMdast(source) as Node;
  const result: ParsedMdx = { frontmatter: null, blocks: [], prose: [], components: [] };

  const visit = (node: Node): void => {
    if (node.type === 'yaml') {
      result.frontmatter = String(node.value ?? '');
      return;
    }
    if (SKIPPED.has(node.type)) return;
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      if (node.name) result.components.push(node.name);
      if (node.name === 'Block') {
        const version = attribute(node, 'version');
        result.blocks.push({
          id: attribute(node, 'id') ?? '',
          kind: attribute(node, 'kind') ?? '',
          version: version !== null && /^\d+$/.test(version.trim()) ? Number(version) : null,
          title: attribute(node, 'title') ?? '',
          line: node.position?.start?.line ?? 0,
        });
      }
    }
    if (PROSE_CONTAINERS.has(node.type)) {
      const text = inlineText(node).replace(/\s+/g, ' ').trim();
      if (text) result.prose.push({ text, line: node.position?.start?.line ?? 0 });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return result;
}

// ---------- правила написания ----------

export const MAX_SENTENCE_WORDS = 30;

export interface TextProblem {
  message: string;
  line: number;
}

const WORD = /[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** Делит абзац на предложения по знакам конца предложения и заглавной букве после них. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\$[^$]*\$/g, 'X')
    .split(/(?<=[.!?…])\s+(?=[«"(]?[\p{Lu}\p{N}])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const FORBIDDEN_PHRASES: { pattern: RegExp; message: string }[] = [
  {
    pattern: /(?<!\p{L})очевидн\p{L}*/iu,
    message: '«очевидно» запрещено: если это очевидно, объясните одной фразой',
  },
  {
    pattern: /(?<!\p{L})легко\s+(?:видеть|заметить|показать|понять|доказать|проверить)(?!\p{L})/iu,
    message: '«легко видеть» и подобное запрещено: объясните, почему это так',
  },
  {
    pattern: /(?<!\p{L})тривиальн\p{L}*/iu,
    message: '«тривиально» запрещено: объясните одной фразой',
  },
  {
    pattern: /\p{Script=Cyrillic}!/u,
    message: 'восклицательный знак: тон текста нейтральный',
  },
];

/**
 * Шаблон для запрещённого варианта термина с учётом окончаний: у слов длиннее
 * четырёх букв последние две буквы могут меняться («стабильная сортировка» →
 * «стабильной сортировки»).
 */
export function variantPattern(variant: string): RegExp {
  const words = variant.trim().split(/\s+/).map((word) => {
    const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return word.length > 4 ? `${escaped(word.slice(0, -2))}\\p{L}{0,4}` : escaped(word);
  });
  return new RegExp(`(?<!\\p{L})${words.join('\\s+')}(?!\\p{L})`, 'iu');
}

export function checkProse(
  fragments: readonly ProseFragment[],
  forbiddenVariants: readonly { variant: string; term: string }[] = [],
): TextProblem[] {
  const problems: TextProblem[] = [];
  const variants = forbiddenVariants.map((item) => ({ ...item, pattern: variantPattern(item.variant) }));
  for (const fragment of fragments) {
    for (const sentence of splitSentences(fragment.text)) {
      const words = countWords(sentence);
      if (words > MAX_SENTENCE_WORDS) {
        problems.push({
          message: `предложение длиннее ${MAX_SENTENCE_WORDS} слов (${words}): «${sentence.slice(0, 70)}…»`,
          line: fragment.line,
        });
      }
    }
    for (const rule of FORBIDDEN_PHRASES) {
      const match = rule.pattern.exec(fragment.text);
      if (match) problems.push({ message: `${rule.message}: «${match[0]}»`, line: fragment.line });
    }
    for (const item of variants) {
      const match = item.pattern.exec(fragment.text);
      if (match) {
        problems.push({ message: `запрещённый вариант «${match[0]}», в глоссарии — «${item.term}»`, line: fragment.line });
      }
    }
  }
  return problems;
}
