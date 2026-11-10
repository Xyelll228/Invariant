/**
 * Формулы (ТЗ, «Справочник»: формулы набраны как формулы, а не картинки).
 * TeX переводится в MathML при сборке библиотекой KaTeX: в браузер не идут ни
 * скрипты, ни шрифты KaTeX, а экранный диктор читает формулу как формулу.
 * Ошибка в TeX ломает сборку и проверку контента, а не показывается ученику.
 */
import katex from 'katex';

export function renderFormula(tex: string, block = false): string {
  return katex.renderToString(tex, {
    output: 'mathml',
    displayMode: block,
    throwOnError: true,
    strict: 'error',
    trust: false,
  });
}
