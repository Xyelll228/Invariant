'use strict';
// Песочница «Инварианта»: начало фонового потока. Дальше идёт код человека,
// после него — запуск теста (worker-suffix.js). Номера строк в ошибках
// пересчитываются так, чтобы указывать на строку в коде человека.
const __invariant = (() => {
  const logs = [];
  let size = 0;
  const MAX_LINES = 200;
  const MAX_CHARS = 20000;

  const format = (value, depth = 0) => {
    if (typeof value === 'string') return depth === 0 ? value : JSON.stringify(value);
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value);
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return `функция ${value.name || ''}`.trim();
    if (typeof value !== 'object') return String(value);
    if (depth > 4) return '…';
    if (Array.isArray(value)) {
      const items = value.slice(0, 100).map((item) => format(item, depth + 1));
      if (value.length > 100) items.push(`… ещё ${value.length - 100}`);
      return `[${items.join(', ')}]`;
    }
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    const entries = Object.entries(value).slice(0, 50).map(([key, item]) => `${key}: ${format(item, depth + 1)}`);
    return `{ ${entries.join(', ')} }`;
  };

  const record = (args) => {
    if (logs.length >= MAX_LINES || size >= MAX_CHARS) return;
    const line = args.map((item) => format(item)).join(' ').slice(0, 1000);
    size += line.length;
    logs.push(line);
  };
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = (...args) => record(args);

  // Сеть закрыта CSP; заглушки дают понятное сообщение вместо сетевой ошибки.
  const blocked = (name) =>
    function () {
      throw new Error(`${name} недоступен в песочнице: сеть отключена`);
    };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    try {
      Object.defineProperty(self, name, { value: blocked(name), writable: false, configurable: false });
    } catch {
      // Свойство нельзя переопределить — запрос всё равно остановит CSP.
    }
  }

  const post = self.postMessage.bind(self);
  return { logs, format, post };
})();
