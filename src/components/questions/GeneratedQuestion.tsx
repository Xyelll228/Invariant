/**
 * Задание генератора с выбором ответа: условие и варианты вычисляет эталон,
 * у каждого неверного варианта — своё заблуждение и разбор. Перед проверкой
 * человек отмечает уверенность: знаю, сомневаюсь или наугад.
 */
import { useId, useMemo, useState } from 'preact/hooks';
import { createRandom } from '../../lib/random.ts';
import { choiceGenerators, type ChoiceGeneratorId } from '../../lib/questions/generators.ts';
import '../viz/viz.css';

export interface Misconception {
  text: string;
  explanation: string;
}

export interface GeneratedQuestionProps {
  question: ChoiceGeneratorId;
  misconceptions: Record<string, Misconception>;
  seed: number;
}

type Confidence = 'know' | 'unsure' | 'guess';

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: 'know', label: 'знаю' },
  { value: 'unsure', label: 'сомневаюсь' },
  { value: 'guess', label: 'наугад' },
];

export default function GeneratedQuestion({ question, misconceptions, seed: initialSeed }: GeneratedQuestionProps) {
  const [seed, setSeed] = useState(initialSeed);
  const variant = useMemo(() => choiceGenerators[question](createRandom(seed)), [question, seed]);
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [checked, setChecked] = useState(false);
  const name = useId();

  const chosen = choice === null ? undefined : variant.options[choice];
  const correctOption = variant.options.find((option) => option.correct);
  const misconception = chosen?.misconception ? misconceptions[chosen.misconception] : undefined;

  const next = () => {
    setSeed((value) => value + 1);
    setChoice(null);
    setConfidence(null);
    setChecked(false);
  };

  return (
    <section class="viz" aria-label="Задание">
      <p class="viz__position">Вариант № {seed}</p>
      <fieldset>
        <legend>{variant.prompt}</legend>
        {variant.options.map((option, index) => (
          <label class="choice">
            <input
              type="radio"
              name={`${name}-answer`}
              checked={choice === index}
              disabled={checked}
              onChange={() => setChoice(index)}
            />
            <code>{option.text}</code>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Насколько вы уверены?</legend>
        {CONFIDENCE.map((item) => (
          <label class="choice">
            <input
              type="radio"
              name={`${name}-confidence`}
              checked={confidence === item.value}
              disabled={checked}
              onChange={() => setConfidence(item.value)}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      {!checked ? (
        <div class="button-row">
          <button
            type="button"
            class="button button--primary"
            disabled={choice === null || confidence === null}
            onClick={() => setChecked(true)}
          >
            Проверить
          </button>
        </div>
      ) : (
        <>
          <div class="viz-feedback" role="status">
            {chosen?.correct ? (
              <>
                <p>
                  <strong>Верно.</strong>
                </p>
                {confidence === 'guess' && <p>Правильная догадка ещё не доказывает знание: в повторении это задание вернётся скоро.</p>}
              </>
            ) : (
              <>
                <p>
                  <strong>Неверно.</strong> Правильный ответ: <code>{correctOption?.text}</code>.
                </p>
                {misconception && (
                  <p>
                    <strong>{misconception.text}</strong> {misconception.explanation}
                  </p>
                )}
                {confidence === 'know' && (
                  <p>Это уверенная ошибка: такое задание вернётся в этой же сессии, затем не позже чем через день и через неделю.</p>
                )}
              </>
            )}
          </div>
          <div class="button-row">
            <button type="button" class="button button--primary" onClick={next}>
              Другой вариант
            </button>
          </div>
        </>
      )}
    </section>
  );
}
