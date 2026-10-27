/**
 * Как ответ превращается в оценку FSRS (ТЗ, «Разбор ошибок и повторение»).
 * Оценку ставит приложение по результату и уверенности, а не человек на глаз.
 *
 * | Ответ   | Уверенность               | Оценка |
 * | Неверно | любая                     | Again  |
 * | Верно   | «наугад»                  | Again  |
 * | Верно   | «сомневаюсь»              | Hard   |
 * | Верно   | «знаю»                    | Good   |
 * | Верно   | «знаю» + «слишком легко»  | Easy   |
 *
 * Если человек открывал подсказку, оценка не выше Hard даже при верном ответе.
 */
import { Rating, type Grade } from 'ts-fsrs';
import type { Confidence } from './types.ts';

export interface Answer {
  correct: boolean;
  confidence: Confidence;
  usedHint: boolean;
  /** Кнопка «слишком легко»; учитывается только при верном ответе с «знаю». */
  tooEasy?: boolean;
}

export function ratingFor(answer: Answer): Grade {
  let rating: Grade;
  if (!answer.correct || answer.confidence === 'guess') rating = Rating.Again;
  else if (answer.confidence === 'unsure') rating = Rating.Hard;
  else rating = answer.tooEasy ? Rating.Easy : Rating.Good;
  if (answer.usedHint && rating > Rating.Hard) rating = Rating.Hard;
  return rating;
}

/** «Уверенная ошибка»: неверный ответ с отметкой «знаю». */
export function isConfidentError(answer: Pick<Answer, 'correct' | 'confidence'>): boolean {
  return !answer.correct && answer.confidence === 'know';
}

/** Можно ли нажать «слишком легко» после этого ответа. */
export function canBeTooEasy(answer: Answer): boolean {
  return answer.correct && answer.confidence === 'know' && !answer.usedHint;
}

export const RATING_NAMES: Record<Grade, string> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
};
