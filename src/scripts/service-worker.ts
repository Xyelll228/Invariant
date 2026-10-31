/**
 * Работа без сети (ТЗ, «Сохранность данных» и «Нестандартные ситуации»).
 * Service Worker кладёт сайт в кеш при первом посещении. Новая версия
 * скачивается в фоне и включается при следующем открытии или по кнопке
 * «Обновить»: страница сама не перезагружается, незаконченный ответ не теряется.
 *
 * Область работы — base: у основного сайта /Invariant/, у превью — своя папка
 * /Invariant/pr-preview/pr-N/ со своим Service Worker и своим кешем.
 */

const base = import.meta.env.BASE_URL;

function showUpdateBanner(registration: ServiceWorkerRegistration): void {
  const banner = document.querySelector<HTMLElement>('[data-update-banner]');
  const button = banner?.querySelector<HTMLButtonElement>('[data-update-apply]');
  if (!banner || !button || !banner.hidden) return;
  banner.hidden = false;
  button.addEventListener(
    'click',
    () => {
      const waiting = registration.waiting;
      if (!waiting) return;
      button.disabled = true;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    { once: true },
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  // Новая версия скачалась в прошлый визит и ждёт: предлагаем обновиться.
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(registration);
    });
  });
  return registration;
}

/** Скачанные заранее разделы — снова на устройство, если новая версия очистила кеш страниц. */
function refreshDownloadedSections(): void {
  try {
    if (!localStorage.getItem('invariant:downloaded-sections')) return;
  } catch {
    return;
  }
  const run = () => {
    import('../lib/offline/download.ts')
      .then(({ refreshDownloaded }) => refreshDownloaded(base))
      .catch(() => {
        // Не вышло — раздел можно скачать снова вручную на его странице.
      });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 10_000 });
  else setTimeout(run, 3000);
}

// В режиме разработки Service Worker мешал бы видеть правки сразу.
if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    registerServiceWorker()
      .then(() => refreshDownloadedSections())
      .catch(() => {
        // Без Service Worker сайт работает как обычно, только без офлайна.
      });
  });
}
