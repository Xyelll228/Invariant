/**
 * Подсказка для iPhone и iPad (ТЗ, «Путь ученика», первый день): добавить
 * приложение на экран «Домой» и зачем. На других устройствах ничего не показывает.
 */
import { useEffect, useState } from 'preact/hooks';
import { detectPlatform, IOS_INSTALL_TEXT, isStandalone } from '../../lib/offline/install.ts';

const DISMISSED_KEY = 'invariant:install-hint-dismissed';

export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) !== null;
    } catch {
      // Хранилище недоступно — подсказка будет появляться каждый раз; это не страшно.
    }
    setShow(!dismissed && detectPlatform() === 'ios' && !isStandalone());
  }, []);

  if (!show) return null;
  return (
    <aside class="note install-hint" aria-labelledby="install-hint-title">
      <strong class="note__title" id="install-hint-title">
        Добавьте приложение на экран «Домой»
      </strong>
      <p>{IOS_INSTALL_TEXT}</p>
      <p>
        <button
          type="button"
          class="button"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, String(Date.now()));
            } catch {
              // Не запомнилось — подсказка вернётся при следующем открытии.
            }
            setShow(false);
          }}
        >
          Понятно
        </button>
      </p>
    </aside>
  );
}
