/**
 * Лаборатория кода: редактор CodeMirror 6, запуск в песочнице, видимые и
 * скрытые тесты, консоль и понятные объяснения ошибок.
 *
 * Редактор живёт в теневом DOM: так CodeMirror кладёт свои стили в
 * adoptedStyleSheets, а не в элемент <style>, который строгая CSP не пропустит.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { DEFAULT_TIMEOUT_MS, sharedSandbox, type SandboxReply, type SandboxTest } from '../../lib/sandbox/client.ts';
import { explainError, explainTimeout } from '../../lib/sandbox/explain.ts';
import './code-lab.css';

export interface CodeLabVisibleTest {
  args: unknown[];
  expected?: unknown;
  /** Как показать вызов: «insertionSort([7, 3, 5])». */
  call: string;
  /** Как показать ожидаемый ответ. */
  expectedText?: string;
}

export interface CodeLabExample {
  label: string;
  code: string;
}

export interface CodeLabProps {
  label: string;
  functionName: string;
  starterCode: string;
  visibleTests: CodeLabVisibleTest[];
  hiddenTests: SandboxTest[];
  runnerUrl: string;
  examples?: CodeLabExample[];
  /** Сообщает текущий код при каждом изменении: задание с кодом сдаёт его на проверку. */
  onCodeChange?: (code: string) => void;
}

const SYMBOLS = ['{', '}', '[', ']', '(', ')', ';', '=', '<', '>'];

const monochrome = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword],
    fontWeight: '700',
  },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--color-text-subtle)', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], fontStyle: 'italic' },
]);

const theme = EditorView.theme({
  '&': {
    fontSize: '0.95rem',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: '10px',
  },
  '&.cm-focused': { outline: '3px solid var(--color-text)', outlineOffset: '2px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', minHeight: '14rem' },
  '.cm-content': { caretColor: 'var(--color-text)', padding: '8px 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-subtle)',
    borderRight: '1px solid var(--color-border)',
    borderRadius: '10px 0 0 10px',
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-surface)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--color-surface-strong)', color: 'var(--color-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--color-surface-strong)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--color-text)' },
  '.cm-matchingBracket': { fontWeight: '700', textDecoration: 'underline' },
});

type Status = SandboxReply['results'][number]['status'];
const STATUS_TEXT: Record<Status, string> = {
  pass: '✓ верно',
  fail: '✗ неверно',
  done: '→ результат',
  error: '✗ ошибка',
  timeout: '✗ лимит времени',
  missing: '✗ нет функции',
  skipped: '— не запускался',
};

export default function CodeLab(props: CodeLabProps) {
  const { label, functionName, starterCode, visibleTests, hiddenTests, runnerUrl, examples = [], onCodeChange } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState<SandboxReply | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sandbox = useMemo(() => sharedSandbox(runnerUrl), [runnerUrl]);
  const onChange = useRef(onCodeChange);
  onChange.current = onCodeChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    const mount = document.createElement('div');
    shadow.append(mount);
    const view = new EditorView({
      root: shadow,
      parent: mount,
      state: EditorState.create({
        doc: starterCode,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          javascript(),
          syntaxHighlighting(monochrome),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorState.tabSize.of(2),
          // tabindex явно: длинные строки прокручиваются, и область прокрутки должна
          // быть доступна с клавиатуры (WCAG, правило axe scrollable-region-focusable).
          EditorView.contentAttributes.of({ 'aria-label': `${label}: редактор кода`, tabindex: '0' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange.current?.(update.state.doc.toString());
          }),
          theme,
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [starterCode, label]);

  const setCode = (code: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    view.focus();
    setReply(null);
    setFailure(null);
  };

  const insert = (symbol: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(symbol));
    view.focus();
  };

  const run = async () => {
    const code = viewRef.current?.state.doc.toString() ?? '';
    setRunning(true);
    setFailure(null);
    try {
      const tests: SandboxTest[] = [
        ...visibleTests.map((test) => ('expected' in test ? { args: test.args, expected: test.expected } : { args: test.args })),
        ...hiddenTests,
      ];
      setReply(await sandbox.run({ code, functionName, tests }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const visibleResults = reply?.results.slice(0, visibleTests.length) ?? [];
  const hiddenResults = reply?.results.slice(visibleTests.length) ?? [];
  const hiddenPassed = hiddenResults.filter((result) => result.status === 'pass').length;
  const firstHiddenFailure = hiddenResults.findIndex((result) => result.status !== 'pass' && result.status !== 'skipped');
  const skipped = reply?.results.filter((result) => result.status === 'skipped').length ?? 0;
  const firstProblem = reply?.results.find((result) => result.status === 'error' || result.status === 'timeout' || result.status === 'missing');
  const logs = reply?.results.flatMap((result, index) => result.logs.map((line) => `Тест ${index + 1}: ${line}`)) ?? [];
  const allPassed = reply !== null && !reply.loadError && reply.results.every((result) => result.status === 'pass' || result.status === 'done');

  return (
    <section class="code-lab" aria-label={label}>
      {examples.length > 0 && (
        <div class="code-lab__examples">
          <span>Вставить пример:</span>
          {examples.map((example) => (
            <button type="button" class="button" onClick={() => setCode(example.code)}>
              {example.label}
            </button>
          ))}
        </div>
      )}
      <div class="code-lab__editor" ref={hostRef}>
        <pre class="code-lab__fallback" tabIndex={0}>
          {starterCode}
        </pre>
      </div>
      <div class="code-lab__symbols" role="group" aria-label="Символы для набора кода">
        {SYMBOLS.map((symbol) => (
          <button type="button" class="button" onClick={() => insert(symbol)} aria-label={`Вставить ${symbol}`}>
            {symbol}
          </button>
        ))}
      </div>
      <p class="code-lab__hint muted">Esc, затем Tab — выйти из редактора. Ctrl+Z — отменить.</p>
      <div class="button-row">
        <button type="button" class="button button--primary" onClick={run} disabled={running}>
          {running ? 'Запуск…' : 'Запустить'}
        </button>
        <button type="button" class="button" onClick={() => setCode(starterCode)} disabled={running}>
          Вернуть исходный код
        </button>
      </div>

      <div aria-live="polite">
        {failure && (
          <div class="viz-feedback" role="status">
            <p>Песочница не ответила: {failure}</p>
          </div>
        )}
        {reply?.loadError && (
          <div class="viz-feedback" role="status">
            <p>
              <strong>Код не запустился.</strong> {explainError(reply.loadError)}
            </p>
          </div>
        )}
        {reply && !reply.loadError && (
          <div class="code-lab__results">
            <p class="code-lab__summary" role="status">
              {allPassed ? 'Все тесты пройдены.' : 'Есть непройденные тесты.'} Видимые: {visibleResults.filter((r) => r.status === 'pass' || r.status === 'done').length} из{' '}
              {visibleTests.length}
              {hiddenTests.length > 0 ? `, скрытые: ${hiddenPassed} из ${hiddenTests.length}` : ''}.
            </p>
            <ol class="code-lab__tests">
              {visibleTests.map((test, index) => {
                const result = visibleResults[index];
                if (!result) return null;
                return (
                  <li>
                    <p class="code-lab__status">{STATUS_TEXT[result.status]}</p>
                    <p>
                      Вызов: <code>{test.call}</code>
                    </p>
                    {test.expectedText !== undefined && (
                      <p>
                        Ожидается: <code>{test.expectedText}</code>
                      </p>
                    )}
                    {result.shown !== null && (
                      <p>
                        Получено: <code>{result.shown}</code>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            {firstHiddenFailure >= 0 && (
              <p>
                Скрытый тест {firstHiddenFailure + 1} не пройден: {STATUS_TEXT[hiddenResults[firstHiddenFailure]?.status ?? 'fail']}. Пример
                данных: <code>{JSON.stringify(hiddenTests[firstHiddenFailure]?.args[0])}</code>
                {hiddenResults[firstHiddenFailure]?.shown ? (
                  <>
                    , получено: <code>{hiddenResults[firstHiddenFailure]?.shown}</code>
                  </>
                ) : null}
                .
              </p>
            )}
            {firstProblem && (
              <div class="viz-feedback">
                <p>
                  {firstProblem.status === 'timeout'
                    ? explainTimeout(DEFAULT_TIMEOUT_MS)
                    : firstProblem.status === 'missing'
                      ? `Функция ${functionName} не найдена: проверьте её имя — оно должно быть в точности «${functionName}».`
                      : firstProblem.error
                        ? explainError(firstProblem.error)
                        : ''}
                  {skipped > 0 ? ` Остальные тесты (${skipped}) не запускались.` : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {logs.length > 0 && (
        <>
          <h3 class="code-lab__console-title">Консоль</h3>
          <pre class="code-lab__console" tabIndex={0}>
            {logs.join('\n')}
          </pre>
        </>
      )}
    </section>
  );
}
