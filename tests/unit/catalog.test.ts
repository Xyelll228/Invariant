import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { catalogTotals, modulesById, parseCatalog, topicsById } from '../../src/content/catalog.ts';
import { blockPath, levelPath, modulePath, sectionFolders, sectionPath, topicPath } from '../../src/content/paths.ts';

const markdown = readFileSync(new URL('../../docs/catalog.md', import.meta.url), 'utf8');
const modulesYaml = readFileSync(new URL('../../content/modules.yaml', import.meta.url), 'utf8');
const topicsYaml = readFileSync(new URL('../../content/topics.yaml', import.meta.url), 'utf8');
const catalog = parseCatalog(markdown, modulesYaml, topicsYaml);

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
    const firstWave = [...topicsById(catalog).values()].filter((topic) => topic.wave === 1);
    expect(firstWave).toHaveLength(59);
    // Предпосылки из модулей 1.1, 1.2, 1.3 и 1.7 — по списку ТЗ «Темы-предпосылки волны 1».
    const prerequisites = firstWave.filter((topic) => ['algo.analysis', 'algo.linear', 'algo.recursion', 'algo.trees'].includes(topic.module.id));
    expect(prerequisites.map((topic) => topic.id)).toEqual([
      'algo.analysis.algorithm',
      'algo.analysis.ram-model',
      'algo.analysis.asymptotics',
      'algo.analysis.cases',
      'algo.analysis.code-complexity',
      'algo.analysis.space',
      'algo.analysis.doubling',
      'algo.analysis.recurrences',
      'algo.linear.array',
      'algo.linear.linked-list',
      'algo.recursion.basics',
      'algo.recursion.divide-conquer',
      'algo.trees.terms',
      'algo.trees.binary-heap',
    ]);
    expect(firstWave.filter((topic) => topic.module.section.id === 'js')).toHaveLength(21);
    expect(firstWave.filter((topic) => topic.module.id === 'math.sums')).toHaveLength(5);
  });

  it('у каждой темы постоянный id из content/topics.yaml, id не повторяются', () => {
    const topics = [...topicsById(catalog).values()];
    expect(topics).toHaveLength(427);
    expect(topics.every((topic) => topic.id === `${topic.module.id}.${topic.slug}`)).toBe(true);
    expect(topicsById(catalog).get('algo.sorting.insertion')?.title).toBe('вставками и бинарными вставками');
  });

  it('расхождение каталога и content/topics.yaml — ошибка с понятным текстом', () => {
    const renamed = topicsYaml.replace("title: 'пузырьком'", "title: 'пузырька'");
    expect(() => parseCatalog(markdown, modulesYaml, renamed)).toThrow(/в каталоге «пузырьком», в content\/topics.yaml «пузырька»/);
    const noWave = topicsYaml.replace("title: 'Массив и доступ по индексу за O(1)', wave: 1", "title: 'Массив и доступ по индексу за O(1)'");
    expect(() => parseCatalog(markdown, modulesYaml, noWave)).toThrow(/волна не указана/);
  });

  it('адреса страниц строятся из id: тема, первый уровень по адресу темы, блок с якорем', () => {
    const folders = sectionFolders(catalog);
    expect(sectionPath('algo', folders)).toBe('ru/algorithms/');
    expect(modulePath('algo.sorting', folders)).toBe('ru/algorithms/sorting/');
    expect(topicPath('algo.sorting.insertion', folders)).toBe('ru/algorithms/sorting/insertion/');
    const levels = ['fundament', 'base', 'depth'] as const;
    expect(levelPath('algo.sorting.insertion', 'fundament', levels, folders)).toBe('ru/algorithms/sorting/insertion/');
    expect(levelPath('algo.sorting.insertion', 'base', levels, folders)).toBe('ru/algorithms/sorting/insertion/base/');
    expect(levelPath('algo.sorting.hybrid', 'depth', ['depth'], folders)).toBe('ru/algorithms/sorting/hybrid/');
    expect(blockPath('algo.sorting.insertion.b.idea', 'fundament', levels, folders)).toBe(
      'ru/algorithms/sorting/insertion/#algo.sorting.insertion.b.idea',
    );
    expect(topicPath('interview.system-design.caching', folders)).toBe('ru/interview/system-design/caching/');
  });

  it('пометка (Г) снимается с названия и запоминается', () => {
    const analysis = modulesById(catalog).get('algo.analysis');
    const akra = analysis?.topics.find((topic) => topic.title.startsWith('метод Акры'));
    expect(akra).toMatchObject({ id: 'algo.analysis.akra-bazzi', title: 'метод Акры–Бацци', depthOnly: true, wave: 2 });
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
