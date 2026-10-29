import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Список упавших сквозных тестов одной пометкой (annotation) в правке на GitHub.
 * Пометок от одного шага GitHub показывает не больше десяти, а подробные
 * пометки репортёра github идут по одной на каждую попытку теста. Этот
 * репортёр стоит в списке первым, поэтому полный список виден всегда.
 */
export default class FailureSummary implements Reporter {
  readonly #failed = new Map<string, string>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = `[${test.parent.project()?.name ?? '?'}] ${test.titlePath().slice(2).filter(Boolean).join(' › ')}`;
    if (test.outcome() === 'unexpected') {
      // eslint-disable-next-line no-control-regex
      const message = (result.error?.message ?? result.status).replace(/\u001b\[[0-9;]*m/g, '');
      this.#failed.set(title, message.split('\n').filter(Boolean).slice(0, 4).join(' / '));
    } else {
      this.#failed.delete(title);
    }
  }

  onEnd(): void {
    if (this.#failed.size === 0) return;
    const text = [...this.#failed].map(([title, message]) => `${title}: ${message}`).join('\n');
    const escaped = text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Упавшие тесты (${this.#failed.size})::${escaped}`);
  }
}
