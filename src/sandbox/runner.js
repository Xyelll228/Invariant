// Песочница «Инварианта»: страница во вложенном окне с атрибутом sandbox без
// allow-same-origin. У неё непрозрачный источник — хранилища приложения она
// не видит; CSP запрещает ей сеть. Код человека выполняется в фоновом потоке:
// по таймауту поток уничтожается, и страница приложения не зависает.
(() => {
  'use strict';
  // Код запускаем, только если окно действительно изолировано: у вложенного окна
  // с sandbox без allow-same-origin источник непрозрачный — «null». Если чужой
  // сайт встроит эту страницу без sandbox или её откроют напрямую, источник
  // будет как у приложения, и фоновый поток увидел бы его хранилище. Тогда
  // страница молчит и ничего не выполняет.
  if (self.origin !== 'null' || window.parent === window) return;
  const PREFIX = __INVARIANT_PREFIX__;
  const SUFFIX = __INVARIANT_SUFFIX__;
  const OFFSET = PREFIX.split('\n').length;
  const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
  const MAX_CODE = 100000;
  const MAX_TESTS = 100;

  const reply = (message) => window.parent.postMessage(message, '*');

  const buildSource = (code, name) =>
    `${PREFIX}\n${code}\n${SUFFIX.split('__INVARIANT_FUNCTION__').join(name).split('__INVARIANT_OFFSET__').join(String(OFFSET))}`;

  const runOne = (url, test, timeoutMs) =>
    new Promise((resolve) => {
      let settled = false;
      const started = performance.now();
      const worker = new Worker(url);
      const done = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        resolve({ ...result, ms: Math.round(performance.now() - started) });
      };
      const timer = setTimeout(() => done({ status: 'timeout', shown: null, error: null, logs: [] }), timeoutMs);
      worker.onmessage = (event) => done(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        const line = typeof event.lineno === 'number' && event.lineno > OFFSET ? event.lineno - OFFSET : null;
        // Ошибки выполнения код ловит сам (worker-suffix.js), поэтому сюда приходят
        // в основном ошибки разбора кода. Firefox сообщает о них без текста ошибки —
        // тогда это синтаксическая ошибка без подробностей.
        const error = event.message ? { name: 'Error', message: String(event.message), line } : { name: 'SyntaxError', message: '', line };
        done({ status: 'load-error', shown: null, error, logs: [] });
      };
      worker.postMessage({ args: test.args, expected: test.expected, hasExpected: Object.hasOwn(test, 'expected') });
    });

  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.type !== 'run') return;
    const { id, code, functionName, tests, timeoutMs } = message;
    if (typeof code !== 'string' || code.length > MAX_CODE || !IDENTIFIER.test(functionName) || !Array.isArray(tests) || tests.length > MAX_TESTS) {
      reply({ type: 'result', id, results: [], loadError: { name: 'Error', message: 'Неверный запрос к песочнице', line: null } });
      return;
    }
    const url = URL.createObjectURL(new Blob([buildSource(code, functionName)], { type: 'text/javascript' }));
    const codeLines = code.split('\n').length;
    // Номер строки вне кода человека (ошибка в обвязке) не показываем.
    const clampLine = (error) => (error && (error.line === null || error.line > codeLines) ? { ...error, line: null } : error);
    const results = [];
    try {
      for (const test of tests) {
        const result = await runOne(url, test, Math.min(Math.max(Number(timeoutMs) || 2000, 100), 10000));
        if (result.status === 'load-error') {
          reply({ type: 'result', id, results: [], loadError: clampLine(result.error) });
          return;
        }
        results.push({ ...result, error: clampLine(result.error) });
        // После превышения лимита остальные тесты не запускаем: почти всегда это
        // бесконечный цикл, и человек ждал бы по 2 секунды на каждый тест.
        if (result.status === 'timeout') break;
      }
      while (results.length < tests.length) results.push({ status: 'skipped', shown: null, error: null, logs: [], ms: 0 });
      reply({ type: 'result', id, results });
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  reply({ type: 'ready' });
})();
