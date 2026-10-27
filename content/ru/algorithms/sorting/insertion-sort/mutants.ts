/**
 * Испорченные версии эталона. Каждая воспроизводит одну типичную ошибку.
 * Автопроверка требует, чтобы любой мутант падал хотя бы на одном тесте:
 * иначе тесты слабые. Мутанты же дают неверные варианты для шага «Сломать».
 */
export interface Mutant {
  id: string;
  /** Что сломано — для разбора в шаге «Сломать». */
  description: string;
  sortBy<T>(input: readonly T[], key: (item: T) => number): T[];
}

function swap<T>(a: T[], i: number, j: number): void {
  [a[i], a[j]] = [a[j] as T, a[i] as T];
}

export const mutants: Mutant[] = [
  {
    id: 'non-strict-compare',
    description: 'Сравнение >= вместо >: равные элементы меняются местами, сортировка теряет устойчивость.',
    sortBy(input, key) {
      const a = [...input];
      for (let i = 1; i < a.length; i++) {
        for (let j = i; j > 0 && key(a[j - 1]!) >= key(a[j]!); j--) swap(a, j - 1, j);
      }
      return a;
    },
  },
  {
    id: 'start-from-two',
    description: 'Внешний цикл начинается с i = 2: элемент с индексом 1 не вставляется.',
    sortBy(input, key) {
      const a = [...input];
      for (let i = 2; i < a.length; i++) {
        for (let j = i; j > 0 && key(a[j - 1]!) > key(a[j]!); j--) swap(a, j - 1, j);
      }
      return a;
    },
  },
  {
    id: 'stop-before-zero',
    description: 'Условие j > 1 вместо j > 0: элемент не доходит до начала массива.',
    sortBy(input, key) {
      const a = [...input];
      for (let i = 1; i < a.length; i++) {
        for (let j = i; j > 1 && key(a[j - 1]!) > key(a[j]!); j--) swap(a, j - 1, j);
      }
      return a;
    },
  },
  {
    id: 'skip-last',
    description: 'Граница i < a.length - 1: последний элемент не вставляется.',
    sortBy(input, key) {
      const a = [...input];
      for (let i = 1; i < a.length - 1; i++) {
        for (let j = i; j > 0 && key(a[j - 1]!) > key(a[j]!); j--) swap(a, j - 1, j);
      }
      return a;
    },
  },
  {
    id: 'single-swap',
    description: 'if вместо while: элемент сдвигается влево только на одну позицию.',
    sortBy(input, key) {
      const a = [...input];
      for (let i = 1; i < a.length; i++) {
        if (key(a[i - 1]!) > key(a[i]!)) swap(a, i - 1, i);
      }
      return a;
    },
  },
];
