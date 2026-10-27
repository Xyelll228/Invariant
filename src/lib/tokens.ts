/**
 * Разбор src/styles/tokens.css: значения переменных для светлой темы,
 * тёмной по системной настройке и тёмной по явному выбору.
 */

export interface ThemeTokens {
  light: Record<string, string>;
  darkSystem: Record<string, string>;
  darkExplicit: Record<string, string>;
}

function blockAfter(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`В tokens.css не найден блок ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) throw new Error(`Блок ${selector} не закрыт`);
  return css.slice(open + 1, close);
}

function variables(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) result[name] = value.trim();
  }
  return result;
}

export function parseTokens(css: string): ThemeTokens {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return {
    light: variables(blockAfter(withoutComments, ':root {')),
    darkSystem: variables(blockAfter(withoutComments, ":root:not([data-theme='light']) {")),
    darkExplicit: variables(blockAfter(withoutComments, ":root[data-theme='dark'] {")),
  };
}

/** Цвета тёмной темы поверх светлой: остальные токены общие. */
export function darkTheme(tokens: ThemeTokens): Record<string, string> {
  return { ...tokens.light, ...tokens.darkExplicit };
}
