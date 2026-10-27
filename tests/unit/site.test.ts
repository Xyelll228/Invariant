import { describe, expect, it } from 'vitest';
import { databaseNameFor, joinBase, parsePreviewPr } from '../../src/lib/site.ts';
import { t } from '../../src/i18n/index.ts';
import { nextTheme } from '../../src/scripts/theme.ts';

describe('адреса и base', () => {
  it('склеивает base и путь без двойных косых черт', () => {
    expect(joinBase('/Invariant/', 'ru/')).toBe('/Invariant/ru/');
    expect(joinBase('/Invariant', '/ru/about/')).toBe('/Invariant/ru/about/');
    expect(joinBase('/Invariant/pr-preview/pr-3/', '')).toBe('/Invariant/pr-preview/pr-3/');
  });
});

describe('превью правки', () => {
  it('номер правки читается из переменной окружения', () => {
    expect(parsePreviewPr(undefined)).toBeNull();
    expect(parsePreviewPr('')).toBeNull();
    expect(parsePreviewPr('12')).toBe(12);
    expect(() => parsePreviewPr('pr-12')).toThrow();
  });

  it('у основной версии и у каждого превью своя база данных', () => {
    expect(databaseNameFor(null)).toBe('invariant');
    expect(databaseNameFor(7)).toBe('invariant-pr-7');
  });
});

describe('строки интерфейса', () => {
  it('подставляет параметры', () => {
    expect(t('preview.banner', { pr: 5 })).toBe('Превью правки № 5. Это не основная версия сайта.');
  });

  it('оставляет неизвестный параметр видимым', () => {
    expect(t('theme.button')).toBe('Тема: {name}');
  });
});

describe('переключатель темы', () => {
  it('идёт по кругу: система → светлая → тёмная → система', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});
