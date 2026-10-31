/**
 * Тренажёр терминов (ТЗ, экран «Глоссарий»: «термины, поиск, тренажёр
 * терминов»). Вопросы строятся из глоссария: по определению выбрать термин,
 * по термину — определение, по английскому названию написать русское.
 * Неверные варианты — сначала термины, которые с этим «часто путают».
 */
import type { Random } from '../random.ts';

export interface TrainerTerm {
  id: string;
  term: string;
  en: string;
  definition: string;
  synonyms: string[];
  confusedWith: string[];
}

export type TermQuestion =
  | { kind: 'term-by-definition'; termId: string; prompt: string; options: { termId: string; text: string }[] }
  | { kind: 'definition-by-term'; termId: string; prompt: string; options: { termId: string; text: string }[] }
  | { kind: 'russian-by-english'; termId: string; prompt: string; answers: string[] };

/** Неверные варианты: сначала «часто путают с», затем остальные термины в случайном порядке. */
export function distractors(terms: readonly TrainerTerm[], target: TrainerTerm, count: number, random: Random): TrainerTerm[] {
  const others = terms.filter((term) => term.id !== target.id);
  const confused = others.filter((term) => target.confusedWith.includes(term.id) || term.confusedWith.includes(target.id));
  const rest = random.shuffle(others.filter((term) => !confused.includes(term)));
  return [...random.shuffle(confused), ...rest].slice(0, count);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

/** Один вопрос тренажёра. Для выбора нужно хотя бы два термина в глоссарии. */
export function termQuestion(terms: readonly TrainerTerm[], random: Random): TermQuestion | null {
  if (terms.length === 0) return null;
  const target = terms[random.int(0, terms.length - 1)] as TrainerTerm;
  const kinds: TermQuestion['kind'][] = terms.length >= 2 ? ['term-by-definition', 'definition-by-term', 'russian-by-english'] : ['russian-by-english'];
  const kind = kinds[random.int(0, kinds.length - 1)] as TermQuestion['kind'];
  if (kind === 'russian-by-english') {
    return { kind, termId: target.id, prompt: `Как по-русски называется «${target.en}»?`, answers: [target.term, ...target.synonyms] };
  }
  const options = random.shuffle([target, ...distractors(terms, target, 3, random)]);
  if (kind === 'term-by-definition') {
    return { kind, termId: target.id, prompt: `Какой термин подходит к определению: «${target.definition}»`, options: options.map((term) => ({ termId: term.id, text: capitalize(term.term) })) };
  }
  return { kind, termId: target.id, prompt: `Что значит «${target.term}»?`, options: options.map((term) => ({ termId: term.id, text: term.definition })) };
}

/** Набор вопросов на сессию: разные термины, пока их хватает. */
export function termSession(terms: readonly TrainerTerm[], count: number, random: Random): TermQuestion[] {
  const result: TermQuestion[] = [];
  const used = new Set<string>();
  for (let attempt = 0; result.length < count && attempt < count * 20; attempt++) {
    const question = termQuestion(terms, random);
    if (!question) break;
    if (used.has(question.termId) && used.size < terms.length) continue;
    used.add(question.termId);
    result.push(question);
  }
  return result;
}
