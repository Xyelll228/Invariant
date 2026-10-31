import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/lib/random.ts';
import { distractors, termQuestion, termSession, type TrainerTerm } from '../../src/lib/learning/terms-trainer.ts';

const term = (id: string, confusedWith: string[] = []): TrainerTerm => ({ id, term: `термин ${id}`, en: `term ${id}`, definition: `определение ${id}`, synonyms: [], confusedWith });
const terms = [term('a', ['b']), term('b'), term('c'), term('d'), term('e')];

describe('тренажёр терминов', () => {
  it('неверные варианты — сначала «часто путают с», в обе стороны', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(distractors(terms, terms[0]!, 3, createRandom(seed))[0]?.id).toBe('b');
      expect(distractors(terms, terms[1]!, 3, createRandom(seed))[0]?.id).toBe('a');
    }
    expect(distractors(terms, terms[2]!, 3, createRandom(1))).toHaveLength(3);
  });

  it('у вопроса с выбором верный вариант ровно один, варианты не повторяются', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const question = termQuestion(terms, createRandom(seed));
      if (!question || question.kind === 'russian-by-english') continue;
      expect(question.options.filter((option) => option.termId === question.termId)).toHaveLength(1);
      expect(new Set(question.options.map((option) => option.text)).size).toBe(question.options.length);
      expect(question.options.length).toBe(4);
    }
  });

  it('один термин — только вопрос «написать по-русски»; сессия — сначала разные термины', () => {
    expect(termQuestion([term('a')], createRandom(3))?.kind).toBe('russian-by-english');
    expect(termQuestion([], createRandom(3))).toBeNull();
    const session = termSession(terms, 5, createRandom(7));
    expect(new Set(session.map((question) => question.termId)).size).toBe(5);
    expect(termSession(terms.slice(0, 2), 4, createRandom(7))).toHaveLength(4);
  });
});
