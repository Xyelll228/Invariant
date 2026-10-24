;
// Песочница «Инварианта»: запуск одного теста после кода человека.
const __invariantEqual = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => __invariantEqual(item, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && __invariantEqual(a[key], b[key]));
};

const __invariantLine = (error) => {
  const stack = error && typeof error.stack === 'string' ? error.stack : '';
  const match = /blob:[^\s)]*:(\d+):\d+/.exec(stack);
  if (!match) return null;
  const line = Number(match[1]) - __INVARIANT_OFFSET__;
  return line >= 1 ? line : null;
};

self.onmessage = (event) => {
  const { args, expected, hasExpected } = event.data;
  const fn = typeof __INVARIANT_FUNCTION__ === 'function' ? __INVARIANT_FUNCTION__ : undefined;
  if (!fn) {
    __invariant.post({ status: 'missing', logs: __invariant.logs });
    return;
  }
  const finish = (result) => {
    const got = result === undefined ? args[0] : result;
    const status = !hasExpected ? 'done' : __invariantEqual(got, expected) ? 'pass' : 'fail';
    __invariant.post({ status, shown: __invariant.format(got, 1), error: null, logs: __invariant.logs });
  };
  const fail = (error) => {
    __invariant.post({
      status: 'error',
      shown: null,
      error: {
        name: error && error.name ? String(error.name) : 'Error',
        message: error && error.message !== undefined ? String(error.message) : String(error),
        line: __invariantLine(error),
      },
      logs: __invariant.logs,
    });
  };
  try {
    const result = fn(...args);
    if (result && typeof result.then === 'function') result.then(finish, fail);
    else finish(result);
  } catch (error) {
    fail(error);
  }
};
