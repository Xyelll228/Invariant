import type { Locator, Page } from '@playwright/test';
import { replaceEditorText } from './editor.ts';
import { expect, test } from './fixtures.ts';

/**
 * Песочница кода (ТЗ, «Безопасность исполнения» и критерий приёмки
 * «Код человека не видит хранилище приложения и не вешает страницу»).
 */

const SOLUTION = [
  'function insertionSort(a) {',
  '  for (let i = 1; i < a.length; i++) {',
  '    for (let j = i; j > 0 && a[j - 1] > a[j]; j--) {',
  '      [a[j - 1], a[j]] = [a[j], a[j - 1]];',
  '    }',
  '  }',
  '  return a;',
  '}',
].join('\n');

/** Прокручивает остров к себе и ждёт, пока он «оживёт» (client:visible). */
async function hydrated(locator: Locator): Promise<Locator> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/);
  await expect(locator.locator('.cm-content')).toBeVisible();
  return locator;
}

/** Заменяет весь код в редакторе задания. */
async function setCode(page: Page, lab: Locator, code: string): Promise<void> {
  await replaceEditorText(page, lab.locator('.cm-content'), code);
}

function exerciseLab(page: Page): Locator {
  return page.getByRole('region', { name: 'Задание: сортировка вставками' });
}

function isolationLab(page: Page): Locator {
  return page.getByRole('region', { name: 'Проверка изоляции' });
}

test.beforeEach(async ({ page }) => {
  await page.goto('ru/prototypes/sandbox/');
});

test('верное решение проходит видимые и скрытые тесты', async ({ page }) => {
  const lab = await hydrated(exerciseLab(page));
  await setCode(page, lab, SOLUTION);
  await lab.getByRole('button', { name: 'Запустить' }).click();
  await expect(lab.locator('.code-lab__summary')).toHaveText(/^Все тесты пройдены\. Видимые: 3 из 3, скрытые: (\d+) из \1\.$/);
  await expect(lab.locator('.code-lab__tests li').first()).toContainText('Получено: [1, 3, 4, 5, 7]');
});

test('неверное решение: видно, какой тест не пройден и на каких данных', async ({ page }) => {
  const lab = await hydrated(exerciseLab(page));
  // Исходный код возвращает массив без изменений.
  await lab.getByRole('button', { name: 'Запустить' }).click();
  await expect(lab.locator('.code-lab__summary')).toContainText('Есть непройденные тесты.');
  const first = lab.locator('.code-lab__tests li').first();
  await expect(first).toContainText('✗ неверно');
  await expect(first).toContainText('Ожидается: [1, 3, 4, 5, 7]');
  await expect(first).toContainText('Получено: [7, 3, 5, 1, 4]');
  await expect(lab.getByText(/Скрытый тест \d+ не пройден/)).toBeVisible();

  await setCode(page, lab, 'function sort(a) {\n  return a;\n}\n');
  await lab.getByRole('button', { name: 'Запустить' }).click();
  await expect(lab.locator('.viz-feedback')).toContainText('Функция insertionSort не найдена');
});

test.describe(() => {
  // WebKit сообщает об ошибке разбора кода в фоновом потоке песочницы как об ошибке страницы,
  // хотя песочница её обработала.
  test.use({ expectedProblems: [/^pageerror: .*(Unexpected token|SyntaxError)/] });

  test('синтаксическая и runtime-ошибки объясняются по-русски с номером строки', async ({ page }, testInfo) => {
    const lab = await hydrated(exerciseLab(page));
    await setCode(page, lab, 'function insertionSort(a) {\n  return a.sort((x, y) => x - y;\n}\n');
    await lab.getByRole('button', { name: 'Запустить' }).click();
    const feedback = lab.locator('.viz-feedback');
    await expect(feedback).toContainText('Код не запустился. Синтаксическая ошибка: проверьте скобки, запятые и кавычки.');
    if (testInfo.project.name.includes('chromium')) await expect(feedback).toContainText('Строка 2.');

    await setCode(page, lab, 'function insertionSort(a) {\n  const n = a.length;\n  return b;\n}\n');
    await lab.getByRole('button', { name: 'Запустить' }).click();
    await expect(feedback).toContainText('Имя «b» не объявлено: проверьте кавычки и опечатки.');
    await expect(feedback).toContainText('Строка 3.');
  });
});

test('код не видит хранилище приложения', async ({ page }, testInfo) => {
  // Приложение кладёт прогресс в свою базу «invariant» — песочница не должна его увидеть.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('invariant', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('progress').put('секрет', 'marker');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
  const lab = await hydrated(isolationLab(page));
  await lab.getByRole('button', { name: 'прочитать хранилище' }).click();
  await lab.getByRole('button', { name: 'Запустить' }).click();
  const result = lab.locator('.code-lab__tests li').first();
  await expect(result).toContainText('→ результат');
  // Chromium и Firefox запрещают IndexedDB непрозрачному источнику; другой браузер
  // может дать песочнице свою пустую базу. Главное — данных приложения не видно.
  await expect(result).toContainText(/IndexedDB приложения: нет доступа|открылась пустая база песочницы/);
  if (testInfo.project.name.includes('chromium')) await expect(result).toContainText('нет доступа (SecurityError)');
  await expect(result).not.toContainText('progress');
});

test.describe(() => {
  // Браузер пишет в консоль, что CSP песочницы заблокировала запрос, — это и проверяем.
  test.use({ expectedProblems: [/connect-src|example\.org/] });

  test('код не может обратиться к сети', async ({ page }) => {
    let reached = 0;
    await page.context().route('https://example.org/**', async (route) => {
      reached++;
      await route.abort();
    });
    const lab = await hydrated(isolationLab(page));
    await lab.getByRole('button', { name: 'отправить запрос в сеть' }).click();
    await lab.getByRole('button', { name: 'Запустить' }).click();
    const result = lab.locator('.code-lab__tests li').first();
    await expect(result).toContainText('fetch: fetch недоступен в песочнице: сеть отключена');
    await expect(result).toContainText('fetch в обход заглушки: заблокирован');
    expect(reached, 'запрос дошёл до сети').toBe(0);
  });
});

test('бесконечный цикл останавливается по лимиту, страница работает', async ({ page }) => {
  const lab = await hydrated(isolationLab(page));
  await lab.getByRole('button', { name: 'бесконечный цикл' }).click();
  const started = Date.now();
  await lab.getByRole('button', { name: 'Запустить' }).click();
  await expect(lab.getByRole('button', { name: 'Запуск…' })).toBeDisabled();

  // Пока код крутится в цикле, страница отвечает: тема переключается.
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await expect(lab.locator('.code-lab__tests li').first()).toContainText('✗ лимит времени', { timeout: 8000 });
  await expect(lab.locator('.viz-feedback')).toContainText('Тест не уложился в 2 с.');
  expect(Date.now() - started).toBeLessThan(8000);
  await expect(lab.getByRole('button', { name: 'Запустить' })).toBeEnabled();
});

test('после превышения лимита остальные тесты не запускаются', async ({ page }) => {
  const lab = await hydrated(exerciseLab(page));
  await setCode(page, lab, 'function insertionSort(a) {\n  while (a.length > 0) {}\n  return a;\n}\n');
  await lab.getByRole('button', { name: 'Запустить' }).click();
  // Первый тест зацикливается, второй (пустой массив) уже не запускается.
  const tests = lab.locator('.code-lab__tests li');
  await expect(tests.nth(0)).toContainText('✗ лимит времени', { timeout: 8000 });
  await expect(tests.nth(1)).toContainText('— не запускался');
  await expect(lab.locator('.viz-feedback')).toContainText(/Остальные тесты \(\d+\) не запускались\./);
});

test('страница песочницы выполняет код только во вложенном окне с sandbox', async ({ page }) => {
  await page.goto('ru/');
  const runnerUrl = new URL('../sandbox/runner.html', page.url()).href;
  // Приложение кладёт страницу песочницы в окно атрибутом srcdoc; проверяем и его, и обычный src.
  const attempt = (sandboxed: boolean, inline: boolean) =>
    page.evaluate(
      async ({ src, sandboxed, inline }) => {
        const frame = document.createElement('iframe');
        if (sandboxed) frame.setAttribute('sandbox', 'allow-scripts');
        const messages: unknown[] = [];
        window.addEventListener('message', (event) => {
          if (event.source === frame.contentWindow) messages.push(event.data);
        });
        const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
        if (inline) frame.srcdoc = await (await fetch(src)).text();
        else frame.src = src;
        document.body.append(frame);
        await loaded;
        frame.contentWindow?.postMessage(
          { type: 'run', id: 'probe', code: 'function probe() { return typeof indexedDB; }', functionName: 'probe', tests: [{ args: [] }], timeoutMs: 1000 },
          '*',
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        frame.remove();
        return messages.map((message) => (message as { type?: string }).type);
      },
      { src: runnerUrl, sandboxed, inline },
    );

  for (const inline of [false, true]) {
    // С sandbox песочница отвечает: так мы знаем, что проверка ниже не ложная.
    expect(await attempt(true, inline), inline ? 'srcdoc, sandbox' : 'src, sandbox').toEqual(['ready', 'result']);
    // Без sandbox у страницы источник сайта — она молчит и ничего не выполняет.
    expect(await attempt(false, inline), inline ? 'srcdoc без sandbox' : 'src без sandbox').toEqual([]);
  }
});

test('на телефоне есть строка символов над редактором', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'строка символов показывается только на сенсорных экранах');
  const lab = await hydrated(exerciseLab(page));
  const symbols = lab.getByRole('group', { name: 'Символы для набора кода' });
  await expect(symbols).toBeVisible();
  await lab.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await symbols.getByRole('button', { name: 'Вставить ;' }).click();
  await expect(lab.locator('.cm-line').last()).toHaveText(';');
});
