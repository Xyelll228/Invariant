/**
 * Текст условия: `код` в обратных кавычках выделяется, фрагмент кода — под
 * условием. Текст выводится как текст, без HTML: условия пишутся в YAML.
 */
import type { ComponentChildren } from 'preact';
import type { CodeLanguage } from '../../lib/learning/question-types.ts';

/** Разбивает строку на текст и `код`. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}
    </>
  );
}

const LANGUAGE_TITLES: Record<CodeLanguage, string> = { js: 'JavaScript', cpp: 'C++', py: 'Python', text: 'Текст' };

export function CodeBlock({ code, language }: { code: string; language: CodeLanguage }) {
  return (
    <pre class="question__code" tabIndex={0} aria-label={`Код на ${LANGUAGE_TITLES[language]}`}>
      <code>{code}</code>
    </pre>
  );
}

export function Prompt({ id, text, code, language, children }: { id: string; text: string; code?: string | null; language?: CodeLanguage; children?: ComponentChildren }) {
  return (
    <>
      <p class="question__prompt" id={id}>
        <RichText text={text} />
      </p>
      {code && <CodeBlock code={code} language={language ?? 'js'} />}
      {children}
    </>
  );
}
