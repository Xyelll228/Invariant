import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { catalogTotals, modulesById, parseCatalog } from '../../src/content/catalog.ts';

const markdown = readFileSync(new URL('../../docs/catalog.md', import.meta.url), 'utf8');
const modulesYaml = readFileSync(new URL('../../content/modules.yaml', import.meta.url), 'utf8');
const catalog = parseCatalog(markdown, modulesYaml);

describe('каталог тем', () => {
  it('427 тем в 58 модулях и 7 разделах, как в ТЗ', () => {
    expect(catalogTotals(catalog)).toEqual({ sections: 7, modules: 58, topics: 427 });
  });

  it('число тем по разделам совпадает с таблицей ТЗ', () => {
    const bySection = catalog.sections.map((section) => [
      section.id,
      section.modules.length,
      section.modules.reduce((sum, module) => sum + module.topics.length, 0),
    ]);
    expect(bySection).toEqual([
      ['js', 5, 21],
      ['algo', 15, 150],
      ['db', 13, 75],
      ['cpp', 8, 59],
      ['py', 4, 37],
      ['math', 9, 46],
      ['interview', 4, 39],
    ]);
  });

  it('у каждого модуля из modules.yaml есть строка в каталоге, и id не повторяются', () => {
    const ids = catalog.sections.flatMap((section) => section.modules.map((module) => module.id));
    expect(new Set(ids).size).toBe(ids.length);
    const declared = Object.values((parseYaml(modulesYaml) as { modules: Record<string, string> }).modules);
    expect([...ids].sort()).toEqual([...declared].sort());
  });

  it('волна 1 — 59 тем: раздел 0, модуль «Сортировки», предпосылки и модуль 5.4', () => {
    const modules = modulesById(catalog);
    const sorting = modules.get('algo.sorting');
    expect(sorting?.title).toBe('Сортировки');
    expect(sorting?.topics).toHaveLength(19);
    expect(sorting?.waves).toEqual([1]);
    const firstWave =
      21 + // раздел 0
      19 + // сортировки
      8 + 2 + 2 + 2 + // предпосылки из 1.1, 1.2, 1.3, 1.7
      (modules.get('math.sums')?.topics.length ?? 0);
    expect(firstWave).toBe(59);
  });

  it('пометка (Г) снимается с названия и запоминается', () => {
    const analysis = modulesById(catalog).get('algo.analysis');
    const akra = analysis?.topics.find((topic) => topic.title.startsWith('метод Акры'));
    expect(akra).toEqual({ title: 'метод Акры–Бацци', depthOnly: true });
    const all = catalog.sections.flatMap((s) => s.modules.flatMap((m) => m.topics));
    // Столько же пометок «(Г)» в строках таблиц каталога.
    const marks = markdown.split('\n').filter((line) => line.startsWith('| ')).join('\n').match(/\(Г\)/g) ?? [];
    expect(all.filter((topic) => topic.depthOnly)).toHaveLength(marks.length);
    expect(marks.length).toBe(49);
  });

  it('экранирование Markdown снято: A*, *args, **kwargs', () => {
    const titles = catalog.sections.flatMap((s) => s.modules.flatMap((m) => m.topics.map((t) => t.title)));
    expect(titles).toContain('A*');
    expect(titles.some((title) => title.includes('*args, **kwargs'))).toBe(true);
    expect(titles.every((title) => !title.includes('\\'))).toBe(true);
  });
});
