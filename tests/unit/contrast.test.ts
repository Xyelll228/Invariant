import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, formatRatio, parseHex } from '../../src/lib/contrast.ts';
import { darkTheme, parseTokens } from '../../src/lib/tokens.ts';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const tokens = parseTokens(css);
const themes = { светлая: tokens.light, тёмная: darkTheme(tokens) };

function color(theme: Record<string, string>, name: string): string {
  const value = theme[name];
  if (!value) throw new Error(`Нет токена ${name}`);
  return value;
}

describe('формула контраста WCAG', () => {
  it('чёрный на белом — 21:1, одинаковые цвета — 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('разбирает короткую запись и округляет вниз при показе', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(formatRatio(4.49)).toBe('4,4:1');
    expect(() => parseHex('red')).toThrow();
  });
});

describe('токены тем', () => {
  it('тёмная тема по системной настройке совпадает с явно выбранной', () => {
    expect(tokens.darkSystem).toEqual(
      Object.fromEntries(Object.entries(tokens.darkExplicit).filter(([name]) => name.startsWith('--'))),
    );
  });

  for (const [themeName, theme] of Object.entries(themes)) {
    describe(`${themeName} тема`, () => {
      const backgrounds = ['--color-bg', '--color-surface', '--color-surface-strong'];
      const texts = ['--color-text', '--color-text-muted', '--color-text-subtle'];

      for (const text of texts) {
        for (const background of backgrounds) {
          it(`${text} на ${background} — не меньше 4,5:1`, () => {
            expect(contrastRatio(color(theme, text), color(theme, background))).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      it('текст главной кнопки и её наведения — не меньше 4,5:1', () => {
        const inverse = color(theme, '--color-inverse-text');
        expect(contrastRatio(inverse, color(theme, '--color-inverse-bg'))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(inverse, color(theme, '--color-text-muted'))).toBeGreaterThanOrEqual(4.5);
      });

      it('рамка полей и кнопок — не меньше 3:1 к фону', () => {
        expect(contrastRatio(color(theme, '--color-border-strong'), color(theme, '--color-bg'))).toBeGreaterThanOrEqual(3);
      });

      it('контур элементов визуализации — не меньше 3:1 к фону', () => {
        expect(contrastRatio(color(theme, '--viz-outline'), color(theme, '--color-bg'))).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
