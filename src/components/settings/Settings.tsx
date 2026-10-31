/**
 * Настройки (ТЗ, экран «Настройки»): тема и размер текста, лимиты и начало
 * учебного дня, уровень запоминания и порог «освоено», копия в файл,
 * постоянное хранилище и сброс. Значения по умолчанию — из ТЗ; меняет их
 * только сам человек на своём устройстве.
 */
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { backupFileName, createBackup, describeBackup, parseBackup, serializeBackup, type Backup } from '../../lib/learning/backup.ts';
import { getSetting, readAll, setSetting, writeAll } from '../../lib/learning/db.ts';
import { clearProgressFlag, setProgressFlag } from '../../lib/learning/flag.ts';
import { formatFullMoment } from '../../lib/learning/format.ts';
import { emptyData, mergeData } from '../../lib/learning/merge.ts';
import { PERSISTENCE_TEXT, persistenceStatus, requestPersistence, type PersistenceStatus } from '../../lib/learning/persistence.ts';
import { createScheduler, MAX_RETENTION, MIN_RETENTION } from '../../lib/learning/scheduler.ts';
import { DEFAULT_SETTINGS, loadSettings, SETTING_KEYS, type LearningSettings } from '../../lib/learning/settings.ts';
import { getDb } from '../../lib/learning/store.ts';
import { detectPlatform, IOS_INSTALL_TEXT, isStandalone, type InstallPromptEvent } from '../../lib/offline/install.ts';
import { databaseName } from '../../lib/site.ts';
import { applyTheme, readTheme, saveTheme, type ThemeChoice } from '../../scripts/theme.ts';
import { readTextSize, setTextSize, TEXT_SIZES, type TextSize } from '../../scripts/text-size.ts';
import '../review/review.css';

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

/** Поля обучения: как показывать и проверять значение. */
interface FieldSpec {
  key: keyof LearningSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  /** Значение в поле → значение настройки. */
  parse: (text: string) => number | null;
  show: (value: number) => string;
}

function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

const integer = (text: string) => {
  const value = parseNumber(text);
  return value !== null && Number.isInteger(value) ? value : null;
};

const FIELDS: FieldSpec[] = [
  {
    key: 'newPerDay',
    label: 'Новых навыков за учебный день',
    hint: `Сколько новых навыков повторение добавляет за день. По умолчанию — ${DEFAULT_SETTINGS.newPerDay}.`,
    min: 1,
    max: 100,
    parse: integer,
    show: String,
  },
  {
    key: 'reviewsPerDay',
    label: 'Повторений за учебный день',
    hint: `Остальные подождут следующего дня: первыми идут самые забытые. По умолчанию — ${DEFAULT_SETTINGS.reviewsPerDay}.`,
    min: 10,
    max: 1000,
    parse: integer,
    show: String,
  },
  {
    key: 'dayStartHour',
    label: 'Начало учебного дня, час',
    hint: `Занятие после полуночи, но до этого часа относится к прошедшему дню. По умолчанию — ${DEFAULT_SETTINGS.dayStartHour}, то есть 4:00.`,
    min: 0,
    max: 12,
    parse: integer,
    show: String,
  },
  {
    key: 'retention',
    label: 'Уровень запоминания',
    hint: `Какую долю навыков вы хотите вспоминать к сроку повторения: от 0,80 до 0,95. Чем выше, тем больше повторений в день. По умолчанию — ${DEFAULT_SETTINGS.retention.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}.`,
    min: MIN_RETENTION,
    max: MAX_RETENTION,
    parse: parseNumber,
    show: (value) => value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    key: 'breakDays',
    label: 'Диагностика после перерыва, дней',
    hint: `Если столько дней не было занятий, главная предложит короткую проверку пройденных тем: что сохранилось, а что пройти заново. По умолчанию — ${DEFAULT_SETTINGS.breakDays}.`,
    min: 7,
    max: 365,
    parse: integer,
    show: String,
  },
  {
    key: 'masteryThreshold',
    label: 'Порог «освоено», %',
    hint: `Сколько верных ответов нужно в итоговой и отложенной проверках. По умолчанию — ${Math.round(DEFAULT_SETTINGS.masteryThreshold * 100)}%.`,
    min: 0.5,
    max: 1,
    parse: (text) => {
      const value = integer(text.replace('%', ''));
      return value === null ? null : value / 100;
    },
    show: (value) => String(Math.round(value * 100)),
  },
];

function rangeText(field: FieldSpec): string {
  return `от ${field.show(field.min)} до ${field.show(field.max)}`;
}

interface PendingImport {
  backup: Backup;
  fileName: string;
  migratedFrom: number | null;
}

export default function Settings() {
  const [theme, setThemeChoice] = useState<ThemeChoice>('system');
  const [textSize, setTextSizeChoice] = useState<TextSize>('normal');
  const [settings, setSettings] = useState<LearningSettings | null>(null);
  // До загрузки в полях — значения по умолчанию: форма сразу на месте, и страница не прыгает.
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((field) => [field.key, field.show(DEFAULT_SETTINGS[field.key])])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [learningMessage, setLearningMessage] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<{ platform: 'ios' | 'other'; installed: boolean; prompt: InstallPromptEvent | null }>({
    platform: 'other',
    installed: false,
    prompt: null,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const fill = (next: LearningSettings) => {
    setSettings(next);
    setDrafts(Object.fromEntries(FIELDS.map((field) => [field.key, field.show(next[field.key])])));
    setErrors({});
  };

  // Установка на экран «Домой»: браузер сам сообщает, когда это можно сделать кнопкой.
  useEffect(() => {
    setInstall((state) => ({ ...state, platform: detectPlatform(), installed: isStandalone() }));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall((state) => ({ ...state, prompt: event as InstallPromptEvent }));
    };
    const onInstalled = () => setInstall((state) => ({ ...state, installed: true, prompt: null }));
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    setThemeChoice(readTheme());
    setTextSizeChoice(readTextSize());
    const db = getDb();
    void Promise.all([loadSettings(db), getSetting<number | null>(db, 'lastBackupAt', null), persistenceStatus()]).then(([loaded, last, status]) => {
      fill(loaded);
      setLastBackupAt(last);
      setPersistence(status);
    });
  }, []);

  function chooseTheme(choice: ThemeChoice) {
    saveTheme(choice);
    applyTheme(choice);
    setThemeChoice(choice);
  }

  function chooseTextSize(size: TextSize) {
    setTextSize(size);
    setTextSizeChoice(size);
  }

  async function saveLearning(event: Event) {
    event.preventDefault();
    if (!settings) return;
    const next: LearningSettings = { ...settings };
    const problems: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = field.parse(drafts[field.key] ?? '');
      if (value === null || value < field.min - 1e-9 || value > field.max + 1e-9) problems[field.key] = `Нужно число ${rangeText(field)}.`;
      else next[field.key] = value;
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setLearningMessage('Не сохранено: исправьте поля с ошибкой.');
      return;
    }
    const db = getDb();
    for (const field of FIELDS) await setSetting(db, SETTING_KEYS[field.key], next[field.key]);
    fill(next);
    setLearningMessage('Сохранено. Новые значения действуют со следующего ответа.');
  }

  async function restoreDefaults() {
    const db = getDb();
    for (const field of FIELDS) await setSetting(db, SETTING_KEYS[field.key], DEFAULT_SETTINGS[field.key]);
    fill({ ...DEFAULT_SETTINGS });
    setLearningMessage('Вернул значения по умолчанию.');
  }

  async function exportFile() {
    const db = getDb();
    const now = Date.now();
    const text = serializeBackup(createBackup(await readAll(db), now));
    const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = backupFileName(now);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    await setSetting(db, 'lastBackupAt', now);
    setLastBackupAt(now);
    setDataMessage(null);
  }

  async function chooseFile(files: FileList | null) {
    setDataMessage(null);
    setPending(null);
    const file = files?.[0];
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setDataMessage(parsed.message);
      return;
    }
    setPending({ backup: parsed.backup, fileName: file.name, migratedFrom: parsed.migratedFrom });
  }

  async function applyImport(mode: 'replace' | 'merge') {
    if (!pending) return;
    setBusy(true);
    try {
      const db = getDb();
      const incoming = pending.backup.data;
      const current = await readAll(db);
      const retention = settings?.retention ?? DEFAULT_SETTINGS.retention;
      const result = mode === 'replace' ? incoming : mergeData(current, incoming, createScheduler(retention));
      await writeAll(db, result);
      if (result.progress.length > 0) setProgressFlag(databaseName);
      else clearProgressFlag(databaseName);
      const when = formatFullMoment(pending.backup.exportedAt);
      setDataMessage(
        mode === 'replace'
          ? `Готово: данные на этом устройстве заменены копией от ${when}.`
          : `Готово: копия от ${when} объединена с данными на этом устройстве.`,
      );
      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
      fill(await loadSettings(db));
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    setBusy(true);
    try {
      const db = getDb();
      await writeAll(db, emptyData());
      await db.secrets.clear();
      clearProgressFlag(databaseName);
      setConfirmReset(false);
      setLastBackupAt(null);
      fill({ ...DEFAULT_SETTINGS });
      setDataMessage('Прогресс удалён. Настройки обучения вернулись к значениям по умолчанию.');
    } finally {
      setBusy(false);
    }
  }

  const summary = pending ? describeBackup(pending.backup) : null;

  return (
    <div class="settings">
      <section class="settings-section" aria-labelledby={`${uid}-look`}>
        <h2 id={`${uid}-look`}>Оформление</h2>
        <fieldset class="settings-options">
          <legend>Тема</legend>
          {THEMES.map((item) => (
            <label class="choice">
              <input type="radio" name={`${uid}-theme`} checked={theme === item.value} onChange={() => chooseTheme(item.value)} />
              {item.label}
            </label>
          ))}
        </fieldset>
        <fieldset class="settings-options">
          <legend>Размер текста</legend>
          {TEXT_SIZES.map((item) => (
            <label class="choice">
              <input type="radio" name={`${uid}-size`} checked={textSize === item.value} onChange={() => chooseTextSize(item.value)} />
              {item.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section class="settings-section" aria-labelledby={`${uid}-learning`}>
        <h2 id={`${uid}-learning`}>Обучение</h2>
        <form onSubmit={(event) => void saveLearning(event)} noValidate aria-busy={!settings}>
          {FIELDS.map((field) => {
            const id = `${uid}-${field.key}`;
            const error = errors[field.key];
            return (
              <div class="settings-field">
                <label for={id}>{field.label}</label>
                <input
                  id={id}
                  type="text"
                  inputMode={field.key === 'retention' ? 'decimal' : 'numeric'}
                  value={drafts[field.key] ?? ''}
                  disabled={!settings}
                  aria-invalid={error !== undefined}
                  aria-describedby={`${id}-hint`}
                  onInput={(event) => setDrafts({ ...drafts, [field.key]: (event.target as HTMLInputElement).value })}
                />
                <p id={`${id}-hint`} class={error ? 'viz-own-data__hint is-error' : 'muted'}>
                  {error ?? `${field.hint} Можно ${rangeText(field)}.`}
                </p>
              </div>
            );
          })}
          <div class="question__actions">
            <button type="submit" class="button button--primary" disabled={!settings}>
              Сохранить
            </button>
            <button type="button" class="button" disabled={!settings} onClick={() => void restoreDefaults()}>
              Вернуть по умолчанию
            </button>
          </div>
          {learningMessage && (
            <p role="status" class="question__verdict">
              {learningMessage}
            </p>
          )}
        </form>
      </section>

      <section class="settings-section" aria-labelledby={`${uid}-backup`}>
        <h2 id={`${uid}-backup`}>Копия в файл</h2>
        <p>
          Прогресс хранится только в этом браузере. Копия переносит его на другое устройство и спасает, если браузер удалит данные.
          Ключ API в копию не попадает.
        </p>
        <div class="question__actions">
          <button type="button" class="button button--primary" onClick={() => void exportFile()} disabled={busy}>
            Сохранить копию в файл
          </button>
        </div>
        <p class="muted">Последняя копия: {lastBackupAt === null ? 'ещё не сохранялась' : formatFullMoment(lastBackupAt)}.</p>

        <h3>Восстановить из файла</h3>
        {/* Поле выбора файла спрятано, кнопкой служит его подпись: так кнопка по-русски в любом
            браузере. С клавиатуры фокус попадает на само поле. */}
        <input
          id={`${uid}-file`}
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden settings-file"
          onChange={(event) => void chooseFile(event.currentTarget.files)}
        />
        <label for={`${uid}-file`} class="button settings-file-button">
          Выбрать файл копии…
        </label>
        {pending && summary && (
          <div class="note">
            <strong class="note__title">
              Копия от {formatFullMoment(summary.exportedAt)}: навыков — {summary.cards}, ответов — {summary.reviews}.
            </strong>
            <p class="muted">Файл: {pending.fileName}</p>
            {pending.migratedFrom !== null && <p>Копия из старой версии приложения переведена в текущую схему.</p>}
            <p>
              «Заменить» — данные на этом устройстве станут такими, как в копии. «Объединить» — ответы с обоих устройств сложатся без
              повторов, а расписание каждого навыка пересчитается по общей истории.
            </p>
            <div class="question__actions">
              <button type="button" class="button" onClick={() => void applyImport('replace')} disabled={busy}>
                Заменить
              </button>
              <button type="button" class="button button--primary" onClick={() => void applyImport('merge')} disabled={busy}>
                Объединить
              </button>
            </div>
          </div>
        )}
        {dataMessage && (
          <div class="viz-feedback" role="status">
            <p>{dataMessage}</p>
          </div>
        )}
      </section>

      <section class="settings-section" aria-labelledby={`${uid}-storage`}>
        <h2 id={`${uid}-storage`}>Хранилище</h2>
        <p>Постоянное хранилище: {persistence === null ? 'проверяю…' : PERSISTENCE_TEXT[persistence]}</p>
        {persistence === 'not-persisted' && (
          <div class="question__actions">
            <button type="button" class="button" onClick={() => void requestPersistence().then(setPersistence)}>
              Попросить браузер не удалять данные
            </button>
          </div>
        )}
        <p class="muted">
          Safari удаляет данные сайта, если семь дней пользоваться Safari и не заходить на сайт. Приложение на экране «Домой» живёт по
          своему счётчику, поэтому на iPhone его лучше установить.
        </p>
        {confirmReset ? (
          <div class="note" role="alert">
            <strong class="note__title">Удалить весь прогресс, журнал ошибок и настройки обучения? Отменить это нельзя.</strong>
            <p>Если прогресс может понадобиться, сначала сохраните копию в файл.</p>
            <div class="question__actions">
              <button type="button" class="button button--primary" onClick={() => void resetAll()} disabled={busy}>
                Удалить всё
              </button>
              <button type="button" class="button" onClick={() => setConfirmReset(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div class="question__actions">
            <button type="button" class="button" onClick={() => setConfirmReset(true)}>
              Удалить весь прогресс…
            </button>
          </div>
        )}
      </section>

      <section class="settings-section" aria-labelledby={`${uid}-install`}>
        <h2 id={`${uid}-install`}>Установка на телефон</h2>
        {install.installed ? (
          <p>Приложение установлено на это устройство.</p>
        ) : install.prompt ? (
          <div class="question__actions">
            <button
              type="button"
              class="button button--primary"
              onClick={() => {
                const prompt = install.prompt;
                if (!prompt) return;
                void prompt.prompt().then(async () => {
                  const choice = await prompt.userChoice;
                  setInstall((state) => ({ ...state, prompt: null, installed: choice.outcome === 'accepted' }));
                });
              }}
            >
              Установить приложение
            </button>
          </div>
        ) : install.platform === 'ios' ? (
          <p>{IOS_INSTALL_TEXT}</p>
        ) : (
          <p>
            Приложение можно поставить на экран «Домой» или рабочий стол: в меню браузера выберите «Установить приложение» или «Добавить на
            главный экран». Тогда оно открывается отдельным окном и работает без сети.
          </p>
        )}
      </section>

      <section class="settings-section" aria-labelledby={`${uid}-language`}>
        <h2 id={`${uid}-language`}>Язык</h2>
        <p>Интерфейс и темы — на русском. Казахский и английский появятся в шестой волне.</p>
      </section>
    </div>
  );
}
