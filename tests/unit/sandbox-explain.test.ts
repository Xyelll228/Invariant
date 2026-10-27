import { describe, expect, it } from 'vitest';
import { explainError, explainTimeout } from '../../src/lib/sandbox/explain.ts';

describe('объяснения ошибок', () => {
  it('имя не объявлено — в формате Chrome, Firefox и Safari', () => {
    for (const message of ['x is not defined', "Can't find variable: x"]) {
      expect(explainError({ name: 'ReferenceError', message, line: 3 })).toBe(
        'Имя «x» не объявлено: проверьте кавычки и опечатки. Переменную объявляют через let или const. Строка 3.',
      );
    }
  });

  it('обращение к свойству undefined', () => {
    for (const message of ["Cannot read properties of undefined (reading 'length')", 'a is undefined', "undefined is not an object (evaluating 'a.length')"]) {
      expect(explainError({ name: 'TypeError', message, line: null })).toContain('Значение — undefined или null');
    }
  });

  it('глубокая рекурсия, синтаксис и лимит времени', () => {
    expect(explainError({ name: 'RangeError', message: 'Maximum call stack size exceeded', line: null })).toContain('Слишком глубокая рекурсия');
    expect(explainError({ name: 'InternalError', message: 'too much recursion', line: null })).toContain('Слишком глубокая рекурсия');
    expect(explainError({ name: 'Error', message: 'Uncaught SyntaxError: Unexpected token )', line: 2 })).toBe(
      'Синтаксическая ошибка: проверьте скобки, запятые и кавычки. Строка 2.',
    );
    expect(explainTimeout(2000)).toBe(
      'Тест не уложился в 2 с. Возможно, цикл никогда не заканчивается: проверьте, что его условие когда-нибудь становится ложным.',
    );
  });
});
