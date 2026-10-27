#!/usr/bin/env node
/**
 * Иконки приложения для экрана «Домой» из логотипа (public/favicon.svg).
 * Запускается вручную, когда меняется логотип: node scripts/make-icons.mjs.
 * Готовые PNG лежат в public/icons/ и попадают в сборку как есть.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const LETTER = '<path d="M10 8v16M22 8v16M10 24 22 8" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';

/** Скруглённый квадрат на прозрачном фоне — обычная иконка. */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#111111"/>${LETTER}</svg>`;

/**
 * Иконка на весь квадрат: для «maskable» (Android сам обрезает форму, буква
 * внутри безопасной зоны 80%) и для iPhone (iOS сам скругляет углы).
 */
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#111111"/><g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${LETTER}</g></svg>`;

mkdirSync('public/icons', { recursive: true });
const jobs = [
  { svg: rounded, size: 192, file: 'icon-192.png' },
  { svg: rounded, size: 512, file: 'icon-512.png' },
  { svg: fullBleed(0.8), size: 512, file: 'icon-maskable-512.png' },
  { svg: fullBleed(0.9), size: 180, file: 'apple-touch-icon.png' },
];
for (const job of jobs) {
  await sharp(Buffer.from(job.svg), { density: (72 * job.size) / 32 })
    .resize(job.size, job.size)
    .png({ compressionLevel: 9 })
    .toFile(`public/icons/${job.file}`);
  console.log(`public/icons/${job.file}`);
}
