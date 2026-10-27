/**
 * Общие сведения о сборке: основная версия или превью правки,
 * адреса страниц с учётом base и имя базы данных в браузере.
 */

export function parsePreviewPr(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`PUBLIC_PREVIEW_PR должен быть номером правки, получено: ${value}`);
  }
  return Number(value.trim());
}

/** Номер правки для превью или null для основной версии. */
export const previewPr = parsePreviewPr(import.meta.env.PUBLIC_PREVIEW_PR);

/**
 * Показывать ли черновики тем. На основном сайте черновик не публикуется
 * (ТЗ, «Качество»), а в превью правки, при разработке и в сборке для
 * автопроверок (PUBLIC_SHOW_DRAFTS=1) — показывается с пометкой «черновик».
 */
export const showDrafts = previewPr !== null || import.meta.env.PUBLIC_SHOW_DRAFTS === '1' || import.meta.env.DEV === true;

/** Дата сборки ГГГГ-ММ-ДД: отметка «проверено автоматически» у кода на C++ и Python. */
export const buildDate = import.meta.env.PUBLIC_BUILD_DATE || new Date().toISOString().slice(0, 10);

/** Репозиторий проекта на GitHub. */
export const repository = import.meta.env.PUBLIC_REPOSITORY || 'Xyelll228/Invariant';
export const repositoryUrl = `https://github.com/${repository}`;

/**
 * Имя базы IndexedDB. Все сайты GitHub Pages одного аккаунта — один
 * источник, поэтому у каждого превью своя база, чтобы не трогать прогресс.
 */
export function databaseNameFor(pr: number | null): string {
  return pr === null ? 'invariant' : `invariant-pr-${pr}`;
}
export const databaseName = databaseNameFor(previewPr);

/** Склеивает base и путь без двойных и потерянных косых черт. */
export function joinBase(base: string, path: string): string {
  const left = base.endsWith('/') ? base : `${base}/`;
  const right = path.replace(/^\/+/, '');
  return `${left}${right}`;
}

/** Адрес страницы: url('ru/about/') → /Invariant/ru/about/ */
export function url(path = ''): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
