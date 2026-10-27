/**
 * Прототип работы без сети и установки на телефон: состояние Service Worker,
 * что лежит в кеше, есть ли сеть, как поставить приложение на экран «Домой».
 */
import { useEffect, useState } from 'preact/hooks';
import './offline.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type WorkerState = 'checking' | 'unsupported' | 'installing' | 'ready' | 'not-controlling' | 'error';

const WORKER_TEXT: Record<WorkerState, string> = {
  checking: 'проверяю…',
  unsupported: 'браузер не поддерживает Service Worker: без сети сайт не откроется.',
  installing: 'сохраняю сайт на устройство…',
  ready: 'сайт сохранён на устройстве и откроется без интернета.',
  'not-controlling': 'сайт сохранён; без интернета он откроется после перезагрузки этой страницы.',
  error: 'Service Worker не запустился: без сети сайт не откроется.',
};

function detectPlatform(): 'ios' | 'other' {
  const ua = navigator.userAgent;
  // iPad с iPadOS 13+ представляется Mac с сенсорным экраном.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'other';
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function OfflineStatus({ base }: { base: string }) {
  const [worker, setWorker] = useState<WorkerState>('checking');
  const [cached, setCached] = useState<{ files: number; bytes: number | null } | null>(null);
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'other'>('other');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    let alive = true;
    (async () => {
      if (!('serviceWorker' in navigator)) {
        setWorker('unsupported');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration(base);
        if (!registration) {
          if (alive) setWorker('installing');
        }
        await navigator.serviceWorker.ready;
        if (!alive) return;
        setWorker(navigator.serviceWorker.controller ? 'ready' : 'not-controlling');
        // Сколько файлов сохранено: кеш предзагрузки Workbox (его имя начинается с cacheId).
        const names = typeof caches === 'undefined' ? [] : (await caches.keys()).filter((name) => name.includes('precache'));
        let files = 0;
        let bytes: number | null = 0;
        for (const name of names) {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          files += requests.length;
        }
        if (navigator.storage?.estimate) bytes = (await navigator.storage.estimate()).usage ?? null;
        else bytes = null;
        if (alive) setCached({ files, bytes });
      } catch {
        if (alive) setWorker('error');
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [base]);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  }

  async function checkUpdate() {
    setUpdateMessage('Проверяю…');
    try {
      const registration = await navigator.serviceWorker.getRegistration(base);
      await registration?.update();
      const waiting = registration?.waiting ?? registration?.installing;
      setUpdateMessage(waiting ? 'Новая версия скачивается или уже ждёт: вверху страницы появится кнопка «Обновить сейчас».' : 'У вас последняя версия.');
    } catch {
      setUpdateMessage('Не получилось проверить: нет сети или сайт недоступен.');
    }
  }

  return (
    <section class="viz" aria-labelledby="offline-status">
      <h2 id="offline-status" class="offline__title">
        Состояние на этом устройстве
      </h2>
      <dl class="offline__facts">
        <dt>Сеть</dt>
        <dd>{online ? 'есть' : 'нет — работаете без интернета'}</dd>
        <dt>Работа без сети</dt>
        <dd>{WORKER_TEXT[worker]}</dd>
        <dt>Сохранено</dt>
        <dd>
          {cached === null
            ? '—'
            : `${cached.files} файлов${cached.bytes === null ? '' : `, всего данных сайта на устройстве — ${(cached.bytes / 1024 / 1024).toFixed(1)} МБ`}`}
        </dd>
        <dt>Установка</dt>
        <dd>{installed ? 'приложение установлено на это устройство.' : 'не установлено.'}</dd>
      </dl>

      {!installed && installEvent && (
        <div class="button-row">
          <button type="button" class="button button--primary" onClick={install}>
            Установить приложение
          </button>
        </div>
      )}
      {!installed && platform === 'ios' && (
        <div class="note">
          <strong class="note__title">Как поставить на iPhone и iPad</strong>
          <p>
            В Safari нажмите «Поделиться», затем «На экран „Домой“». Это важно: Safari удаляет данные сайта, если семь дней
            пользоваться Safari и не заходить на сайт, а у приложения на экране «Домой» свой счётчик — прогресс сохранится.
          </p>
        </div>
      )}
      {!installed && platform === 'other' && !installEvent && (
        <p class="muted">
          Если браузер не предлагает установку сам, откройте его меню и выберите «Установить приложение» или «Добавить на
          главный экран».
        </p>
      )}

      <div class="button-row">
        <button type="button" class="button" onClick={checkUpdate} disabled={worker === 'unsupported'}>
          Проверить обновление
        </button>
      </div>
      {updateMessage && (
        <p class="muted" role="status">
          {updateMessage}
        </p>
      )}
    </section>
  );
}
