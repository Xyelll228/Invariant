/**
 * Генераторы заданий по id вопроса из questions.yaml. Генератор получает
 * генератор случайных чисел с зерном: один и тот же номер варианта всегда
 * даёт одно и то же задание.
 */
import { afterKSteps } from '../../../content/ru/algorithms/sorting/insertion-sort/generators.ts';
import type { Random } from '../random.ts';

export interface GeneratedOption {
  text: string;
  correct: boolean;
  misconception?: string;
}

export interface GeneratedChoice {
  prompt: string;
  options: GeneratedOption[];
  data: Record<string, unknown>;
}

export const choiceGenerators = {
  'algo.sorting.insertion.q.after-k-steps': afterKSteps,
} satisfies Record<string, (random: Random) => GeneratedChoice>;

export type ChoiceGeneratorId = keyof typeof choiceGenerators;
