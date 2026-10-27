// Собрано scripts/build-sw.mjs. Новая версия включилась — страницы из кеша
// ссылаются на скрипты прошлой версии, поэтому кеш страниц очищается.
self.addEventListener('activate', (event) => event.waitUntil(caches.delete("invariant-pr-8-pages")));
