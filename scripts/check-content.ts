#!/usr/bin/env node
/**
 * Проверка учебного контента (ТЗ, раздел «Качество», автопроверки
 * «Схема контента», «Текст», «Лицензии»):
 *
 * - схема topic.yaml, файлов уровней, questions.yaml, sources.yaml и глоссария;
 * - постоянные идентификаторы: формат, принадлежность теме, отсутствие повторов;
 * - связи: модуль из каталога, папка темы, предпосылки без циклов, термины в глоссарии;
 * - шаблон темы: обязательные блоки по уровням, вопросы, источники, код для алгоритмов;
 * - лицензии источников: основой текста может быть только совместимая лицензия, NC и ND запрещены;
 * - правила написания: длина предложений, «очевидно», восклицательные знаки, запрещённые варианты терминов.
 *
 * Неполнота черновика (review.status: draft) — предупреждение, у опубликованной
 * темы — ошибка. Остальное — всегда ошибка.
 *
 * Запуск: npm run check:content
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { z } from 'astro/zod';
import { catalogTotals, modulesById, parseCatalog, topicsById } from '../src/content/catalog.ts';
import { MDX_COMPONENTS } from '../src/content/components.ts';
import {
  READY_MIN_MUTANTS,
  READY_MIN_PRE_QUESTIONS,
  READY_MIN_QUESTIONS,
  READY_MIN_TYPES,
  childIdPrefix,
  findCycle,
  levelSteps,
  requiredBlocks,
  requiredCheckTypes,
  requiredSteps,
  skippedBlocks,
} from '../src/content/rules.ts';
import { prepareTopic, PrepareError, type MutantLike } from '../src/content/prepare.ts';
import { DELAYED_QUESTIONS } from '../src/lib/learning/progress.ts';
import { createRandom } from '../src/lib/random.ts';
import {
  ADAPTABLE_LICENSES,
  BLOCK_KINDS,
  BLOCK_TITLES,
  LEVELS,
  LEVEL_TITLES,
  REFERENCE_LICENSES,
  STEP_TITLES,
  TYPE_FORMATS,
  type Level,
  type QuestionsFile,
  type Step,
  type Term,
  type Topic,
  levelFrontmatterSchema,
  questionsFileSchema,
  sourcesFileSchema,
  termSchema,
  topicSchema,
} from '../src/content/schema.ts';
import { checkProse, parseMdx, type ProseFragment } from '../src/content/text.ts';
import { arrayAlgorithms } from '../src/lib/viz/algorithms.ts';

type Severity = 'error' | 'warning';
interface Problem {
  severity: Severity;
  file: string;
  line?: number;
  message: string;
}

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content', 'ru');
const GLOSSARY = join(CONTENT, 'glossary');
const problems: Problem[] = [];

function rel(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

function report(severity: Severity, file: string, message: string, line?: number): void {
  problems.push({ severity, file: rel(file), message, ...(line ? { line } : {}) });
}

function readYaml(file: string): unknown {
  try {
    return parseYaml(readFileSync(file, 'utf8'));
  } catch (error) {
    report('error', file, `YAML не разобрать: ${(error as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

function validate<T>(schema: z.ZodType<T>, data: unknown, file: string): T | undefined {
  if (data === undefined) return undefined;
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.') || '(весь файл)';
    report('error', file, `${path}: ${issue.message}`);
  }
  return undefined;
}

function proseOf(...texts: (string | undefined)[]): ProseFragment[] {
  return texts.filter((text): text is string => Boolean(text)).map((text) => ({ text, line: 0 }));
}

// ---------- каталог ----------

let catalog;
try {
  catalog = parseCatalog(
    readFileSync(join(ROOT, 'docs', 'catalog.md'), 'utf8'),
    readFileSync(join(ROOT, 'content', 'modules.yaml'), 'utf8'),
    readFileSync(join(ROOT, 'content', 'topics.yaml'), 'utf8'),
  );
} catch (error) {
  console.log(`\ndocs/catalog.md, content/modules.yaml, content/topics.yaml\n  ошибка: ${(error as Error).message}`);
  process.exit(1);
}
const totals = catalogTotals(catalog);
if (totals.modules !== 58 || totals.topics !== 427) {
  report('error', join(ROOT, 'docs', 'catalog.md'), `в каталоге ${totals.modules} модулей и ${totals.topics} тем, по ТЗ — 58 и 427; каталог можно дополнять, но тогда обновите это число`);
}
const modules = modulesById(catalog);
const registry = topicsById(catalog);

// ---------- глоссарий ----------

const terms = new Map<string, Term>();
const forbiddenVariants: { variant: string; term: string }[] = [];

if (existsSync(GLOSSARY)) {
  for (const name of readdirSync(GLOSSARY).sort()) {
    const file = join(GLOSSARY, name);
    if (!name.endsWith('.yaml')) {
      report('error', file, 'в папке глоссария только файлы .yaml');
      continue;
    }
    const term = validate(termSchema, readYaml(file), file);
    if (!term) continue;
    if (!term.id.startsWith('term.')) report('error', file, `id термина начинается с «term.»: ${term.id}`);
    if (name !== `${term.id.slice('term.'.length)}.yaml`) {
      report('error', file, `имя файла должно быть ${term.id.slice('term.'.length)}.yaml — по id термина`);
    }
    if (terms.has(term.id)) report('error', file, `термин ${term.id} уже есть`);
    terms.set(term.id, term);
    for (const variant of term.forbidden) forbiddenVariants.push({ variant, term: term.term });
    for (const problem of checkProse(proseOf(term.definition, term.example))) report('error', file, problem.message);
  }
}

// ---------- темы ----------

interface LoadedTopic {
  topic: Topic;
  dir: string;
  file: string;
  blockIds: Set<string>;
  /** Уровень каждого блока: задание ставится после блока своего уровня. */
  blockLevels: Map<string, Level>;
}

const topics = new Map<string, LoadedTopic>();
const globalIds = new Map<string, string>();

function claimId(id: string, file: string): void {
  const owner = globalIds.get(id);
  if (owner) report('error', file, `id ${id} уже занят в ${owner}`);
  else globalIds.set(id, rel(file));
}

function findTopicDirs(dir: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory() || full === GLOSSARY) continue;
    if (existsSync(join(full, 'topic.yaml'))) result.push(full);
    else {
      const files = readdirSync(full).filter((child) => statSync(join(full, child)).isFile());
      if (files.length > 0) report('error', full, `в папке есть файлы (${files.join(', ')}), но нет topic.yaml`);
      result.push(...findTopicDirs(full));
    }
  }
  return result;
}

const topicDirs = existsSync(CONTENT) ? findTopicDirs(CONTENT) : [];

for (const dir of topicDirs) {
  const file = join(dir, 'topic.yaml');
  const topic = validate(topicSchema, readYaml(file), file);
  if (!topic) continue;
  if (topics.has(topic.id)) {
    report('error', file, `тема ${topic.id} уже есть в ${rel(topics.get(topic.id)?.dir ?? '')}`);
    continue;
  }
  claimId(topic.id, file);
  topics.set(topic.id, { topic, dir, file, blockIds: new Set(), blockLevels: new Map() });
}

for (const loaded of topics.values()) {
  const { topic, dir, file } = loaded;
  const draft = topic.review.status === 'draft';
  const incomplete: Severity = draft ? 'warning' : 'error';

  // Модуль и папка
  const module = modules.get(topic.module);
  const parts = relative(CONTENT, dir).split(sep);
  if (!module) {
    report('error', file, `модуля ${topic.module} нет в каталоге (content/modules.yaml)`);
  } else {
    const expected = `${module.section.folder}/${topic.module.split('.')[1]}/<папка темы>`;
    if (parts.length !== 3 || parts[0] !== module.section.folder || parts[1] !== topic.module.split('.')[1]) {
      report('error', file, `тема модуля ${topic.module} должна лежать в content/ru/${expected}`);
    }
  }
  if (!topic.id.startsWith(`${topic.module}.`)) report('error', file, `id темы начинается с id модуля: ${topic.module}.…`);

  // Тема каталога: id из content/topics.yaml и уровни по пометкам каталога
  const listed = registry.get(topic.id);
  if (!listed) {
    report('error', file, `темы ${topic.id} нет в content/topics.yaml: id темы берётся оттуда`);
  } else {
    const expected: Level[] = listed.depthOnly
      ? ['depth']
      : listed.module.section.id === 'js'
        ? ['fundament', 'base']
        : ['fundament', 'base', 'depth'];
    if (topic.levels.join(',') !== expected.join(',')) {
      const why = listed.depthOnly ? 'тема с пометкой (Г) — только Глубина' : listed.module.section.id === 'js' ? 'в разделе 0 — Фундамент и База' : 'у темы три уровня';
      report('error', file, `levels: [${topic.levels.join(', ')}], а нужно [${expected.join(', ')}] — ${why}`);
    }
  }

  // Уровни
  const order = topic.levels.map((level) => LEVELS.indexOf(level));
  if (new Set(topic.levels).size !== topic.levels.length || order.some((value, index) => index > 0 && value <= (order[index - 1] ?? -1))) {
    report('error', file, 'levels: уровни без повторов и по порядку: fundament, base, depth');
  }
  for (const problem of checkProse(proseOf(topic.summary, topic.title), forbiddenVariants)) report('error', file, problem.message);

  for (const level of LEVELS) {
    const levelFile = join(dir, `${level}.mdx`);
    const exists = existsSync(levelFile);
    if (!topic.levels.includes(level)) {
      if (exists) report('error', levelFile, `уровня «${LEVEL_TITLES[level]}» нет в levels темы`);
      continue;
    }
    if (!exists) {
      report(incomplete, file, `нет файла уровня ${level}.mdx`);
      continue;
    }
    let parsed;
    try {
      parsed = parseMdx(readFileSync(levelFile, 'utf8'));
    } catch (error) {
      report('error', levelFile, `MDX не собрать: ${(error as Error).message}`);
      continue;
    }
    const frontmatter = validate(levelFrontmatterSchema, parsed.frontmatter === null ? {} : parseYaml(parsed.frontmatter), levelFile);
    if (frontmatter && frontmatter.level !== level) report('error', levelFile, `level в начале файла — ${frontmatter.level}, а файл — ${level}.mdx`);

    for (const component of new Set(parsed.components)) {
      if (!(MDX_COMPONENTS as readonly string[]).includes(component)) {
        report('error', levelFile, `компонента <${component}> нет в списке src/content/components.ts`);
      }
    }
    for (const usage of parsed.usages) {
      const at = usage.line;
      if (usage.name === 'Term') {
        const id = usage.attributes.id;
        if (!id) report('error', levelFile, '<Term> без атрибута id="term.…"', at);
        else if (!terms.has(id)) report('error', levelFile, `<Term id="${id}">: такого термина нет в глоссарии`, at);
        else if (!topic.terms.includes(id)) report('error', levelFile, `<Term id="${id}">: добавьте термин в terms темы`, at);
        if (!usage.text) report('error', levelFile, '<Term> без текста внутри', at);
      } else if (usage.name === 'TopicCode') {
        if (topic.kind !== 'algorithm' || !topic.code) report('error', levelFile, '<TopicCode /> — только у алгоритма с полем code в topic.yaml', at);
      } else if (['TraceSteps', 'ArrayTrace', 'ArraySimulation'].includes(usage.name)) {
        const algorithm = usage.attributes.algorithm;
        if (!algorithm || !(algorithm in arrayAlgorithms)) {
          report('error', levelFile, `<${usage.name} algorithm="${algorithm ?? ''}">: такого эталона нет в src/lib/viz/algorithms.ts`, at);
        }
        let input: unknown;
        try {
          input = JSON.parse(usage.attributes.input ?? '');
        } catch {
          input = undefined;
        }
        if (!Array.isArray(input) || !input.every((value) => Number.isInteger(value))) {
          report('error', levelFile, `<${usage.name}>: input={[…]} — массив целых чисел`, at);
        } else if (usage.name === 'ArraySimulation' && (input.length < 5 || input.length > 8)) {
          report('error', levelFile, `<ArraySimulation>: для ручной работы 5–8 элементов, сейчас ${input.length}`, at);
        }
      }
    }

    const present = new Set<string>();
    for (const block of parsed.blocks) {
      if (!block.id.startsWith(childIdPrefix(topic.id, 'b'))) {
        report('error', levelFile, `id блока начинается с ${childIdPrefix(topic.id, 'b')}: «${block.id}»`, block.line);
      } else {
        claimId(block.id, levelFile);
        loaded.blockIds.add(block.id);
        loaded.blockLevels.set(block.id, level);
      }
      if (!(BLOCK_KINDS as readonly string[]).includes(block.kind)) {
        report('error', levelFile, `неизвестный вид блока «${block.kind}»; допустимы: ${BLOCK_KINDS.join(', ')}`, block.line);
      }
      if (block.version === null || block.version < 1) report('error', levelFile, `у блока ${block.id} нет версии version={1}`, block.line);
      if (!block.title.trim()) report('error', levelFile, `у блока ${block.id} нет заголовка title`, block.line);
      present.add(block.kind);
    }

    const skipped = skippedBlocks(topic, level);
    for (const kind of requiredBlocks(topic, level)) {
      if (!present.has(kind) && !skipped.has(kind)) {
        report(incomplete, levelFile, `нет обязательного блока «${BLOCK_TITLES[kind]}» (kind="${kind}")`);
      }
    }
    for (const problem of checkProse(parsed.prose, forbiddenVariants)) report('error', levelFile, problem.message, problem.line);
  }

  // Термины
  if (topic.terms.length === 0) report(incomplete, file, 'terms: у темы нет терминов со ссылками в глоссарий');
  for (const term of topic.terms) {
    if (!terms.has(term)) report('error', file, `terms: термина ${term} нет в глоссарии content/ru/glossary/`);
  }

  // Код и свойства для алгоритмов
  if (topic.kind === 'algorithm') {
    for (const name of ['reference.ts', 'mutants.ts', 'vectors.json', 'impl.cpp', 'impl.py', 'generators.ts']) {
      if (!existsSync(join(dir, name))) report(incomplete, file, `у алгоритма нет файла ${name}`);
    }
    if (!topic.code) report(incomplete, file, 'code: не указано, как запускать версии кода при проверке');
    if (!topic.complexity) report(incomplete, file, 'complexity: не указана сложность — её проверяет эксперимент удвоения');
    if (existsSync(join(dir, 'mutants.ts'))) {
      const { mutants } = (await import(pathToFileURL(join(dir, 'mutants.ts')).href)) as { mutants?: unknown[] };
      if (!Array.isArray(mutants)) report('error', join(dir, 'mutants.ts'), 'нет экспорта mutants');
      else if (mutants.length < READY_MIN_MUTANTS) report(incomplete, join(dir, 'mutants.ts'), `мутантов ${mutants.length}, нужно не меньше ${READY_MIN_MUTANTS}`);
    }
  }
}

// ---------- связи между темами ----------

const prerequisiteEdges = new Map<string, string[]>();
for (const { topic, file } of topics.values()) {
  prerequisiteEdges.set(topic.id, topic.prerequisites.map((item) => item.topic));
  const references: [string, string[]][] = [
    ['prerequisites', topic.prerequisites.map((item) => item.topic)],
    ['related', topic.related],
    ['confusableWith', topic.confusableWith],
  ];
  const wave = registry.get(topic.id)?.wave;
  for (const [field, ids] of references) {
    for (const id of ids) {
      if (id === topic.id) report('error', file, `${field}: тема ссылается сама на себя`);
      else if (!registry.has(id)) report('error', file, `${field}: темы ${id} нет в каталоге (content/topics.yaml)`);
      else if (!topics.has(id)) report('warning', file, `${field}: тема ${id} ещё не написана (волна ${registry.get(id)?.wave})`);
    }
  }
  for (const prerequisite of topic.prerequisites) {
    const target = registry.get(prerequisite.topic);
    // Тема-предпосылка выходит вместе с первой темой, которой она нужна (ТЗ, «Каталог тем»).
    if (target && wave !== undefined && target.wave > wave) {
      report('error', file, `prerequisites: ${prerequisite.topic} выходит в волне ${target.wave}, а эта тема — в волне ${wave}; предпосылка должна выйти не позже — перенос темы между волнами решает владелец`);
    }
  }
  for (const prerequisite of topic.prerequisites) {
    const target = topics.get(prerequisite.topic);
    if (target && !target.topic.levels.includes(prerequisite.level)) {
      report('error', file, `prerequisites: у темы ${prerequisite.topic} нет уровня ${prerequisite.level}`);
    }
  }
}
const cycle = findCycle(prerequisiteEdges);
if (cycle) report('error', join(CONTENT), `цикл в предпосылках: ${cycle.join(' → ')}`);

for (const term of terms.values()) {
  const file = join(GLOSSARY, `${term.id.slice('term.'.length)}.yaml`);
  if (term.topic && !registry.has(term.topic)) report('error', file, `topic: темы ${term.topic} нет в каталоге (content/topics.yaml)`);
  else if (term.topic && !topics.has(term.topic)) report('warning', file, `topic: тема ${term.topic} ещё не написана`);
  for (const other of term.confusedWith) {
    if (!terms.has(other)) report('error', file, `confusedWith: термина ${other} нет в глоссарии`);
  }
}

// ---------- вопросы ----------

for (const loaded of topics.values()) {
  const { topic, dir, file: topicFile } = loaded;
  const draft = topic.review.status === 'draft';
  const incomplete: Severity = draft ? 'warning' : 'error';
  const file = join(dir, 'questions.yaml');
  if (!existsSync(file)) {
    report(incomplete, topicFile, 'нет questions.yaml: вопросов и заданий');
    continue;
  }
  const data: QuestionsFile | undefined = validate(questionsFileSchema, readYaml(file), file);
  if (!data) continue;
  if (data.topic !== topic.id) report('error', file, `topic: ${data.topic}, а тема — ${topic.id}`);

  const skills = new Map<string, Level>();
  for (const skill of data.skills) {
    if (!skill.id.startsWith(childIdPrefix(topic.id, 's'))) report('error', file, `id навыка начинается с ${childIdPrefix(topic.id, 's')}: ${skill.id}`);
    claimId(skill.id, file);
    skills.set(skill.id, skill.level);
    if (!topic.levels.includes(skill.level)) report('error', file, `навык ${skill.id}: у темы нет уровня ${skill.level}`);
    for (const problem of checkProse(proseOf(skill.title), forbiddenVariants)) report('error', file, problem.message);
  }
  const misconceptions = new Set<string>();
  for (const item of data.misconceptions) {
    if (!item.id.startsWith(childIdPrefix(topic.id, 'm'))) report('error', file, `id заблуждения начинается с ${childIdPrefix(topic.id, 'm')}: ${item.id}`);
    claimId(item.id, file);
    misconceptions.add(item.id);
    if (item.block && !loaded.blockIds.has(item.block)) report('error', file, `заблуждение ${item.id}: блока ${item.block} нет в текстах темы`);
    if (item.prerequisite && !registry.has(item.prerequisite)) report('error', file, `заблуждение ${item.id}: темы ${item.prerequisite} нет в каталоге`);
    for (const problem of checkProse(proseOf(item.text, item.explanation), forbiddenVariants)) report('error', file, problem.message);
  }

  let generators: Record<string, unknown> = {};
  if (data.questions.some((question) => question.format === 'generated')) {
    const generatorsFile = join(dir, 'generators.ts');
    if (!existsSync(generatorsFile)) report('error', file, 'есть задания с генератором, но нет generators.ts');
    else generators = (await import(pathToFileURL(generatorsFile).href)) as Record<string, unknown>;
  }
  let mutants: MutantLike[] = [];
  if (existsSync(join(dir, 'mutants.ts'))) {
    mutants = ((await import(pathToFileURL(join(dir, 'mutants.ts')).href)) as { mutants?: typeof mutants }).mutants ?? [];
  }

  const checkOptions = (id: string, options: readonly { text: string; correct?: boolean; misconception?: string }[], computed: boolean, multiple = false): void => {
    if (!computed) {
      const correct = options.filter((option) => option.correct).length;
      if (!multiple && correct !== 1) report('error', file, `вопрос ${id}: верных вариантов ${correct}, нужен ровно один`);
      if (multiple && correct < 1) report('error', file, `вопрос ${id}: нет ни одного верного варианта`);
    } else if (options.some((option) => option.correct !== undefined)) {
      report('error', file, `вопрос ${id}: у задания «Что выведет код» верный вариант вычисляет запуск кода — уберите correct`);
    }
    const texts = options.map((option) => option.text);
    if (new Set(texts).size !== texts.length) report('error', file, `вопрос ${id}: варианты повторяются`);
    for (const option of options) {
      if (!computed && !option.correct && !option.misconception) report('error', file, `вопрос ${id}: у неверного варианта «${option.text}» нет заблуждения`);
      if (option.misconception && !misconceptions.has(option.misconception)) report('error', file, `вопрос ${id}: заблуждения ${option.misconception} нет в misconceptions`);
    }
  };

  interface LevelStats {
    total: number;
    types: Set<string>;
    pre: number;
    free: number;
    graded: number;
    steps: Set<number>;
    checkTypes: Set<string>;
    checkFree: boolean;
  }
  const perLevel = new Map<Level, LevelStats>();
  for (const question of data.questions) {
    const id = question.id;
    if (!id.startsWith(childIdPrefix(topic.id, 'q'))) report('error', file, `id вопроса начинается с ${childIdPrefix(topic.id, 'q')}: ${id}`);
    claimId(id, file);
    if (!topic.levels.includes(question.level)) report('error', file, `вопрос ${id}: у темы нет уровня ${question.level}`);

    // Роль, шаг, навык и место на странице
    if (question.role === 'pre') {
      if (question.step !== undefined && question.step !== 0) report('error', file, `вопрос ${id}: предвопрос — шаг 0`);
    } else {
      if (question.role === 'practice' && (question.step === undefined || question.step < 1)) report('error', file, `вопрос ${id}: укажите шаг цикла step: 1–6`);
      if (question.role === 'check' && question.step !== undefined) report('error', file, `вопрос ${id}: у итоговой проверки шага нет`);
      if (!question.skill) report('error', file, `вопрос ${id}: нет навыка skill — ответ не попадёт в повторение`);
    }
    if (question.skill) {
      const level = skills.get(question.skill);
      if (!level) report('error', file, `вопрос ${id}: навыка ${question.skill} нет в skills`);
      else if (level !== question.level) report('error', file, `вопрос ${id}: навык ${question.skill} — с уровня ${level}, а вопрос — с уровня ${question.level}`);
    }
    if (question.block) {
      const level = loaded.blockLevels.get(question.block);
      if (!level) report('error', file, `вопрос ${id}: блока ${question.block} нет в текстах темы`);
      else if (level !== question.level) report('error', file, `вопрос ${id}: блок ${question.block} — на уровне ${level}, а вопрос — ${question.level}`);
      if (question.role !== 'practice') report('error', file, `вопрос ${id}: после блока ставятся только задания по ходу темы (role: practice)`);
    }
    if (!TYPE_FORMATS[question.type].includes(question.format)) {
      report('error', file, `вопрос ${id}: тип «${question.type}» отвечается в форматах ${TYPE_FORMATS[question.type].join(', ')}, а не ${question.format}`);
    }
    for (const hint of question.hints) for (const problem of checkProse(proseOf(hint), forbiddenVariants)) report('error', file, problem.message);
    if (question.explanation) for (const problem of checkProse(proseOf(question.explanation), forbiddenVariants)) report('error', file, problem.message);

    // Формат ответа
    let format: string = question.format;
    switch (question.format) {
      case 'choice':
        checkOptions(id, question.options, question.type === 'output', question.multiple);
        if (question.type === 'output' && !question.code) report('error', file, `вопрос ${id}: у задания «Что выведет код» нет кода code`);
        for (const problem of checkProse(proseOf(question.prompt), forbiddenVariants)) report('error', file, problem.message);
        break;
      case 'free':
        if (question.type === 'output') {
          if (!question.code) report('error', file, `вопрос ${id}: у задания «Что выведет код» нет кода code`);
          if (question.answers) report('error', file, `вопрос ${id}: ответ задания «Что выведет код» вычисляет запуск кода — уберите answers`);
        } else if (!question.answers) report('error', file, `вопрос ${id}: нет верных ответов answers`);
        for (const problem of checkProse(proseOf(question.prompt), forbiddenVariants)) report('error', file, problem.message);
        break;
      case 'order': {
        const itemTexts = new Set(question.items.map((item) => item.text));
        for (const distractor of question.distractors) {
          if (itemTexts.has(distractor)) report('error', file, `вопрос ${id}: лишняя строка «${distractor}» совпадает со строкой ответа`);
        }
        if (new Set(question.distractors).size !== question.distractors.length) report('error', file, `вопрос ${id}: лишние строки повторяются`);
        if (question.type === 'parsons' && !question.function && question.language === 'js') {
          report('error', file, `вопрос ${id}: у задачи Парсонса на JS укажите function, solution и тесты — собранный код запускается при сборке`);
        }
        for (const variant of question.alternatives) {
          if (variant.length !== question.items.length || new Set(variant).size !== variant.length || variant.some((item) => item >= question.items.length)) {
            report('error', file, `вопрос ${id}: alternatives — перестановки номеров строк items`);
          }
        }
        for (const problem of checkProse(proseOf(question.prompt), forbiddenVariants)) report('error', file, problem.message);
        break;
      }
      case 'code':
        if (question.solution === 'reference' && !topic.code) report('error', file, `вопрос ${id}: solution: reference — у темы нет эталона (code в topic.yaml)`);
        if (question.hidden === 'vectors' && !existsSync(join(dir, 'vectors.json'))) report('error', file, `вопрос ${id}: hidden: vectors — у темы нет vectors.json`);
        for (const problem of checkProse(proseOf(question.prompt), forbiddenVariants)) report('error', file, problem.message);
        break;
      case 'line': {
        const mutant = mutants.find((item) => item.id === question.mutant);
        if (!mutant) report('error', file, `вопрос ${id}: испорченной версии ${question.mutant} нет в mutants.ts`);
        else if (!mutant.code || !mutant.bugLine) report('error', file, `вопрос ${id}: у испорченной версии ${question.mutant} нет кода code и строки bugLine`);
        checkOptions(id, question.reasons, false);
        for (const problem of checkProse(proseOf(question.prompt), forbiddenVariants)) report('error', file, problem.message);
        break;
      }
      case 'self':
        for (const problem of checkProse(proseOf(question.prompt, question.reference, ...question.criteria), forbiddenVariants)) report('error', file, problem.message);
        break;
      case 'simulation':
        if (!(question.algorithm in arrayAlgorithms)) report('error', file, `вопрос ${id}: эталона ${question.algorithm} нет в src/lib/viz/algorithms.ts`);
        break;
      case 'generated': {
        const generate = generators[question.generator];
        if (typeof generate !== 'function') {
          report('error', file, `вопрос ${id}: в generators.ts нет функции ${question.generator}`);
          break;
        }
        try {
          const variant = (generate as (random: ReturnType<typeof createRandom>) => { format?: string })(createRandom(1));
          format = variant.format ?? 'choice';
          if (!TYPE_FORMATS[question.type].includes(format as never) && format !== 'generated') {
            report('error', file, `вопрос ${id}: генератор даёт формат ${format}, а тип «${question.type}» отвечается в форматах ${TYPE_FORMATS[question.type].join(', ')}`);
          }
        } catch (error) {
          report('error', file, `вопрос ${id}: генератор ${question.generator} упал: ${(error as Error).message}`);
        }
        break;
      }
    }

    const stats: LevelStats = perLevel.get(question.level) ?? { total: 0, types: new Set(), pre: 0, free: 0, graded: 0, steps: new Set(), checkTypes: new Set(), checkFree: false };
    stats.total++;
    stats.types.add(question.type);
    if (format === 'free') stats.free++;
    if (question.role === 'pre') {
      stats.pre++;
      stats.steps.add(0);
    } else {
      stats.graded++;
      if (question.role === 'practice' && question.step !== undefined) stats.steps.add(question.step);
      if (question.role === 'check') {
        stats.checkTypes.add(question.type);
        if (format === 'free') stats.checkFree = true;
      }
    }
    perLevel.set(question.level, stats);
  }

  // Вычислимое — вычисляется: ответы «Что выведет код», тесты по эталону, код испорченной версии.
  try {
    const reference = topic.code && existsSync(join(dir, 'reference.ts')) ? ((await import(pathToFileURL(join(dir, 'reference.ts')).href)) as Record<string, unknown>) : undefined;
    const vectors = existsSync(join(dir, 'vectors.json')) ? ((JSON.parse(readFileSync(join(dir, 'vectors.json'), 'utf8')) as { inputs?: unknown[][] }).inputs ?? []) : [];
    prepareTopic({ topic, dir: relative(CONTENT, dir), questions: data, levelPaths: {}, blockPaths: new Map(), reference, mutants, vectors });
  } catch (error) {
    if (error instanceof PrepareError) report('error', file, `вопрос ${error.message}`);
    else report('error', file, `задания не подготовить: ${(error as Error).message}`);
  }

  for (const level of topic.levels) {
    const stats = perLevel.get(level) ?? { total: 0, types: new Set<string>(), pre: 0, free: 0, graded: 0, steps: new Set<number>(), checkTypes: new Set<string>(), checkFree: false };
    const title = LEVEL_TITLES[level];
    if (stats.total < READY_MIN_QUESTIONS) report(incomplete, file, `${title}: заданий ${stats.total}, нужно не меньше ${READY_MIN_QUESTIONS}`);
    if (stats.types.size < READY_MIN_TYPES) report(incomplete, file, `${title}: типов заданий ${stats.types.size}, нужно не меньше ${READY_MIN_TYPES}`);
    if (stats.free === 0) report(incomplete, file, `${title}: нет задания со свободным вводом`);
    if (stats.pre < READY_MIN_PRE_QUESTIONS) report(incomplete, file, `${title}: предвопросов ${stats.pre}, нужно не меньше ${READY_MIN_PRE_QUESTIONS}`);
    for (const step of levelSteps(topic, level)) {
      if (!stats.steps.has(step)) report(incomplete, file, `${title}: нет заданий шага ${step} «${STEP_TITLES[step]}» — добавьте или пропустите шаг с причиной (skippedSteps)`);
    }
    for (const item of topic.skippedSteps.filter((entry) => entry.levels.includes(level))) {
      if (!requiredSteps(level).includes(item.step as Step)) report('error', topicFile, `skippedSteps: шага ${item.step} на уровне «${title}» и так нет`);
    }
    if (stats.checkTypes.size === 0) report(incomplete, file, `${title}: нет итоговой проверки — заданий с role: check`);
    else {
      if (!stats.checkFree) report(incomplete, file, `${title}: в итоговой проверке нет свободного ввода`);
      for (const type of requiredCheckTypes(topic, level).filter((type) => type !== 'free')) {
        if (!stats.checkTypes.has(type)) report(incomplete, file, `${title}: в итоговой проверке алгоритма нет задания «${type === 'parsons' ? 'сборка кода из строк' : 'написать функцию'}»`);
      }
    }
    if (stats.graded < DELAYED_QUESTIONS) report(incomplete, file, `${title}: оцениваемых заданий ${stats.graded}, для отложенной проверки нужно не меньше ${DELAYED_QUESTIONS}`);
  }
}

// ---------- источники ----------

const FORBIDDEN_LICENSE = /(^|-)(NC|ND)(-|$)/;
for (const { topic, dir, file: topicFile } of topics.values()) {
  const incomplete: Severity = topic.review.status === 'draft' ? 'warning' : 'error';
  const file = join(dir, 'sources.yaml');
  if (!existsSync(file)) {
    report(incomplete, topicFile, 'нет sources.yaml: источников и строки «Основано на»');
    continue;
  }
  const data = validate(sourcesFileSchema, readYaml(file), file);
  if (!data) continue;
  if (data.topic !== topic.id) report('error', file, `topic: ${data.topic}, а тема — ${topic.id}`);
  const ids = data.sources.map((source) => source.id);
  if (new Set(ids).size !== ids.length) report('error', file, 'id источников повторяются');
  if (!data.sources.some((source) => source.use !== 'read-more')) {
    report('error', file, 'нет ни одного источника, на который опирается текст (use: adapted или reference)');
  }
  for (const source of data.sources) {
    if (source.use === 'read-more') continue;
    if (FORBIDDEN_LICENSE.test(source.license)) {
      report('error', file, `${source.id}: лицензия ${source.license} с ограничением NC или ND — такой источник можно дать только в «читать дальше»`);
      continue;
    }
    const allowed: readonly string[] = source.use === 'adapted' ? ADAPTABLE_LICENSES : REFERENCE_LICENSES;
    if (!allowed.includes(source.license)) {
      report('error', file, `${source.id}: лицензия ${source.license} не подходит для use: ${source.use}; допустимы: ${allowed.join(', ')}`);
    }
  }
}

// ---------- итог ----------

const errors = problems.filter((problem) => problem.severity === 'error');
const warnings = problems.filter((problem) => problem.severity === 'warning');
const byFile = new Map<string, Problem[]>();
for (const problem of problems) byFile.set(problem.file, [...(byFile.get(problem.file) ?? []), problem]);

for (const [file, list] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file}`);
  for (const problem of list) {
    const label = problem.severity === 'error' ? 'ошибка' : 'предупреждение';
    console.log(`  ${label}${problem.line ? ` (строка ${problem.line})` : ''}: ${problem.message}`);
  }
}

const drafts = [...topics.values()].filter(({ topic }) => topic.review.status === 'draft').length;
console.log(
  `\nПроверка контента: тем ${topics.size} (черновиков ${drafts}), терминов ${terms.size}; ` +
    `ошибок ${errors.length}, предупреждений ${warnings.length}. Каталог: ${totals.topics} тем в ${totals.modules} модулях.`,
);
if (errors.length > 0) process.exit(1);
