/**
 * Записи в IndexedDB (ТЗ, «Данные в браузере»). Время везде — миллисекунды
 * с 1970 года (Date.now()): так записи без потерь переходят в файл копии.
 */
import type { Grade, State } from 'ts-fsrs';

export type Level = 'fundament' | 'base' | 'depth';

/** Уверенность в ответе: знаю, сомневаюсь, наугад. */
export type Confidence = 'know' | 'unsure' | 'guess';

/** Состояние карточки в FSRS; имена полей — как в ts-fsrs. */
export interface FsrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: number | null;
}

/** Карточка — навык, а не вопрос: при каждом повторении генератор даёт новый вариант. */
export interface CardRecord {
  /** id навыка из questions.yaml или id своей карточки. */
  cardId: string;
  topicId: string;
  source: 'content' | 'user';
  createdAt: number;
  /** Когда на карточку ответили впервые: по этому времени считается лимит новых. */
  introducedAt: number | null;
  /**
   * Правило «уверенной ошибки»: сколько следующих успешных ответов ещё
   * ограничивают интервал (2 — не дольше дня, 1 — не дольше недели).
   */
  followUps: number;
  fsrs: FsrsState;
  /** Версия навыка в контенте. */
  contentVersion: number | null;
  /**
   * Когда в контенте изменился смысл или ответ. Если это случилось после
   * последнего ответа, карточка помечается «изменено» и ставится на ближайшее повторение.
   */
  changedAt: number | null;
}

export interface ReviewRecord {
  /** Случайный id: по нему ответы двух устройств объединяются без повторов. */
  id: string;
  cardId: string;
  at: number;
  correct: boolean;
  confidence: Confidence;
  usedHint: boolean;
  tooEasy: boolean;
  /** Оценка FSRS, поставленная по правилам в момент ответа. */
  rating: Grade;
  /** Состояние карточки перед ответом: по нему считается лимит повторений. */
  stateBefore: State;
  /** Зерно варианта: сообщение об ошибке воспроизводит задание точно. */
  seed: number | null;
  contentVersion: number | null;
  misconception: string | null;
  /**
   * Где дан ответ: learn — по ходу темы, check — итоговая проверка уровня,
   * delayed — отложенная проверка, review — повторение, exam — «Контрольная».
   */
  mode: ReviewMode;
}

export type ReviewMode = 'learn' | 'check' | 'delayed' | 'review' | 'exam';

export type ProgressStatus = 'not-started' | 'in-progress' | 'mastered';

export interface LevelCheckRecord {
  at: number;
  correct: number;
  total: number;
  passed: boolean;
}

export interface ProgressRecord {
  topicId: string;
  level: Level;
  status: ProgressStatus;
  /** Пройденные шаги цикла: «0» — предвопросы, «1»–«6». */
  completedSteps: string[];
  paused: boolean;
  updatedAt: number;
  /** Задания уровня, на которые уже есть верный ответ (на предвопросы — любой). */
  done?: string[];
  /** Последняя итоговая проверка уровня (лучшая: пройденная не затирается непройденной). */
  check?: LevelCheckRecord;
  /** Отложенная проверка. */
  delayed?: LevelCheckRecord;
  /** Задание, на котором человек остановился: туда ведёт «Продолжить». */
  lastQuestion?: string;
}

export interface AttemptRecord {
  id: string;
  exerciseId: string;
  language: 'js' | 'cpp' | 'py' | 'sql';
  at: number;
  code: string;
  passed: number;
  total: number;
}

export interface ErrorRecord {
  id: string;
  cardId: string;
  misconception: string | null;
  at: number;
  note: string;
  resolved: boolean;
  updatedAt: number;
}

export interface NoteRecord {
  id: string;
  topicId: string;
  blockId: string;
  text: string;
  updatedAt: number;
}

export interface UserCardRecord {
  id: string;
  question: string;
  answer: string;
  blockId: string | null;
  updatedAt: number;
}

export interface AiChatRecord {
  id: string;
  topicId: string | null;
  messages: { role: 'user' | 'assistant'; text: string; at: number }[];
  tokens: { input: number; output: number };
  updatedAt: number;
}

/** Ключ API. Хранится, только если человек выбрал «запомнить», и не попадает в копию. */
export interface SecretRecord {
  provider: string;
  key: string;
  savedAt: number;
}

export interface ExamRecord {
  id: string;
  at: number;
  params: { topics: string[]; level: Level; count: number; minutes: number };
  tasks: { cardId: string; seed: number }[];
  answers: { cardId: string; seed: number; correct: boolean | null; confidence: Confidence | null }[];
  durationMs: number;
  results: Record<string, { correct: number; total: number }>;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}
