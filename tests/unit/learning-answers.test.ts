import { describe, expect, it } from 'vitest';
import {
  checkChoice,
  checkFree,
  checkLine,
  checkOrder,
  complexityEquals,
  editDistance,
  normalizeText,
  parseComplexity,
  parseNumberList,
} from '../../src/lib/learning/answers.ts';

describe('свободный ввод: нормализация (ТЗ, «Тренажёры»)', () => {
  it('текст: регистр, «ё», пробелы, кавычки и точка в конце не важны', () => {
    expect(normalizeText('  Устойчивая   СОРТИРОВКА. ')).toBe('устойчивая сортировка');
    expect(normalizeText('«ёлка»')).toBe('елка');
    expect(checkFree({ answers: ['на месте'], normalize: 'text', typos: false }, 'На  месте.')).toBe(true);
  });

  it('опечатка прощается, только если это разрешено и слово длиннее четырёх букв', () => {
    expect(editDistance('инверсия', 'инвресия')).toBe(1);
    expect(checkFree({ answers: ['инверсия'], normalize: 'text', typos: true }, 'инвресия')).toBe(true);
    expect(checkFree({ answers: ['инверсия'], normalize: 'text', typos: false }, 'инвресия')).toBe(false);
    expect(checkFree({ answers: ['куча'], normalize: 'text', typos: true }, 'кучя')).toBe(false);
    expect(checkFree({ answers: ['инверсия'], normalize: 'text', typos: true }, 'инвресиия')).toBe(false);
  });

  it('число: запятая и точка, пробелы между разрядами', () => {
    expect(checkFree({ answers: ['0.5'], normalize: 'number', typos: false }, '0,5')).toBe(true);
    expect(checkFree({ answers: ['1000000'], normalize: 'number', typos: false }, '1 000 000')).toBe(true);
    expect(checkFree({ answers: ['3'], normalize: 'number', typos: false }, 'три')).toBe(false);
  });

  it('список чисел: со скобками и без, через запятую или пробел', () => {
    expect(parseNumberList('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(parseNumberList('1 2 3')).toEqual([1, 2, 3]);
    expect(parseNumberList('1,2,3')).toEqual([1, 2, 3]);
    expect(parseNumberList('[−4, 7]')).toEqual([-4, 7]);
    expect(parseNumberList('[]')).toEqual([]);
    expect(parseNumberList('1, два')).toBeNull();
    expect(checkFree({ answers: ['[2, 4, 5]'], normalize: 'list', typos: false }, '2 4 5')).toBe(true);
    expect(checkFree({ answers: ['[2, 4, 5]'], normalize: 'list', typos: false }, '2 5 4')).toBe(false);
  });

  it('вывод программы: пробелы в конце строк и пустые строки в конце не важны', () => {
    expect(checkFree({ answers: ['2 [1, 2, 3]'], normalize: 'output', typos: false }, '2 [1, 2, 3]  \n\n')).toBe(true);
    expect(checkFree({ answers: ['1\n2'], normalize: 'output', typos: false }, '1 2')).toBe(false);
  });
});

describe('сложность: «n*log(n)», «nlogn» и «n log₂ n» — один ответ', () => {
  it('приводит запись к единому виду', () => {
    for (const text of ['n*log(n)', 'nlogn', 'n log₂ n', 'n lg n', 'O(n log n)', 'n·log n']) {
      expect(parseComplexity(text)?.body, text).toBe('nlogn');
    }
    for (const text of ['n^2', 'n²', 'n**2', 'Θ(n²)', 'theta(n^2)', 'О(n^2)']) {
      expect(parseComplexity(text)?.body, text).toBe('n^2');
    }
    expect(parseComplexity('O(1)')).toEqual({ symbol: 'O', body: '1' });
    expect(parseComplexity('Θ(n)')?.symbol).toBe('Θ');
    expect(parseComplexity('o(n)')?.symbol).toBe('o');
    expect(parseComplexity('ω(n)')?.symbol).toBe('ω');
    expect(parseComplexity('Ω(n)')?.symbol).toBe('Ω');
    expect(parseComplexity('квадрат')).toBeNull();
  });

  it('если вопрос про Θ, O не засчитывается; в вопросе про O подходит и более точное Θ', () => {
    expect(complexityEquals('Θ(n^2)', 'O(n^2)')).toBe(false);
    expect(complexityEquals('Θ(n^2)', 'Θ(n²)')).toBe(true);
    expect(complexityEquals('Θ(n^2)', 'n^2')).toBe(true);
    expect(complexityEquals('O(n^2)', 'Θ(n^2)')).toBe(true);
    expect(complexityEquals('O(n^2)', 'o(n^2)')).toBe(false);
    expect(complexityEquals('O(n log n)', 'O(n^2)')).toBe(false);
  });
});

describe('выбор, порядок строк и строка с ошибкой', () => {
  const options = [
    { text: 'а', correct: true },
    { text: 'б', correct: false },
    { text: 'в', correct: true },
  ];

  it('выбор: отмечены ровно верные варианты', () => {
    expect(checkChoice({ options }, [0, 2])).toBe(true);
    expect(checkChoice({ options }, [2, 0])).toBe(true);
    expect(checkChoice({ options }, [0])).toBe(false);
    expect(checkChoice({ options }, [0, 1, 2])).toBe(false);
  });

  const parsons = {
    items: [
      { text: 'function f() {', indent: 0 },
      { text: 'if (x) {', indent: 1 },
      { text: '}', indent: 1 },
      { text: '}', indent: 0 },
    ],
    distractors: ['while (x) {'],
    indent: true,
    alternatives: [],
  };

  it('порядок: строки и отступы; одинаковые строки взаимозаменяемы, лишние строки — ошибка', () => {
    const lines = (order: [number, number][]) => ({ lines: order.map(([item, indent]) => ({ item, indent })) });
    expect(checkOrder(parsons, lines([[0, 0], [1, 1], [2, 1], [3, 0]]))).toBe(true);
    // Две строки «}» поменяли местами — программа та же, ответ верный, если отступы на месте.
    expect(checkOrder(parsons, lines([[0, 0], [1, 1], [3, 1], [2, 0]]))).toBe(true);
    expect(checkOrder(parsons, lines([[0, 0], [1, 0], [2, 1], [3, 0]]))).toBe(false);
    expect(checkOrder(parsons, lines([[0, 0], [4, 1], [2, 1], [3, 0]]))).toBe(false);
    expect(checkOrder(parsons, lines([[0, 0], [1, 1], [2, 1]]))).toBe(false);
    expect(checkOrder({ ...parsons, indent: false }, lines([[0, 3], [1, 0], [2, 0], [3, 0]]))).toBe(true);
  });

  it('другие допустимые порядки', () => {
    const proof = { items: [{ text: 'А', indent: 0 }, { text: 'Б', indent: 0 }, { text: 'В', indent: 0 }], distractors: [], indent: false, alternatives: [[1, 0, 2]] };
    expect(checkOrder(proof, { lines: [{ item: 1, indent: 0 }, { item: 0, indent: 0 }, { item: 2, indent: 0 }] })).toBe(true);
    expect(checkOrder(proof, { lines: [{ item: 2, indent: 0 }, { item: 0, indent: 0 }, { item: 1, indent: 0 }] })).toBe(false);
  });

  it('строка с ошибкой: и строка, и причина', () => {
    const body = { bugLine: 4, reasons: [{ text: 'да', correct: true }, { text: 'нет', correct: false }] };
    expect(checkLine(body, 4, 0)).toBe(true);
    expect(checkLine(body, 3, 0)).toBe(false);
    expect(checkLine(body, 4, 1)).toBe(false);
    expect(checkLine(body, 4, null)).toBe(false);
  });
});
