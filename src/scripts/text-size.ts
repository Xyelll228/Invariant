/**
 * Размер текста (ТЗ, «Дизайн»: «размер текста меняется в настройках»).
 * Выбор хранится в браузере и применяется до отрисовки встроенным скриптом
 * (theme-init.js) — атрибутом data-text-size у <html>. Все размеры в стилях
 * заданы в rem, поэтому вместе с текстом растут и отступы.
 */
export type TextSize = 'normal' | 'large' | 'larger';

export const TEXT_SIZE_STORAGE_KEY = 'invariant:text-size';

export const TEXT_SIZES: readonly { value: TextSize; label: string }[] = [
  { value: 'normal', label: 'Обычный' },
  { value: 'large', label: 'Крупнее' },
  { value: 'larger', label: 'Ещё крупнее' },
];

export function readTextSize(): TextSize {
  try {
    const value = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return value === 'large' || value === 'larger' ? value : 'normal';
  } catch {
    return 'normal';
  }
}

export function setTextSize(size: TextSize): void {
  try {
    if (size === 'normal') localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    else localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Хранилище недоступно — размер меняется до перезагрузки страницы.
  }
  if (size === 'normal') document.documentElement.removeAttribute('data-text-size');
  else document.documentElement.setAttribute('data-text-size', size);
}
