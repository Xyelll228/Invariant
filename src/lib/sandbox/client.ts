/**
 * Запуск кода человека в песочнице. Создаёт скрытое вложенное окно
 * (sandbox="allow-scripts", без allow-same-origin) со страницей
 * sandbox/runner.html и обменивается с ним сообщениями.
 */
export interface SandboxTest {
  args: unknown[];
  /** Ожидаемый результат; без него тест просто показывает, что вернула функция. */
  expected?: unknown;
}

export interface SandboxError {
  name: string;
  message: string;
  /** Строка в коде человека, если её удалось определить. */
  line: number | null;
}

/**
 * pass и fail — результат сверен с ожидаемым; done — ожидаемого нет, показан результат;
 * skipped — тест не запускался, потому что предыдущий превысил лимит времени.
 */
export type SandboxStatus = 'pass' | 'fail' | 'done' | 'error' | 'timeout' | 'missing' | 'skipped';

export interface SandboxTestResult {
  status: SandboxStatus;
  /** Что вернула функция, в виде строки. */
  shown: string | null;
  error: SandboxError | null;
  logs: string[];
  ms: number;
}

export interface SandboxReply {
  results: SandboxTestResult[];
  /** Код не запустился: синтаксическая ошибка или ошибка вне функции. */
  loadError?: SandboxError;
}

export interface SandboxRequest {
  code: string;
  functionName: string;
  tests: SandboxTest[];
  /** Лимит времени на один тест, мс. По умолчанию 2000 (ТЗ). */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 2000;

export class Sandbox {
  #frame: HTMLIFrameElement | null = null;
  #ready: Promise<void> | null = null;
  #pending = new Map<string, (reply: SandboxReply) => void>();

  constructor(private readonly src: string) {}

  #ensure(): Promise<void> {
    if (this.#ready) return this.#ready;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', 'Песочница для кода');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.className = 'sandbox-frame';
    frame.src = this.src;
    this.#frame = frame;
    this.#ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Песочница не загрузилась')), 15000);
      window.addEventListener('message', (event: MessageEvent) => {
        // Ответы принимаем только от своего окна песочницы с непрозрачным источником.
        if (event.source !== frame.contentWindow || event.origin !== 'null') return;
        const data = event.data as { type?: string; id?: string } & SandboxReply;
        if (data?.type === 'ready') {
          clearTimeout(timer);
          resolve();
        } else if (data?.type === 'result' && typeof data.id === 'string') {
          const callback = this.#pending.get(data.id);
          this.#pending.delete(data.id);
          callback?.({ results: data.results ?? [], ...(data.loadError ? { loadError: data.loadError } : {}) });
        }
      });
    });
    document.body.append(frame);
    return this.#ready;
  }

  async run(request: SandboxRequest): Promise<SandboxReply> {
    await this.#ensure();
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return new Promise<SandboxReply>((resolve) => {
      this.#pending.set(id, resolve);
      this.#frame?.contentWindow?.postMessage(
        {
          type: 'run',
          id,
          code: request.code,
          functionName: request.functionName,
          tests: request.tests,
          timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
        '*',
      );
    });
  }
}
