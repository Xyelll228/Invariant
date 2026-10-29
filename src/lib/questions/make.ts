/**
 * Помощники для генераторов заданий (generators.ts тем): вариант в нужном
 * формате с полями по умолчанию.
 */
import type { CodeLanguage, GeneratedVariant, PreparedOption } from '../learning/question-types.ts';

export type ChoiceVariant = Extract<GeneratedVariant, { format: 'choice' }>;
export type FreeVariant = Extract<GeneratedVariant, { format: 'free' }>;

interface PromptInput {
  prompt: string;
  code?: string | null;
  language?: CodeLanguage;
  data?: Record<string, unknown>;
}

/** Выбор ответа: ровно один верный вариант (или несколько при multiple). */
export function choiceVariant(input: PromptInput & { options: PreparedOption[]; multiple?: boolean }): ChoiceVariant {
  return {
    format: 'choice',
    prompt: input.prompt,
    code: input.code ?? null,
    language: input.language ?? 'js',
    multiple: input.multiple ?? false,
    options: input.options,
    ...(input.data ? { data: input.data } : {}),
  };
}

/** Свободный ввод с нормализацией ответа. */
export function freeVariant(
  input: PromptInput & { answers: string[]; normalize?: 'text' | 'number' | 'complexity' | 'output' | 'list'; typos?: boolean },
): FreeVariant {
  return {
    format: 'free',
    prompt: input.prompt,
    code: input.code ?? null,
    language: input.language ?? 'js',
    answers: input.answers,
    normalize: input.normalize ?? 'text',
    typos: input.typos ?? false,
    ...(input.data ? { data: input.data } : {}),
  };
}
