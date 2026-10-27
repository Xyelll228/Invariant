import { createHash } from 'node:crypto';

/** Хеш встроенного скрипта для CSP: 'sha256-…' по точному тексту скрипта. */
export function scriptHash(code: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}`;
}
