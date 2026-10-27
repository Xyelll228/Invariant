/**
 * Учебный день (ТЗ, «Нестандартные ситуации»). Он начинается в 4:00 по местному
 * времени, а не в полночь: занятие после полуночи относится к прошедшему дню.
 * Лимиты считаются по учебному дню; повторение со сроком в днях доступно с
 * начала своего учебного дня, а не с точной минуты.
 *
 * Время берётся местное, через конструктор Date(год, месяц, день, час): так
 * переход на летнее время и смена часового пояса не сдвигают границу дня.
 */
export const DEFAULT_DAY_START_HOUR = 4;

/** Начало учебного дня, к которому относится момент at (мс). */
export function learningDayStart(at: number, startHour = DEFAULT_DAY_START_HOUR): number {
  const date = new Date(at);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour);
  if (start.getTime() <= at) return start.getTime();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, startHour).getTime();
}

/** Начало следующего учебного дня. */
export function nextLearningDayStart(at: number, startHour = DEFAULT_DAY_START_HOUR): number {
  const start = new Date(learningDayStart(at, startHour));
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, startHour).getTime();
}

/** Учебный день как строка ГГГГ-ММ-ДД — дата его начала. */
export function learningDayKey(at: number, startHour = DEFAULT_DAY_START_HOUR): string {
  const start = new Date(learningDayStart(at, startHour));
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-${month}-${day}`;
}

/** Сколько учебных дней от момента from до момента to: 0 — тот же день. */
export function learningDaysBetween(from: number, to: number, startHour = DEFAULT_DAY_START_HOUR): number {
  const a = new Date(learningDayStart(from, startHour));
  const b = new Date(learningDayStart(to, startHour));
  // Разница календарных дат без учёта длины суток (23 или 25 часов при переводе часов).
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}
