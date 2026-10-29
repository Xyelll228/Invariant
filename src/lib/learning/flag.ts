/**
 * Отметка «в этом браузере есть прогресс» в localStorage. Её читает маленький
 * встроенный скрипт до отрисовки страницы, чтобы главная сразу оставила место
 * под карточку «Продолжить». Сам прогресс — только в IndexedDB; если
 * localStorage недоступен, карточка просто появится позже.
 */
export function progressFlagKey(databaseName: string): string {
  return `invariant:progress:${databaseName}`;
}

export function setProgressFlag(databaseName: string): void {
  try {
    localStorage.setItem(progressFlagKey(databaseName), '1');
  } catch {
    // Хранилище недоступно (приватный режим) — не страшно.
  }
}

/** Прогресс удалён (сброс в настройках): «Продолжить» на главной больше не нужно. */
export function clearProgressFlag(databaseName: string): void {
  try {
    localStorage.removeItem(progressFlagKey(databaseName));
  } catch {
    // Хранилище недоступно — не страшно.
  }
}
