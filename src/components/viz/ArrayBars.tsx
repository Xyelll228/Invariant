/**
 * Массив в виде столбиков. Цвет состояния всегда дублируется формой или
 * знаком: сравнение — пунктирная рамка, обмен — ⇄, ключ — ▲, на месте — ✓,
 * выбранный элемент — двойная рамка и ●. Перемещения анимируются (FLIP),
 * если человек не просил уменьшить движение.
 */
import { useLayoutEffect, useRef } from 'preact/hooks';
import { useReducedMotion } from './useReducedMotion.ts';

export interface ArrayBarsProps {
  values: readonly number[];
  ids: readonly number[];
  /** Номера элементов, которые уже на месте. */
  sorted?: readonly number[];
  /** Номер элемента-ключа. */
  keyId?: number | undefined;
  compare?: readonly [number, number] | null;
  swap?: readonly [number, number] | null;
  /** Индексы ячеек, выбранных человеком. */
  selected?: readonly number[];
  /** Если задано, ячейки — кнопки, и нажатие выбирает ячейку. */
  onSelect?: (index: number) => void;
  label: string;
}

/**
 * Высота столбика ступенями по 5%: класс вместо атрибута style, чтобы
 * разметку можно было собрать заранее — CSP не пропускает встроенные стили.
 */
export function heightBucket(value: number, max: number): number {
  const percent = max <= 0 ? 0 : (Math.max(0, value) / max) * 100;
  return Math.max(5, Math.min(100, Math.round(percent / 5) * 5));
}

export function ArrayBars(props: ArrayBarsProps) {
  const { values, ids, sorted = [], keyId, compare = null, swap = null, selected = [], onSelect, label } = props;
  const reducedMotion = useReducedMotion();
  const nodes = useRef(new Map<number, HTMLElement>());
  const callbacks = useRef(new Map<number, (node: HTMLElement | null) => void>());
  const lefts = useRef(new Map<number, number>());
  const max = Math.max(1, ...values);

  const refFor = (id: number) => {
    let callback = callbacks.current.get(id);
    if (!callback) {
      callback = (node: HTMLElement | null) => {
        if (node) nodes.current.set(id, node);
        else nodes.current.delete(id);
      };
      callbacks.current.set(id, callback);
    }
    return callback;
  };

  useLayoutEffect(() => {
    const next = new Map<number, number>();
    for (const [id, node] of nodes.current) {
      const left = node.getBoundingClientRect().left;
      next.set(id, left);
      const before = lefts.current.get(id);
      if (!reducedMotion && before !== undefined && Math.abs(before - left) > 0.5 && typeof node.animate === 'function') {
        node.animate([{ transform: `translateX(${before - left}px)` }, { transform: 'translateX(0)' }], {
          duration: 280,
          easing: 'ease-in-out',
        });
      }
    }
    lefts.current = next;
  });

  const sortedSet = new Set(sorted);
  const inPair = (pair: readonly [number, number] | null, index: number) => pair !== null && (pair[0] === index || pair[1] === index);

  return (
    <ul class="bars" aria-label={label}>
      {ids.map((id, index) => {
        const value = values[index] as number;
        const isKey = keyId === id;
        const isSorted = sortedSet.has(id) && !isKey;
        const isCompare = inPair(compare, index);
        const isSwap = inPair(swap, index);
        const isSelected = selected.includes(index);
        const classes = [
          'bar',
          isSorted && 'is-sorted',
          isKey && 'is-key',
          isCompare && 'is-compare',
          isSwap && 'is-swap',
          isSelected && 'is-selected',
        ]
          .filter(Boolean)
          .join(' ');
        const states = [
          isKey && 'ключ',
          isSorted && 'на месте',
          isCompare && 'сравнивается',
          isSwap && 'меняется местами',
          isSelected && 'выбран',
        ].filter(Boolean);
        const mark = isSwap ? '⇄' : isKey ? '▲' : isSorted ? '✓' : '';
        const content = (
          <>
            <span class="bar__value">{value}</span>
            <span class="bar__body" data-h={heightBucket(value, max)} aria-hidden="true" />
            <span class="bar__index" aria-hidden="true">
              {index}
            </span>
            <span class="bar__mark" aria-hidden="true">
              {mark}
            </span>
            <span class="visually-hidden">
              , индекс {index}
              {states.length > 0 ? `, ${states.join(', ')}` : ''}
            </span>
          </>
        );
        return (
          <li key={id} ref={refFor(id)}>
            {onSelect ? (
              <button type="button" class={classes} aria-pressed={isSelected} onClick={() => onSelect(index)}>
                {content}
              </button>
            ) : (
              <div class={classes}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
