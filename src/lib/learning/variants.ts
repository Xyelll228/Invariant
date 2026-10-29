/**
 * Вариант задания для показа. Задание = шаблон + параметры + зерно: у
 * генератора вариант вычисляется по зерну, у готовых заданий зерно задаёт
 * порядок вариантов ответа и строк. Одно и то же зерно — один и тот же вариант:
 * зерно хранится в истории, и сообщение об ошибке воспроизводит задание точно.
 */
import { createRandom, type Random } from '../random.ts';
import type { GeneratedVariant, PreparedQuestion, VariantBody } from './question-types.ts';

export type Generator = (random: Random) => GeneratedVariant;

/** Генераторы тем загружаются в браузере по требованию — отдельным файлом на тему. */
const generatorModules = import.meta.glob<Record<string, unknown>>('/content/ru/**/generators.ts');

export async function loadGenerator(dir: string, name: string): Promise<Generator> {
  const load = generatorModules[`/content/ru/${dir}/generators.ts`];
  if (!load) throw new Error(`У темы ${dir} нет генераторов`);
  const module = await load();
  const generator = module[name];
  if (typeof generator !== 'function') throw new Error(`В генераторах темы ${dir} нет функции ${name}`);
  return generator as Generator;
}

/** Зерно по умолчанию для готового задания: от id, чтобы сервер и браузер показали одно и то же. */
export function defaultSeed(questionId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < questionId.length; index++) {
    hash ^= questionId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface Variant {
  body: VariantBody;
  /** Порядок показа: номера вариантов ответа (choice) или строк (order: items, затем лишние). */
  order: number[];
  seed: number;
  data?: Record<string, unknown>;
}

function permutation(count: number, random: Random): number[] {
  return random.shuffle(Array.from({ length: count }, (_, index) => index));
}

/** Готовый вариант: генератор уже вызван (или не нужен). */
export function arrange(body: VariantBody, seed: number, data?: Record<string, unknown>): Variant {
  const random = createRandom(seed);
  let order: number[] = [];
  if (body.format === 'choice') order = permutation(body.options.length, random);
  else if (body.format === 'order') order = permutation(body.items.length + body.distractors.length, random);
  else if (body.format === 'line') order = permutation(body.reasons.length, random);
  return { body, order, seed, ...(data ? { data } : {}) };
}

/** Вариант задания: у генератора — по зерну, у готового — с перемешанными вариантами. */
export async function makeVariant(question: PreparedQuestion, dir: string, seed: number): Promise<Variant> {
  if (question.format === 'generated') {
    const generate = await loadGenerator(dir, question.generator);
    const { data, ...body } = generate(createRandom(seed));
    return arrange(body as VariantBody, seed, data);
  }
  return arrange(question, seed);
}

/** Можно ли дать похожий вариант с другими числами: у генератора — да, у готового выбора — перемешать заново. */
export function hasFreshVariants(question: PreparedQuestion): boolean {
  return question.format === 'generated';
}
