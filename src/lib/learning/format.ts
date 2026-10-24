/**
 * Даты, интервалы и состояния карточек по-русски.
 */
import { State } from 'ts-fsrs';

/** Форма слова для числа: plural(5, ['день', 'дня', 'дней']) → «дней». */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Длительность словами: «10 минут», «3 часа», «2 дня», «4 месяца», «2 года». */
export function formatDuration(ms: number): string {
  const value = Math.max(0, ms);
  if (value < HOUR) {
    const minutes = Math.max(1, Math.round(value / MINUTE));
    return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])}`;
  }
  if (value < DAY) {
    const hours = Math.round(value / HOUR);
    return `${hours} ${plural(hours, ['час', 'часа', 'часов'])}`;
  }
  const days = Math.round(value / DAY);
  if (days < 60) return `${days} ${plural(days, ['день', 'дня', 'дней'])}`;
  if (days < 730) {
    const months = Math.round(days / 30);
    return `${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`;
  }
  const years = Math.round(days / 365);
  return `${years} ${plural(years, ['год', 'года', 'лет'])}`;
}

/** «25 октября, 22:58» — в местном времени. */
export function formatMoment(ms: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

/** «25 октября 2026, 22:58» — для дат, которые могут быть в другом году. */
export function formatFullMoment(ms: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(ms),
  );
}

export const STATE_NAMES: Record<State, string> = {
  [State.New]: 'новая',
  [State.Learning]: 'изучается',
  [State.Review]: 'повторение',
  [State.Relearning]: 'переучивается после ошибки',
};

/** Вероятность в процентах: 0.874 → «87%». */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
