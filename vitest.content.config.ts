import { defineConfig } from 'vitest/config';

/** Автопроверки кода тем: npm run check:code. Компиляция C++ с санитайзерами небыстрая. */
export default defineConfig({
  test: {
    include: ['tests/content/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
