import { useEffect, useState } from 'preact/hooks';

/** Просил ли человек уменьшить движение в настройках системы. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  // Сначала false, как при сборке страницы на сервере, — иначе разметка
  // при «оживлении» не совпадёт. Настоящее значение — сразу после.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const list = matchMedia(query);
    const update = () => setReduced(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return reduced;
}
