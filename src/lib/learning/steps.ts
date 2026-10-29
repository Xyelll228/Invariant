/**
 * Шаги цикла темы (ТЗ, «Цикл изучения темы»). Шаг 7 «Повторять» идёт через
 * FSRS и в заданиях не указывается. Модуль без зависимостей: его берут и схема
 * контента, и страницы в браузере.
 */
export const STEPS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Step = (typeof STEPS)[number];

export const STEP_TITLES: Record<Step, string> = {
  0: 'Предвопросы',
  1: 'Понять',
  2: 'Разобрать',
  3: 'Доказать',
  4: 'Написать самому',
  5: 'Измерить',
  6: 'Сломать',
};

/** Название шага по номеру или по строке из записи прогресса («0»…«6»). */
export function stepTitle(step: number | string): string | undefined {
  const number = Number(step);
  return Number.isInteger(number) && number in STEP_TITLES ? STEP_TITLES[number as Step] : undefined;
}
