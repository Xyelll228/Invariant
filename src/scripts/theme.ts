import { t } from '../i18n/index.ts';

/** Выбор темы: как в системе, светлая или тёмная. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'invariant:theme';
const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** Следующая тема по кругу: система → светлая → тёмная → система. */
export function nextTheme(current: ThemeChoice): ThemeChoice {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length] ?? 'system';
}

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Хранилище недоступно (например, запрещено настройками) — тема
    // всё равно меняется до перезагрузки страницы.
  }
}

/** Показывает тему на странице: атрибут data-theme и подпись кнопки в шапке. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  const label = t('theme.button', { name: t(`theme.${choice}`) });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.dataset.state = choice;
    button.title = label;
    const text = button.querySelector('[data-theme-label]');
    if (text) text.textContent = label;
  }
}

export function initThemeToggle(): void {
  applyTheme(readTheme());
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.addEventListener('click', () => {
      const choice = nextTheme(readThemeFromDom());
      saveTheme(choice);
      applyTheme(choice);
    });
  }
}

/** Текущее состояние берём со страницы: хранилище может быть недоступно. */
function readThemeFromDom(): ThemeChoice {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : 'system';
}
