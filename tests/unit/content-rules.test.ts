import { describe, expect, it } from 'vitest';
import { findCycle, requiredBlocks } from '../../src/content/rules.ts';
import { checkProse, countWords, parseMdx, splitSentences, variantPattern } from '../../src/content/text.ts';

describe('правила шаблона темы', () => {
  it('у алгоритма на Базе — все блоки, кроме пар путаницы без похожих тем', () => {
    expect(requiredBlocks({ kind: 'algorithm', confusableWith: [] }, 'base').sort()).toEqual(
      ['code', 'complexity', 'explanation', 'measurement', 'misconceptions', 'proof', 'visualization', 'worked-example'].sort(),
    );
  });

  it('у понятия на Фундаменте — объяснение, пример и ошибки; пары путаницы — если есть похожая тема', () => {
    expect(requiredBlocks({ kind: 'concept', confusableWith: [] }, 'fundament').sort()).toEqual(
      ['explanation', 'misconceptions', 'worked-example'].sort(),
    );
    expect(requiredBlocks({ kind: 'concept', confusableWith: ['a.b.c'] }, 'depth')).toContain('confusion-pairs');
  });

  it('находит цикл в предпосылках и не путает его с ромбом', () => {
    const diamond = new Map([
      ['a', ['b', 'c']],
      ['b', ['d']],
      ['c', ['d']],
      ['d', []],
    ]);
    expect(findCycle(diamond)).toBeNull();
    const cycle = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    expect(findCycle(cycle)).toEqual(['a', 'b', 'c', 'a']);
  });
});

describe('правила написания', () => {
  it('делит текст на предложения и считает слова', () => {
    expect(splitSentences('Первое предложение. Второе! А третье? 4 пункта.')).toEqual([
      'Первое предложение.',
      'Второе!',
      'А третье?',
      '4 пункта.',
    ]);
    expect(countWords('Сортировка вставками — устойчивая, n-элементный массив.')).toBe(5);
  });

  it('ловит «очевидно», «легко видеть», восклицания и длинные предложения', () => {
    const long = Array.from({ length: 31 }, (_, index) => `слово${index}`).join(' ') + '.';
    const messages = checkProse([
      { text: 'Очевидно, что так.', line: 1 },
      { text: 'Легко видеть, что так.', line: 2 },
      { text: 'Молодец!', line: 3 },
      { text: long, line: 4 },
      { text: 'Факториал n! растёт быстро.', line: 5 },
    ]).map((problem) => problem.line);
    expect(messages).toEqual([1, 2, 3, 4]);
  });

  it('запрещённый вариант термина ловится в других падежах', () => {
    const pattern = variantPattern('стабильная сортировка');
    expect(pattern.test('свойство стабильной сортировки')).toBe(true);
    expect(pattern.test('Стабильную сортировку')).toBe(true);
    expect(pattern.test('устойчивая сортировка')).toBe(false);
  });
});

describe('разбор MDX', () => {
  it('находит блоки, компоненты и текст без кода', () => {
    const parsed = parseMdx(
      [
        '---',
        'level: base',
        'version: 1',
        '---',
        '',
        '<Block id="x.y.z.b.one" kind="explanation" version={2} title="Раз">',
        '',
        'Текст с `кодом` внутри.',
        '',
        '```js',
        'очевидно();',
        '```',
        '',
        '</Block>',
      ].join('\n'),
    );
    expect(parsed.frontmatter).toBe('level: base\nversion: 1');
    expect(parsed.blocks).toEqual([{ id: 'x.y.z.b.one', kind: 'explanation', version: 2, title: 'Раз', line: 6 }]);
    expect(parsed.components).toEqual(['Block']);
    expect(parsed.prose.map((fragment) => fragment.text)).toEqual(['Текст с X внутри.']);
  });

  it('сообщает о незакрытом теге с номером строки', () => {
    expect(() => parseMdx('<Block id="a">\n\nтекст\n')).toThrow(/closing tag/);
  });
});
