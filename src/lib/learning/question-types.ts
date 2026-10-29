/**
 * Задания в том виде, в каком их получает браузер: всё, что можно вычислить,
 * уже вычислено при сборке (ответы «Что выведет код», ожидаемые результаты
 * тестов, код испорченной версии для «Найти ошибку»). Задания генераторов
 * получают вариант в браузере по зерну.
 */
import type { CodeLabVisibleTest } from '../../components/code/CodeLab.tsx';
import type { SandboxTest } from '../sandbox/client.ts';

export type Level = 'fundament' | 'base' | 'depth';
export const LEVELS: readonly Level[] = ['fundament', 'base', 'depth'];
export type Role = 'pre' | 'practice' | 'check';
export type CodeLanguage = 'js' | 'cpp' | 'py' | 'text';

export interface PreparedOption {
  text: string;
  correct: boolean;
  misconception?: string;
}

interface PreparedBase {
  id: string;
  version: number;
  level: Level;
  role: Role;
  /** Шаг цикла: 0–6; у итоговой проверки — null. */
  step: number | null;
  block: string | null;
  skill: string | null;
  /** Тип задания из 17 типов тренажёра. */
  type: string;
  hints: string[];
  explanation: string | null;
}

interface PromptPart {
  prompt: string;
  code: string | null;
  language: CodeLanguage;
}

export type ChoiceBody = PromptPart & { format: 'choice'; multiple: boolean; options: PreparedOption[] };
export type FreeBody = PromptPart & {
  format: 'free';
  answers: string[];
  normalize: 'text' | 'number' | 'complexity' | 'output' | 'list';
  typos: boolean;
};
export type OrderBody = PromptPart & {
  format: 'order';
  items: { text: string; indent: number }[];
  distractors: string[];
  indent: boolean;
  alternatives: number[][];
};
export type CodeBody = PromptPart & {
  format: 'code';
  function: string;
  starter: string;
  visibleTests: CodeLabVisibleTest[];
  hiddenTests: SandboxTest[];
};
export type LineBody = { format: 'line'; prompt: string; lines: string[]; bugLine: number; reasons: PreparedOption[] };
export type SelfBody = PromptPart & { format: 'self'; reference: string; criteria: string[] };
export type SimulationBody = { format: 'simulation'; prompt: string; algorithm: string; input: number[] };
export type GeneratedBody = { format: 'generated'; generator: string };

/** Вариант задания, который можно показать: у генератора он получается по зерну. */
export type VariantBody = ChoiceBody | FreeBody | OrderBody | CodeBody | LineBody | SelfBody | SimulationBody;

export type PreparedQuestion = PreparedBase & (VariantBody | GeneratedBody);

export interface PreparedMisconception {
  text: string;
  explanation: string;
  /** Адрес блока, где это объясняется, без base. */
  blockPath: string | null;
  prerequisite: string | null;
}

/** Краткие сведения о задании: для прогресса уровня, без условия и ответов. */
export type LightQuestion = Pick<PreparedQuestion, 'id' | 'version' | 'level' | 'role' | 'step' | 'skill' | 'format' | 'type'>;

/** Что о теме нужно заданиям и прогрессу в браузере. */
export interface TopicContext {
  topicId: string;
  title: string;
  /** Папка темы относительно content/ru: по ней браузер находит генераторы. */
  dir: string;
  kind: string;
  /** Адреса уровней без base. */
  levelPaths: Partial<Record<Level, string>>;
  skills: { id: string; version: number; title: string; level: Level }[];
  misconceptions: Record<string, PreparedMisconception>;
  /** Шаги каждого уровня, которые нужно пройти. */
  steps: Partial<Record<Level, number[]>>;
  /** Все задания темы кратко. */
  questions: LightQuestion[];
  /** Похожие темы: в повторении их карточки ставятся рядом. */
  confusableWith: string[];
}

/** Всё о заданиях темы, что нужно браузеру: условия и ответы целиком. */
export interface PreparedTopic extends TopicContext {
  questions: PreparedQuestion[];
}

/** Тема без условий и ответов — для островов страницы, чтобы не повторять задания в каждом. */
export function topicContext(topic: PreparedTopic, level?: Level): TopicContext {
  const own = <T extends { level: Level }>(items: readonly T[]): T[] => (level ? items.filter((item) => item.level === level) : [...items]);
  return {
    ...topic,
    skills: own(topic.skills),
    steps: level ? { [level]: topic.steps[level] ?? [] } : topic.steps,
    questions: own(topic.questions).map(({ id, version, level: questionLevel, role, step, skill, format, type }) => ({
      id,
      version,
      level: questionLevel,
      role,
      step,
      skill,
      format,
      type,
    })),
  };
}

/** Что возвращает генератор задания: вариант в одном из форматов и параметры для воспроизведения. */
export type GeneratedVariant = VariantBody & { data?: Record<string, unknown> };
