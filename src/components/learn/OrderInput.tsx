/**
 * Порядок строк: задача Парсонса (собрать код из перемешанных строк, среди
 * них есть лишние) и шаги доказательства. Перетаскивания нет: всё делается
 * кнопками — так задачу можно решить с клавиатуры и на телефоне (ТЗ,
 * «Доступность»: перетаскивание всегда дублируется кнопками).
 */
import type { OrderAnswer } from '../../lib/learning/answers.ts';
import type { OrderBody } from '../../lib/learning/question-types.ts';

export interface OrderInputProps {
  body: OrderBody;
  /** Порядок показа строк в запасе: номера items, затем лишние. */
  order: number[];
  answer: OrderAnswer;
  onChange: (answer: OrderAnswer) => void;
  disabled: boolean;
  /** Код или обычный текст (шаги доказательства). */
  code: boolean;
}

function textOf(body: OrderBody, item: number): string {
  return item < body.items.length ? (body.items[item]?.text ?? '') : (body.distractors[item - body.items.length] ?? '');
}

function short(text: string): string {
  const clean = text.trim();
  return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
}

export function OrderInput({ body, order, answer, onChange, disabled, code }: OrderInputProps) {
  const placed = answer.lines;
  const used = new Set(placed.map((line) => line.item));
  const pool = order.filter((item) => !used.has(item));
  const textClass = code ? 'order__text' : 'order__text order__text--prose';

  const update = (lines: OrderAnswer['lines']) => onChange({ lines });
  const add = (item: number) => update([...placed, { item, indent: 0 }]);
  const remove = (index: number) => update(placed.filter((_, position) => position !== index));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= placed.length) return;
    const next = [...placed];
    [next[index], next[target]] = [next[target] as OrderAnswer['lines'][number], next[index] as OrderAnswer['lines'][number]];
    update(next);
  };
  const indent = (index: number, delta: number) =>
    update(placed.map((line, position) => (position === index ? { ...line, indent: Math.min(6, Math.max(0, line.indent + delta)) } : line)));

  return (
    <div class="order">
      <div class="order__column">
        <p class="order__title">Строки</p>
        {pool.length === 0 ? (
          <p class="muted">Все строки в ответе.</p>
        ) : (
          <ul class="order__list">
            {pool.map((item) => (
              <li class="order__line">
                <span class={textClass}>{textOf(body, item)}</span>
                <span class="order__buttons">
                  <button type="button" class="button" disabled={disabled} onClick={() => add(item)} aria-label={`Добавить в ответ: ${short(textOf(body, item))}`}>
                    Добавить
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="order__column">
        <p class="order__title">Ваш ответ{body.indent ? ' — с отступами' : ''}</p>
        {placed.length === 0 ? (
          <p class="muted">Добавляйте строки по порядку.</p>
        ) : (
          <ol class="order__list">
            {placed.map((line, index) => {
              const label = short(textOf(body, line.item));
              return (
                <li class={`order__line order__indent-${body.indent ? line.indent : 0}`}>
                  <span class={textClass}>{textOf(body, line.item)}</span>
                  <span class="order__buttons">
                    <button type="button" class="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`Выше: ${label}`}>
                      ↑
                    </button>
                    <button type="button" class="button" disabled={disabled || index === placed.length - 1} onClick={() => move(index, 1)} aria-label={`Ниже: ${label}`}>
                      ↓
                    </button>
                    {body.indent && (
                      <>
                        <button type="button" class="button" disabled={disabled || line.indent === 0} onClick={() => indent(index, -1)} aria-label={`Уменьшить отступ: ${label}`}>
                          ←
                        </button>
                        <button type="button" class="button" disabled={disabled || line.indent >= 6} onClick={() => indent(index, 1)} aria-label={`Увеличить отступ: ${label}`}>
                          →
                        </button>
                      </>
                    )}
                    <button type="button" class="button" disabled={disabled} onClick={() => remove(index)} aria-label={`Убрать из ответа: ${label}`}>
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
