/** Разбор своих данных для визуализации: целые числа через запятую или пробел. */
export interface ArrayLimits {
  minLength: number;
  maxLength: number;
  min: number;
  max: number;
}

export const DEFAULT_LIMITS: ArrayLimits = { minLength: 2, maxLength: 10, min: 0, max: 99 };

export type ParseResult = { ok: true; values: number[] } | { ok: false; error: string };

export function limitsHint(limits: ArrayLimits = DEFAULT_LIMITS): string {
  return `От ${limits.minLength} до ${limits.maxLength} целых чисел от ${limits.min} до ${limits.max} через запятую или пробел.`;
}

export function parseArrayInput(text: string, limits: ArrayLimits = DEFAULT_LIMITS): ParseResult {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < limits.minLength || parts.length > limits.maxLength) {
    return { ok: false, error: `Чисел ${parts.length}, а нужно от ${limits.minLength} до ${limits.maxLength}.` };
  }
  const values: number[] = [];
  for (const part of parts) {
    if (!/^[-−]?\d+$/.test(part)) return { ok: false, error: `«${part}» — не целое число.` };
    const value = Number(part.replace('−', '-'));
    if (value < limits.min || value > limits.max) {
      return { ok: false, error: `${value} вне допустимых пределов: от ${limits.min} до ${limits.max}.` };
    }
    values.push(value);
  }
  return { ok: true, values };
}
