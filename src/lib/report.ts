/**
 * «Нашёл ошибку» (ТЗ, «Справочник»): форма задачи на GitHub с уже
 * заполненными полями и текстовый отчёт для тех, у кого нет аккаунта GitHub.
 *
 * Поля формы заполняются параметрами ссылки по id полей шаблона
 * .github/ISSUE_TEMPLATE/content-error.yml. Метку ставит сам шаблон: параметр
 * labels срабатывает только у тех, кто имеет право ставить метки.
 */

export interface ReportContext {
  /** Тема: id и название. */
  topicId?: string;
  topicTitle?: string;
  /** Блок или вопрос, в котором ошибка. */
  targetId?: string;
  targetTitle?: string;
  /** Версия блока или вопроса. */
  version?: number | string;
  /** Зерно варианта задания генератора: по нему вариант восстанавливается точно. */
  seed?: number;
  /** Выделенный текст. */
  quote?: string;
  /** Адрес страницы. */
  page?: string;
}

export const ISSUE_TEMPLATE = 'content-error.yml';

/** Длинная ссылка вернёт ошибку 414, поэтому длинные поля обрезаются. */
const MAX_QUOTE = 500;
const MAX_DESCRIPTION = 2000;

function clip(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function where(context: ReportContext): string {
  const parts = [context.topicTitle, context.targetTitle].filter(Boolean).join(' — ');
  const ids = [context.targetId ?? context.topicId].filter(Boolean).join('');
  return [parts, ids && `(${ids})`].filter(Boolean).join(' ');
}

export function issueTitle(context: ReportContext): string {
  const target = [context.topicTitle, context.targetTitle].filter(Boolean).join(': ');
  return target ? `Ошибка: ${target}` : 'Ошибка в контенте';
}

/** Ссылка на новую задачу с заполненной формой. */
export function issueUrl(repositoryUrl: string, context: ReportContext, description = ''): string {
  const params = new URLSearchParams({ template: ISSUE_TEMPLATE, title: issueTitle(context) });
  const location = where(context);
  if (location) params.set('where', location);
  if (context.version !== undefined) params.set('version', String(context.version));
  if (context.seed !== undefined) params.set('seed', String(context.seed));
  if (context.quote) params.set('quote', clip(context.quote, MAX_QUOTE));
  if (context.page) params.set('page', context.page);
  if (description.trim()) params.set('description', clip(description, MAX_DESCRIPTION));
  return `${repositoryUrl}/issues/new?${params.toString()}`;
}

/** Текст отчёта для копирования: те же поля, что в форме. */
export function reportText(context: ReportContext, description = ''): string {
  const lines = ['Ошибка в «Инварианте»'];
  const location = where(context);
  if (location) lines.push(`Где: ${location}`);
  if (context.version !== undefined) lines.push(`Версия: ${context.version}`);
  if (context.seed !== undefined) lines.push(`Вариант задания: ${context.seed}`);
  if (context.page) lines.push(`Страница: ${context.page}`);
  if (context.quote) lines.push(`Текст: «${clip(context.quote, MAX_QUOTE)}»`);
  lines.push(`Что не так: ${description.trim() || '—'}`);
  return lines.join('\n');
}
