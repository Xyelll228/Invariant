/**
 * Скачивание раздела для работы без сети (ТЗ, «Скорость»: «раздел можно
 * скачать заранее целиком»). Страницы раздела кладутся в тот же кеш, куда
 * Service Worker кладёт открытые страницы, задания тем — в кеш заданий.
 * Запросы идут только к своему сайту и только по нажатию кнопки.
 *
 * Когда включается новая версия приложения, кеш страниц очищается: в старых
 * страницах ссылки на скрипты прошлой версии. Поэтому скачанные разделы
 * запоминаются и после обновления скачиваются заново (refreshDownloaded).
 */
import { cacheNames } from '../site.ts';

export interface SectionFiles {
  id: string;
  title: string;
  /** Адреса страниц без base: раздел, модули, уровни вышедших тем. */
  pages: string[];
  /** Задания тем для повторения: ru/learn/<id темы>.json. */
  data: string[];
  /** Сколько тем раздела вышло. */
  topics: number;
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
  failed: number;
}

const DOWNLOADED_KEY = 'invariant:downloaded-sections';

export function offlineSupported(): boolean {
  return typeof caches !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
}

export async function loadSections(base: string): Promise<SectionFiles[]> {
  const response = await fetch(`${base}ru/learn/sections.json`);
  if (!response.ok) throw new Error(`список разделов не загрузился: ${response.status}`);
  return ((await response.json()) as { sections: SectionFiles[] }).sections;
}

function files(section: SectionFiles): { url: string; cache: string }[] {
  return [...section.pages.map((url) => ({ url, cache: cacheNames.pages })), ...section.data.map((url) => ({ url, cache: cacheNames.learn }))];
}

/** Сколько файлов раздела уже лежит на устройстве. */
export async function sectionStatus(base: string, section: SectionFiles): Promise<{ saved: number; total: number }> {
  const list = files(section);
  let saved = 0;
  for (const file of list) {
    const cache = await caches.open(file.cache);
    if (await cache.match(`${base}${file.url}`)) saved++;
  }
  return { saved, total: list.length };
}

export async function downloadSection(base: string, section: SectionFiles, onProgress: (progress: DownloadProgress) => void): Promise<DownloadProgress> {
  const list = files(section);
  const progress: DownloadProgress = { done: 0, total: list.length, bytes: 0, failed: 0 };
  onProgress({ ...progress });
  for (const file of list) {
    const url = `${base}${file.url}`;
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.clone().arrayBuffer();
      await (await caches.open(file.cache)).put(url, response);
      progress.bytes += body.byteLength;
      progress.done++;
    } catch {
      progress.failed++;
    }
    onProgress({ ...progress });
  }
  if (progress.failed === 0) rememberDownloaded(section.id);
  return progress;
}

export function downloadedSections(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(DOWNLOADED_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rememberDownloaded(sectionId: string): void {
  try {
    const list = new Set(downloadedSections());
    list.add(sectionId);
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify([...list]));
  } catch {
    // Хранилище недоступно — после обновления раздел придётся скачать снова вручную.
  }
}

/**
 * После обновления приложения кеш страниц пуст: скачанные раньше разделы
 * скачиваются заново, если есть сеть. Проверка — по первой странице раздела.
 */
export async function refreshDownloaded(base: string): Promise<void> {
  const wanted = downloadedSections();
  if (wanted.length === 0 || !offlineSupported() || !navigator.onLine) return;
  const sections = (await loadSections(base)).filter((section) => wanted.includes(section.id));
  const pages = await caches.open(cacheNames.pages);
  for (const section of sections) {
    const first = section.pages[0];
    if (first && !(await pages.match(`${base}${first}`))) await downloadSection(base, section, () => {});
  }
}
