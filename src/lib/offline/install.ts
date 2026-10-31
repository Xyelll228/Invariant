/**
 * Установка на экран «Домой» (ТЗ, «Путь ученика» и «Сохранность данных»):
 * на iPhone Safari удаляет данные сайта, если семь дней пользоваться Safari и
 * не заходить на сайт, а у приложения на экране «Домой» свой счётчик.
 */

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function detectPlatform(): 'ios' | 'other' {
  const ua = navigator.userAgent;
  // iPad с iPadOS 13+ представляется Mac с сенсорным экраном.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'other';
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const IOS_INSTALL_TEXT =
  'В Safari нажмите «Поделиться», затем «На экран „Домой“». Это важно: Safari удаляет данные сайта, если семь дней пользоваться Safari и не заходить на сайт, а у приложения на экране «Домой» свой счётчик — прогресс сохранится.';
