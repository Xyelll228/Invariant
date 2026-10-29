/**
 * Одно задание (ТЗ, «Тренажёры» и «Разбор ошибок и повторение»): ответ в
 * своём формате, отметка уверенности «знаю / сомневаюсь / наугад» перед
 * проверкой, подсказки ступенями, проверка и разбор.
 *
 * Разбор ошибки: правильный ответ, объяснение заблуждения за выбранным
 * вариантом, ссылка на блок справочника, запись в журнал ошибок с заметкой
 * «почему я ошибся» и похожий вариант сразу. Оценку FSRS ставит приложение
 * по результату и уверенности (src/lib/learning/grading.ts).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type CodeLabComponent from '../code/CodeLab.tsx';
import ArraySimulation, { type SimulationStats } from '../viz/ArraySimulation.tsx';
import { checkChoice, checkFree, checkLine, checkOrder, type OrderAnswer } from '../../lib/learning/answers.ts';
import { canBeTooEasy } from '../../lib/learning/grading.ts';
import type { Level, PreparedMisconception, PreparedQuestion, TopicContext, VariantBody } from '../../lib/learning/question-types.ts';
import { markTooEasy, randomSeed, recordAnswer, saveErrorNote, type AnswerResult } from '../../lib/learning/store.ts';
import { warmTopic } from '../../lib/learning/warm.ts';
import type { Confidence, ReviewMode } from '../../lib/learning/types.ts';
import { arrange, defaultSeed, makeVariant, type Variant } from '../../lib/learning/variants.ts';
import { sharedSandbox } from '../../lib/sandbox/client.ts';
import type { ArrayAlgorithmId } from '../../lib/viz/algorithms.ts';
import { OrderInput } from './OrderInput.tsx';
import { CodeBlock, Prompt, RichText } from './Prompt.tsx';
import './learn.css';

/**
 * Редактор кода (CodeMirror) — самая тяжёлая часть страницы. Он загружается,
 * только когда на странице есть задание с кодом (ТЗ, «Скорость»).
 */
let codeLabModule: Promise<typeof CodeLabComponent> | null = null;
function loadCodeLab(): Promise<typeof CodeLabComponent> {
  codeLabModule ??= import('../code/CodeLab.tsx').then((module) => module.default);
  return codeLabModule;
}

export const TYPE_TITLES: Record<string, string> = {
  choice: 'Выбор ответа',
  free: 'Свободный ввод',
  trace: 'Трассировка',
  output: 'Что выведет код',
  simulation: 'Ручная симуляция',
  predict: 'Предсказание',
  parsons: 'Сборка кода из строк',
  fill: 'Заполнить пропуски',
  write: 'Написать функцию',
  'find-bug': 'Найти ошибку',
  'which-algorithm': 'Какой это алгоритм',
  complexity: 'Сложность по коду',
  terms: 'Термины',
  confusion: 'Чем отличается',
  proof: 'Доказательство',
  sql: 'SQL-запрос',
  explain: 'Объяснить своими словами',
};

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: 'know', label: 'знаю' },
  { value: 'unsure', label: 'сомневаюсь' },
  { value: 'guess', label: 'наугад' },
];


export interface QuestionProps {
  topic: TopicContext;
  level: Level;
  question: PreparedQuestion;
  /** pre — предвопрос: ответ не оценивается и в FSRS не идёт. */
  mode: ReviewMode | 'pre';
  /** base сайта: к нему приклеиваются ссылки на блоки. */
  base: string;
  runnerUrl: string;
  /** Засчитывается ли верный ответ в пройденные шаги уровня. */
  countsForSteps?: boolean;
  /** Подпись «вопрос N из M». */
  position?: { index: number; total: number };
  /** Можно ли открывать подсказки (в проверках — нельзя). */
  allowHints?: boolean;
  /** Можно ли сразу взять похожий вариант после ответа. */
  allowRetry?: boolean;
  /** Зерно варианта; по умолчанию у генератора — случайное, у готового задания — от id. */
  initialSeed?: number;
  /** Ответ сохранён: верно ли и была ли это уверенная ошибка (ответ «знаю» — неверный). */
  onAnswered?: (outcome: { correct: boolean; confidentError: boolean }) => void;
}

interface Outcome {
  correct: boolean;
  misconception: string | null;
  result: AnswerResult | null;
  /** Что показать как правильный ответ. */
  correctText: string | null;
  details: string | null;
}

interface AnswerState {
  selected: number[];
  text: string;
  order: OrderAnswer;
  line: number | null;
  reason: number | null;
  code: string;
  selfRevealed: boolean;
}

const EMPTY: AnswerState = { selected: [], text: '', order: { lines: [] }, line: null, reason: null, code: '', selfRevealed: false };

function correctTextOf(body: VariantBody): string | null {
  switch (body.format) {
    case 'choice':
      return body.options.filter((option) => option.correct).map((option) => option.text).join('; ');
    case 'free':
      return body.answers[0] ?? null;
    case 'order':
      return body.items.map((item) => `${'  '.repeat(body.indent ? item.indent : 0)}${item.text}`).join('\n');
    case 'line':
      return `строка ${body.bugLine}: ${body.reasons.find((reason) => reason.correct)?.text ?? ''}`;
    default:
      return null;
  }
}

export default function Question(props: QuestionProps) {
  const { topic, level, question, mode, base, runnerUrl, countsForSteps = mode === 'learn' || mode === 'pre', position, allowHints = true, allowRetry = true } = props;
  const uid = useId();
  // У генератора в браузере — случайное зерно: каждый раз новые данные. Готовое
  // задание перемешивается по зерну от id: так совпадают HTML со страницы и браузер.
  const [seed, setSeed] = useState<number>(
    () => props.initialSeed ?? (question.format === 'generated' && typeof window !== 'undefined' ? randomSeed() : defaultSeed(question.id)),
  );
  // Готовое задание показывается сразу (и в HTML со страницы), вариант генератора — после загрузки генератора.
  const [variant, setVariant] = useState<Variant | null>(() =>
    question.format === 'generated' ? null : arrange(question as VariantBody, props.initialSeed ?? defaultSeed(question.id)),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AnswerState>(EMPTY);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [hints, setHints] = useState(0);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [tooEasy, setTooEasy] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const pre = mode === 'pre';
  const [CodeLab, setCodeLab] = useState<typeof CodeLabComponent | null>(null);
  const needsEditor = variant?.body.format === 'code';

  useEffect(() => {
    if (!needsEditor || CodeLab) return;
    let alive = true;
    loadCodeLab()
      .then((component) => {
        if (alive) setCodeLab(() => component);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [needsEditor, CodeLab]);

  // Вариант: у генератора — по зерну, у готового задания — перемешанные варианты ответа.
  useEffect(() => {
    let alive = true;
    makeVariant(question, topic.dir, seed)
      .then((next) => {
        if (alive) setVariant(next);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [question, topic.dir, seed]);

  useEffect(() => {
    if (outcome) feedbackRef.current?.focus();
  }, [outcome]);

  const misconceptions: Record<string, PreparedMisconception> = topic.misconceptions;
  const body = variant?.body ?? null;
  const simulationDone = useRef<SimulationStats | null>(null);

  const ready = useMemo(() => {
    if (!body) return false;
    switch (body.format) {
      case 'choice':
        return answer.selected.length > 0;
      case 'free':
        return answer.text.trim() !== '';
      case 'order':
        return answer.order.lines.length > 0;
      case 'line':
        return answer.line !== null && answer.reason !== null;
      case 'self':
        return answer.selfRevealed;
      case 'code':
        return true;
      case 'simulation':
        return false;
    }
  }, [body, answer]);

  const needsConfidence = !pre && body?.format !== 'simulation';

  async function submit(correct: boolean, misconception: string | null, details: string | null = null, usedHint = hints > 0, assumedConfidence: Confidence | null = null) {
    if (!body) return;
    setBusy(true);
    let result: AnswerResult | null = null;
    try {
      result = await recordAnswer({
        topic,
        level,
        question: { id: question.id, version: question.version, role: question.role, skill: question.skill },
        correct,
        confidence: pre ? null : (assumedConfidence ?? confidence),
        usedHint,
        seed: variant?.seed ?? seed,
        misconception,
        mode: pre ? 'learn' : (mode as ReviewMode),
        countsForSteps,
      });
      if (mode === 'learn' || mode === 'pre') warmTopic(base, topic.topicId);
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
    setOutcome({ correct, misconception, result, correctText: correctTextOf(body), details });
    props.onAnswered?.({ correct, confidentError: result?.confidentError ?? false });
  }

  async function check() {
    if (!body) return;
    switch (body.format) {
      case 'choice': {
        const correct = checkChoice(body, answer.selected);
        const wrong = answer.selected.map((index) => body.options[index]).find((option) => option && !option.correct);
        await submit(correct, correct ? null : (wrong?.misconception ?? null));
        return;
      }
      case 'free':
        await submit(checkFree(body, answer.text), null);
        return;
      case 'order':
        await submit(checkOrder(body, answer.order), null);
        return;
      case 'line': {
        const correct = checkLine(body, answer.line, answer.reason);
        const reason = answer.reason === null ? undefined : body.reasons[answer.reason];
        const lineWrong = answer.line !== body.bugLine;
        await submit(correct, correct ? null : (reason && !reason.correct ? (reason.misconception ?? null) : null), lineWrong ? `Ошибка — в строке ${body.bugLine}.` : null);
        return;
      }
      case 'code': {
        setBusy(true);
        try {
          const reply = await sharedSandbox(runnerUrl).run({
            code: answer.code || body.starter,
            functionName: body.function,
            tests: [...body.visibleTests.map((test) => ({ args: test.args, expected: test.expected })), ...body.hiddenTests],
          });
          const passed = !reply.loadError && reply.results.length > 0 && reply.results.every((item) => item.status === 'pass');
          const failed = reply.results.filter((item) => item.status !== 'pass').length;
          setBusy(false);
          await submit(passed, null, passed ? 'Все тесты пройдены.' : reply.loadError ? 'Код не запустился: запустите его кнопкой «Запустить», чтобы увидеть ошибку.' : `Не пройдено тестов: ${failed} из ${reply.results.length}. Запустите код, чтобы увидеть, на каких данных.`);
        } catch (error) {
          setBusy(false);
          setLoadError(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      case 'self':
        return;
      case 'simulation':
        return;
    }
  }

  function retry() {
    setSeed(randomSeed());
    setAnswer(EMPTY);
    setConfidence(null);
    setHints(0);
    setOutcome(null);
    setTooEasy(false);
    setNote('');
    setNoteSaved(false);
    simulationDone.current = null;
  }

  const answered = outcome !== null;
  const titleId = `${uid}-prompt`;
  // Якорь с id задания — только у заданий шагов: в проверках то же задание
  // может стоять на странице второй раз, а id в документе должен быть один.
  const anchor = mode === 'learn' || mode === 'pre' ? question.id : undefined;
  const misconception = outcome?.misconception ? misconceptions[outcome.misconception] : undefined;
  const reportTitle = `${TYPE_TITLES[question.type] ?? 'Задание'} (${question.id.split('.q.')[1] ?? question.id})`;

  if (loadError) {
    return (
      <section class="question" id={anchor}>
        <p>Задание не загрузилось: {loadError}. Обновите страницу.</p>
      </section>
    );
  }

  return (
    <section
      class={answered ? 'question question--answered' : 'question'}
      id={anchor}
      aria-labelledby={titleId}
      data-question={question.id}
      data-seed={variant ? String(variant.seed) : undefined}
      data-state={answered ? (outcome.correct ? 'correct' : 'wrong') : 'open'}
    >
      <p class="question__meta">
        <span>{pre ? 'Предвопрос' : (TYPE_TITLES[question.type] ?? 'Задание')}</span>
        {position && (
          <span>
            вопрос {position.index} из {position.total}
          </span>
        )}
      </p>

      {!body ? (
        <p id={titleId} class="muted">
          Готовлю вариант задания…
        </p>
      ) : (
        <>
          {body.format === 'simulation' ? (
            <Prompt id={titleId} text={body.prompt} />
          ) : body.format === 'line' ? (
            <Prompt id={titleId} text={body.prompt} />
          ) : (
            <Prompt id={titleId} text={body.prompt} code={body.code} language={body.language} />
          )}

          {body.format === 'choice' && (
            <fieldset>
              <legend class="visually-hidden">Варианты ответа</legend>
              <div class="question__options">
                {variant!.order.map((index) => {
                  const option = body.options[index];
                  if (!option) return null;
                  return (
                    <label class="choice">
                      <input
                        type={body.multiple ? 'checkbox' : 'radio'}
                        name={`${uid}-answer`}
                        checked={answer.selected.includes(index)}
                        disabled={answered || busy}
                        onChange={() =>
                          setAnswer((state) => ({
                            ...state,
                            selected: body.multiple
                              ? state.selected.includes(index)
                                ? state.selected.filter((item) => item !== index)
                                : [...state.selected, index]
                              : [index],
                          }))
                        }
                      />
                      <span>
                        <RichText text={option.text} />
                      </span>
                    </label>
                  );
                })}
              </div>
              {body.multiple && <p class="muted">Верных вариантов может быть несколько.</p>}
            </fieldset>
          )}

          {body.format === 'free' && (
            <p>
              <label for={`${uid}-free`}>Ваш ответ</label>
              {body.normalize === 'output' ? (
                <textarea
                  id={`${uid}-free`}
                  rows={3}
                  value={answer.text}
                  disabled={answered || busy}
                  spellcheck={false}
                  onInput={(event) => setAnswer((state) => ({ ...state, text: event.currentTarget.value }))}
                />
              ) : (
                <input
                  id={`${uid}-free`}
                  type="text"
                  value={answer.text}
                  disabled={answered || busy}
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(event) => setAnswer((state) => ({ ...state, text: event.currentTarget.value }))}
                />
              )}
              {body.normalize === 'complexity' && (
                <span class="muted">Например: O(n^2), Θ(n log n). Заглавные O, Θ, Ω; строчные o и ω — это «о малое» и «омега малая».</span>
              )}
              {body.normalize === 'output' && <span class="muted">Каждая строка вывода — с новой строки.</span>}
            </p>
          )}

          {body.format === 'order' && (
            <OrderInput
              body={body}
              order={variant!.order}
              answer={answer.order}
              onChange={(order) => setAnswer((state) => ({ ...state, order }))}
              disabled={answered || busy}
              code={question.type === 'parsons'}
            />
          )}

          {body.format === 'line' && (
            <>
              <fieldset>
                <legend>В какой строке ошибка?</legend>
                <ol class="code-lines">
                  {body.lines.map((text, index) => (
                    <li class={answer.line === index + 1 ? 'code-lines__selected' : undefined}>
                      <label>
                        <input
                          type="radio"
                          name={`${uid}-line`}
                          checked={answer.line === index + 1}
                          disabled={answered || busy}
                          onChange={() => setAnswer((state) => ({ ...state, line: index + 1 }))}
                        />
                        <span class="code-lines__number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span>{text === '' ? ' ' : text}</span>
                      </label>
                    </li>
                  ))}
                </ol>
              </fieldset>
              <fieldset>
                <legend>Почему это ошибка?</legend>
                <div class="question__options">
                  {variant!.order.map((index) => {
                    const reason = body.reasons[index];
                    if (!reason) return null;
                    return (
                      <label class="choice">
                        <input
                          type="radio"
                          name={`${uid}-reason`}
                          checked={answer.reason === index}
                          disabled={answered || busy}
                          onChange={() => setAnswer((state) => ({ ...state, reason: index }))}
                        />
                        <span>
                          <RichText text={reason.text} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {body.format === 'code' &&
            (CodeLab ? (
              <CodeLab
                label={TYPE_TITLES[question.type] ?? 'Задание с кодом'}
                functionName={body.function}
                starterCode={body.starter}
                visibleTests={body.visibleTests}
                hiddenTests={[]}
                runnerUrl={runnerUrl}
                onCodeChange={(code) => setAnswer((state) => ({ ...state, code }))}
              />
            ) : (
              <p class="muted">Загружаю редактор кода…</p>
            ))}

          {body.format === 'self' && (
            <>
              <p>
                <label for={`${uid}-self`}>Ваше объяснение</label>
                <textarea
                  id={`${uid}-self`}
                  rows={4}
                  value={answer.text}
                  disabled={answer.selfRevealed || answered}
                  onInput={(event) => setAnswer((state) => ({ ...state, text: event.currentTarget.value }))}
                />
              </p>
              {answer.selfRevealed && (
                <div class="question__reference">
                  <p class="question__verdict">Эталонное объяснение</p>
                  <p>
                    <RichText text={body.reference} />
                  </p>
                  <p>Сверьте своё объяснение по критериям:</p>
                  <ul>
                    {body.criteria.map((criterion) => (
                      <li>
                        <RichText text={criterion} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {body.format === 'simulation' && !answered && (
            <ArraySimulation
              algorithm={body.algorithm as ArrayAlgorithmId}
              input={body.input}
              ownData={false}
              onFinish={(stats) => {
                simulationDone.current = stats;
                void submit(stats.errors === 0 && stats.shown === 0, null, `Верных шагов с первой попытки — ${stats.firstTry} из ${stats.steps}, ошибок — ${stats.errors}, показанных шагов — ${stats.shown}.`, stats.shown > 0, 'know');
              }}
            />
          )}

          {!answered && allowHints && question.hints.length > 0 && (
            <div class="question__hints">
              <button type="button" class="button" disabled={hints >= question.hints.length || busy} onClick={() => setHints((value) => value + 1)}>
                {hints === 0 ? 'Подсказка' : 'Следующая подсказка'} ({hints} из {question.hints.length})
              </button>
              {hints > 0 && (
                <>
                  <ol>
                    {question.hints.slice(0, hints).map((hint) => (
                      <li>
                        <RichText text={hint} />
                      </li>
                    ))}
                  </ol>
                  {!pre && <p class="muted">С подсказкой оценка для повторения — не выше «трудно».</p>}
                </>
              )}
            </div>
          )}

          {!answered && body.format !== 'simulation' && (
            <>
              {needsConfidence && (
                <fieldset class="question__confidence">
                  <legend>Насколько вы уверены?</legend>
                  {CONFIDENCE.map((item) => (
                    <label class="choice">
                      <input
                        type="radio"
                        name={`${uid}-confidence`}
                        checked={confidence === item.value}
                        disabled={busy}
                        onChange={() => setConfidence(item.value)}
                      />
                      {item.label}
                    </label>
                  ))}
                </fieldset>
              )}
              <div class="question__actions">
                {body.format === 'self' ? (
                  !answer.selfRevealed ? (
                    <button
                      type="button"
                      class="button button--primary"
                      disabled={answer.text.trim() === '' || (needsConfidence && confidence === null)}
                      onClick={() => setAnswer((state) => ({ ...state, selfRevealed: true }))}
                    >
                      Сравнить с эталоном
                    </button>
                  ) : (
                    <>
                      <button type="button" class="button button--primary" disabled={busy} onClick={() => void submit(true, null)}>
                        Моё объяснение верное
                      </button>
                      <button type="button" class="button" disabled={busy} onClick={() => void submit(false, null)}>
                        В нём есть ошибки или пропуски
                      </button>
                    </>
                  )
                ) : (
                  <button type="button" class="button button--primary" disabled={!ready || busy || (needsConfidence && confidence === null)} onClick={() => void check()}>
                    {busy ? 'Проверяю…' : body.format === 'code' ? 'Сдать решение' : 'Проверить'}
                  </button>
                )}
              </div>
            </>
          )}

          {outcome && (
            <div class="question__feedback" role="status" tabIndex={-1} ref={feedbackRef}>
              {outcome.correct ? (
                <>
                  <p class="question__verdict">Верно.</p>
                  {!pre && confidence === 'guess' && <p>Правильная догадка ещё не доказывает знание: задание скоро вернётся в повторении.</p>}
                </>
              ) : (
                <>
                  <p class="question__verdict">Неверно. Вот почему.</p>
                  {outcome.correctText && body.format !== 'order' && (
                    <p>
                      Правильный ответ: <RichText text={outcome.correctText} />
                    </p>
                  )}
                  {outcome.correctText && body.format === 'order' && (
                    <>
                      <p>Правильный порядок:</p>
                      <CodeBlock code={outcome.correctText} language={question.type === 'parsons' ? 'js' : 'text'} />
                    </>
                  )}
                  {misconception && (
                    <p>
                      <strong>{misconception.text}</strong> {misconception.explanation}
                    </p>
                  )}
                  {misconception?.blockPath && (
                    <p>
                      <a href={`${base}${misconception.blockPath}`}>Где это объясняется</a>
                    </p>
                  )}
                  {pre && <p class="muted">Ошибаться здесь нормально: предвопрос ни на что не влияет, он показывает, на что обратить внимание.</p>}
                  {outcome.result?.confidentError && (
                    <p>Это уверенная ошибка: навык вернётся в повторении в этой же сессии, затем не позже чем через день и через неделю.</p>
                  )}
                </>
              )}
              {outcome.details && <p>{outcome.details}</p>}
              {question.explanation && (pre || !outcome.correct || confidence !== 'know') && (
                <p>
                  <RichText text={question.explanation} />
                </p>
              )}
              {outcome.correct && !pre && outcome.result?.reviewId && confidence && canBeTooEasy({ correct: true, confidence, usedHint: hints > 0 }) && (
                <p>
                  {tooEasy ? (
                    'Отмечено: слишком легко — навык вернётся позже.'
                  ) : (
                    <button
                      type="button"
                      class="button"
                      onClick={() => {
                        const reviewId = outcome.result?.reviewId;
                        if (!reviewId) return;
                        void markTooEasy(topic, level, reviewId).then(() => setTooEasy(true));
                      }}
                    >
                      Слишком легко
                    </button>
                  )}
                </p>
              )}
              {!outcome.correct && outcome.result?.errorId && (
                <div class="question__note">
                  <label for={`${uid}-note`}>Почему я ошибся — по желанию, для журнала ошибок</label>
                  <textarea id={`${uid}-note`} rows={2} value={note} onInput={(event) => setNote(event.currentTarget.value)} />
                  <div class="question__actions">
                    <button
                      type="button"
                      class="button"
                      disabled={note.trim() === '' || noteSaved}
                      onClick={() => {
                        const errorId = outcome.result?.errorId;
                        if (errorId) void saveErrorNote(errorId, note.trim()).then(() => setNoteSaved(true));
                      }}
                    >
                      {noteSaved ? 'Заметка сохранена' : 'Сохранить заметку'}
                    </button>
                  </div>
                </div>
              )}
              {allowRetry && !outcome.correct && (
                <div class="question__actions">
                  <button type="button" class="button button--primary" onClick={retry}>
                    {question.format === 'generated' ? 'Похожий вариант с другими данными' : 'Ответить ещё раз'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div class="question__footer">
        <button
          type="button"
          class="report-button"
          data-report
          data-report-topic={topic.topicId}
          data-report-topic-title={topic.title}
          data-report-target={question.id}
          data-report-target-title={reportTitle}
          data-report-version={String(question.version)}
          data-report-seed={variant ? String(variant.seed) : undefined}
          aria-haspopup="dialog"
        >
          Нашёл ошибку<span class="visually-hidden">: {reportTitle}</span>
        </button>
      </div>
    </section>
  );
}
