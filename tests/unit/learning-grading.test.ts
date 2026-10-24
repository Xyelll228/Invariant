import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { canBeTooEasy, isConfidentError, ratingFor } from '../../src/lib/learning/grading.ts';

describe('оценка ответа по таблице из ТЗ', () => {
  it.each([
    { correct: false, confidence: 'unsure', expected: Rating.Again },
    { correct: false, confidence: 'guess', expected: Rating.Again },
    { correct: false, confidence: 'know', expected: Rating.Again },
    { correct: true, confidence: 'guess', expected: Rating.Again },
    { correct: true, confidence: 'unsure', expected: Rating.Hard },
    { correct: true, confidence: 'know', expected: Rating.Good },
  ] as const)('$correct + «$confidence» → $expected', ({ correct, confidence, expected }) => {
    expect(ratingFor({ correct, confidence, usedHint: false })).toBe(expected);
  });

  it('«слишком легко» после верного ответа с «знаю» — Easy', () => {
    expect(ratingFor({ correct: true, confidence: 'know', usedHint: false, tooEasy: true })).toBe(Rating.Easy);
  });

  it('«слишком легко» не поднимает оценку неверного ответа или ответа с сомнением', () => {
    expect(ratingFor({ correct: false, confidence: 'know', usedHint: false, tooEasy: true })).toBe(Rating.Again);
    expect(ratingFor({ correct: true, confidence: 'unsure', usedHint: false, tooEasy: true })).toBe(Rating.Hard);
  });

  it('после подсказки оценка не выше Hard', () => {
    expect(ratingFor({ correct: true, confidence: 'know', usedHint: true })).toBe(Rating.Hard);
    expect(ratingFor({ correct: true, confidence: 'know', usedHint: true, tooEasy: true })).toBe(Rating.Hard);
    expect(ratingFor({ correct: true, confidence: 'unsure', usedHint: true })).toBe(Rating.Hard);
    expect(ratingFor({ correct: false, confidence: 'know', usedHint: true })).toBe(Rating.Again);
  });

  it('уверенная ошибка — неверно с «знаю»', () => {
    expect(isConfidentError({ correct: false, confidence: 'know' })).toBe(true);
    expect(isConfidentError({ correct: false, confidence: 'unsure' })).toBe(false);
    expect(isConfidentError({ correct: true, confidence: 'know' })).toBe(false);
  });

  it('«слишком легко» доступно только после верного ответа с «знаю» без подсказки', () => {
    expect(canBeTooEasy({ correct: true, confidence: 'know', usedHint: false })).toBe(true);
    expect(canBeTooEasy({ correct: true, confidence: 'know', usedHint: true })).toBe(false);
    expect(canBeTooEasy({ correct: true, confidence: 'unsure', usedHint: false })).toBe(false);
  });
});
