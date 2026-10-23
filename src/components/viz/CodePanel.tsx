/** Код алгоритма с подсветкой текущей строки: стрелка и жирный шрифт, не только фон. */
export interface CodePanelProps {
  lines: readonly string[];
  /** Номер текущей строки с 1 или null. */
  current: number | null;
  label: string;
}

export function CodePanel({ lines, current, label }: CodePanelProps) {
  return (
    <ol class="code-panel" aria-label={label} tabIndex={0}>
      {lines.map((line, index) => {
        const number = index + 1;
        const isCurrent = number === current;
        return (
          <li key={number} class={isCurrent ? 'is-current' : undefined} aria-current={isCurrent ? 'step' : undefined}>
            <span class="code-panel__number" aria-hidden="true">
              {number}
            </span>
            <code>{line}</code>
          </li>
        );
      })}
    </ol>
  );
}
