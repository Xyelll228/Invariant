import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const script = join(repo, 'scripts', 'check-content.ts');

function run(cwd: string): { code: number | null; output: string } {
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

const fixture = mkdtempSync(join(tmpdir(), 'invariant-content-'));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function write(path: string, text: string): void {
  const full = join(fixture, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

describe('проверка контента', () => {
  it('контент репозитория проходит без ошибок', () => {
    const { code, output } = run(repo);
    expect(output).toContain('ошибок 0');
    expect(code).toBe(0);
  });

  it('ловит ошибки схемы, связей, шаблона, лицензий и текста', () => {
    mkdirSync(join(fixture, 'docs'), { recursive: true });
    mkdirSync(join(fixture, 'content'), { recursive: true });
    copyFileSync(join(repo, 'docs', 'catalog.md'), join(fixture, 'docs', 'catalog.md'));
    copyFileSync(join(repo, 'content', 'modules.yaml'), join(fixture, 'content', 'modules.yaml'));
    write('content/ru/glossary/x.yaml', 'id: term.x\nversion: 1\nterm: икс\nen: x\ndefinition: Очевидно, это икс.\nforbidden: [стабильная сортировка]\n');
    write(
      'content/ru/algorithms/sorting/a/topic.yaml',
      [
        'id: algo.sorting.a',
        'version: 1',
        'title: Тема А',
        'module: algo.sorting',
        'kind: concept',
        'levels: [fundament]',
        'summary: Кратко.',
        'prerequisites: [{ topic: algo.sorting.b, level: base }]',
        'terms: [term.x, term.nope]',
        "review: { status: auto, date: '2026-10-24' }",
      ].join('\n'),
    );
    write(
      'content/ru/algorithms/sorting/b/topic.yaml',
      [
        'id: algo.sorting.b',
        'version: 1',
        'title: Тема Б',
        'module: algo.sorting',
        'kind: concept',
        'levels: [base]',
        'summary: Кратко.',
        'prerequisites: [{ topic: algo.sorting.a, level: fundament }]',
        'terms: [term.x]',
        "review: { status: draft, date: '2026-10-24' }",
      ].join('\n'),
    );
    write(
      'content/ru/algorithms/sorting/a/fundament.mdx',
      [
        '---',
        'level: fundament',
        'version: 1',
        '---',
        '',
        '<Block id="algo.sorting.a.b.one" kind="explanation" version={1} title="Раз">',
        '',
        'Здесь нет стабильной сортировки.',
        '',
        '</Block>',
        '',
        '<Block id="algo.sorting.a.b.one" kind="weird" title="Два">',
        '',
        'Текст.',
        '',
        '</Block>',
      ].join('\n'),
    );
    write(
      'content/ru/algorithms/sorting/a/sources.yaml',
      [
        'topic: algo.sorting.a',
        "basedOn: 'Основано на: книга.'",
        'sources:',
        "  - { id: book, title: Книга, authors: [Автор], url: 'https://example.org/', license: CC-BY-NC-SA-4.0, use: adapted }",
      ].join('\n'),
    );

    const { code, output } = run(fixture);
    expect(code).toBe(1);
    for (const expected of [
      'цикл в предпосылках: algo.sorting.a → algo.sorting.b → algo.sorting.a',
      'термина term.nope нет в глоссарии',
      'id algo.sorting.a.b.one уже занят',
      'неизвестный вид блока «weird»',
      'нет версии version={1}',
      'нет обязательного блока «Частые ошибки и заблуждения»',
      'запрещённый вариант «стабильной сортировки»',
      'лицензия CC-BY-NC-SA-4.0 с ограничением NC или ND',
      '«очевидно» запрещено',
      'нет questions.yaml',
    ]) {
      expect(output).toContain(expected);
    }
    // Неполнота черновика — предупреждение, а не ошибка.
    expect(output).toMatch(/b\/topic\.yaml\n\s+предупреждение: нет файла уровня base\.mdx/);
  });
});
