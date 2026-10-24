/**
 * Постоянное хранилище (ТЗ, «Сохранность данных»): браузер может удалить
 * данные сайта при нехватке места, если хранилище не постоянное. Запрос
 * navigator.storage.persist() браузер вправе отклонить — это честно
 * показывается в настройках.
 */
export type PersistenceStatus = 'persisted' | 'not-persisted' | 'unsupported';

export async function persistenceStatus(): Promise<PersistenceStatus> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persisted !== 'function') return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}

export async function requestPersistence(): Promise<PersistenceStatus> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return 'unsupported';
  try {
    return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'not-persisted';
  }
}

export const PERSISTENCE_TEXT: Record<PersistenceStatus, string> = {
  persisted: 'включено: браузер не удалит данные сам, даже если на устройстве мало места.',
  'not-persisted': 'не включено: при нехватке места браузер может удалить данные. Сохраняйте копию в файл.',
  unsupported: 'браузер не поддерживает постоянное хранилище. Сохраняйте копию в файл.',
};
