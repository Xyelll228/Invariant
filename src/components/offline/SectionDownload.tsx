/**
 * Кнопка «Скачать раздел» на странице раздела (ТЗ, «Скорость»: «раздел можно
 * скачать заранее целиком»): страницы раздела и задания его тем — на
 * устройство, чтобы они открывались без сети.
 */
import { useEffect, useState } from 'preact/hooks';
import { downloadSection, loadSections, offlineSupported, sectionStatus, type DownloadProgress, type SectionFiles } from '../../lib/offline/download.ts';
import { plural } from '../../lib/learning/format.ts';

export interface SectionDownloadProps {
  base: string;
  sectionId: string;
}

type State =
  | { kind: 'checking' }
  | { kind: 'unsupported' }
  | { kind: 'empty' }
  | { kind: 'ready'; section: SectionFiles; saved: number; total: number }
  | { kind: 'downloading'; section: SectionFiles; progress: DownloadProgress }
  | { kind: 'done'; section: SectionFiles; progress: DownloadProgress }
  | { kind: 'failed'; message: string };

function kilobytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ru-RU')} КБ`;
}

export default function SectionDownload({ base, sectionId }: SectionDownloadProps) {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    let alive = true;
    (async () => {
      // Service Worker начинает управлять страницей со второго открытия: до этого скачанное не открылось бы без сети.
      if (!offlineSupported()) {
        if (alive) setState({ kind: 'unsupported' });
        return;
      }
      const section = (await loadSections(base)).find((item) => item.id === sectionId);
      if (!section || section.topics === 0) {
        if (alive) setState({ kind: 'empty' });
        return;
      }
      const status = await sectionStatus(base, section);
      if (alive) setState({ kind: 'ready', section, ...status });
    })().catch(() => {
      if (alive) setState({ kind: 'failed', message: 'Не получилось проверить, что уже сохранено. Обновите страницу.' });
    });
    return () => {
      alive = false;
    };
  }, [base, sectionId]);

  async function start(section: SectionFiles) {
    if (!navigator.onLine) {
      setState({ kind: 'failed', message: 'Сейчас нет сети: скачать раздел можно, когда она появится.' });
      return;
    }
    const progress = await downloadSection(base, section, (next) => setState({ kind: 'downloading', section, progress: next }));
    setState({ kind: 'done', section, progress });
  }

  return (
    <div class="section-download">
      {state.kind === 'checking' && <p class="muted">Проверяю, что из раздела уже сохранено на устройстве…</p>}
      {state.kind === 'unsupported' && (
        <p class="muted">
          Скачать раздел для работы без сети можно, когда сайт уже сохранён на устройстве: откройте эту страницу ещё раз. Если
          браузер не поддерживает работу без сети, кнопки не будет.
        </p>
      )}
      {state.kind === 'empty' && <p class="muted">В разделе пока нет вышедших тем — скачивать нечего.</p>}
      {state.kind === 'ready' && (
        <>
          <p>
            {state.saved === state.total
              ? `Раздел сохранён на устройстве: ${state.total} ${plural(state.total, ['файл', 'файла', 'файлов'])}. Без сети откроются все его темы.`
              : state.saved > 0
                ? `На устройстве сохранено ${state.saved} из ${state.total} файлов раздела.`
                : `Темы раздела без сети откроются, только если их уже открывали. Скачайте раздел целиком: ${state.section.topics} ${plural(state.section.topics, ['тема', 'темы', 'тем'])}, ${state.total} ${plural(state.total, ['файл', 'файла', 'файлов'])}.`}
          </p>
          <p>
            <button type="button" class="button" onClick={() => void start(state.section)}>
              {state.saved === state.total ? 'Скачать заново' : 'Скачать раздел для работы без сети'}
            </button>
          </p>
        </>
      )}
      {state.kind === 'downloading' && (
        <p role="status">
          Скачиваю: {state.progress.done} из {state.progress.total}…
        </p>
      )}
      {state.kind === 'done' && (
        <p role="status">
          {state.progress.failed === 0
            ? `Раздел сохранён: ${state.progress.done} ${plural(state.progress.done, ['файл', 'файла', 'файлов'])}, ${kilobytes(state.progress.bytes)}. Без сети откроются все его темы.`
            : `Сохранено ${state.progress.done} из ${state.progress.total}: ${state.progress.failed} не скачалось. Проверьте сеть и попробуйте ещё раз.`}
        </p>
      )}
      {state.kind === 'failed' && <p role="alert">{state.message}</p>}
    </div>
  );
}
