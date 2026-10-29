/**
 * Сессия повторения (ТЗ, «Разбор ошибок и повторение»): порядок навыков и
 * выбор задания для каждого. Чистые функции — их проверяют модульные тесты,
 * а страница повторения только показывает результат.
 *
 * - Сначала короткие шаги изучения, срок которых наступил, затем повторения
 *   на сегодня, затем новые навыки — всё в пределах дневных лимитов (queue.ts).
 * - Темы перемешаны, а похожие (confusableWith) стоят рядом: навык вставок —
 *   и тут же навык выбора, чтобы их приходилось различать.
 * - Задание навыка каждый раз новое: у генератора — новый вариант, из готовых
 *   заданий — не то, что было в прошлый раз.
 */
import type { Random } from '../random.ts';
import { DEFAULT_DAY_START_HOUR, learningDayStart } from './day.ts';
import type { DayPlan } from './queue.ts';
import type { PreparedQuestion } from './question-types.ts';
import type { CardRecord, ReviewRecord } from './types.ts';

/** Похожие темы: связь в обе стороны, даже если указана только у одной темы. */
export function confusableGroups(topics: readonly { id: string; confusableWith: readonly string[] }[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const topic of topics) {
    if (!parent.has(topic.id)) parent.set(topic.id, topic.id);
    for (const other of topic.confusableWith) union(topic.id, other);
  }
  const groups = new Map<string, string>();
  for (const id of parent.keys()) groups.set(id, find(id));
  return groups;
}

/**
 * Чередование: карточки группируются по темам, темы — по группам похожих.
 * Группа выдаёт «раунды» — по карточке от каждой своей темы подряд, а раунды
 * разных групп идут по очереди. Порядок карточек внутри темы сохраняется:
 * он уже отражает срочность.
 */
export function interleave(cards: readonly CardRecord[], groups: ReadonlyMap<string, string>, random: Random): CardRecord[] {
  const byTopic = new Map<string, CardRecord[]>();
  for (const card of cards) {
    const list = byTopic.get(card.topicId);
    if (list) list.push(card);
    else byTopic.set(card.topicId, [card]);
  }
  const byGroup = new Map<string, string[]>();
  for (const topic of byTopic.keys()) {
    const group = groups.get(topic) ?? topic;
    const list = byGroup.get(group);
    if (list) list.push(topic);
    else byGroup.set(group, [topic]);
  }
  // Детерминированный порядок до перемешивания: по id групп и тем.
  const groupOrder = random.shuffle([...byGroup.keys()].sort());
  const rounds = groupOrder.map((group) => {
    const topics = random.shuffle([...(byGroup.get(group) ?? [])].sort());
    const queues = topics.map((topic) => [...(byTopic.get(topic) ?? [])]);
    const result: CardRecord[][] = [];
    while (queues.some((queue) => queue.length > 0)) {
      const round: CardRecord[] = [];
      for (const queue of queues) {
        const card = queue.shift();
        if (card) round.push(card);
      }
      result.push(round);
    }
    return result;
  });
  const order: CardRecord[] = [];
  for (let index = 0; rounds.some((list) => index < list.length); index++) {
    for (const list of rounds) {
      const round = list[index];
      if (round) order.push(...round);
    }
  }
  return order;
}

/** Порядок сессии: шаги изучения по сроку, затем повторения и новые навыки с чередованием тем. */
export function sessionOrder(plan: Pick<DayPlan, 'learning' | 'reviews' | 'fresh'>, groups: ReadonlyMap<string, string>, random: Random): CardRecord[] {
  return [...plan.learning, ...interleave(plan.reviews, groups, random), ...interleave(plan.fresh, groups, random)];
}

/** Задание, на которое навык отвечали в последний раз. */
export function lastQuestionOf(cardId: string, reviews: readonly ReviewRecord[]): string | null {
  let latest: ReviewRecord | null = null;
  for (const review of reviews) {
    if (review.cardId !== cardId || !review.questionId) continue;
    if (!latest || review.at > latest.at) latest = review;
  }
  return latest?.questionId ?? null;
}

/**
 * Задание для повторения навыка. Предвопросы не берутся: они не оцениваются.
 * Задания генератора лучше — у них новые данные. Из нескольких заданий
 * берётся не то, что было в прошлый раз.
 */
export function pickQuestion(
  questions: readonly PreparedQuestion[],
  skillId: string,
  lastQuestionId: string | null,
  random: Random,
): PreparedQuestion | null {
  const own = questions.filter((question) => question.skill === skillId && question.role !== 'pre');
  if (own.length === 0) return null;
  const generated = own.filter((question) => question.format === 'generated');
  const pool = generated.length > 0 ? generated : own;
  const fresh = pool.length > 1 ? pool.filter((question) => question.id !== lastQuestionId) : pool;
  return fresh[random.int(0, fresh.length - 1)] ?? null;
}

/**
 * С какого момента карточку можно повторять: интервал в днях — с начала
 * учебного дня, на который пришёлся срок; короткий шаг изучения — с точной минуты.
 */
export function availableAt(card: CardRecord, dayStartHour = DEFAULT_DAY_START_HOUR): number {
  return card.fsrs.scheduled_days >= 1 ? learningDayStart(card.fsrs.due, dayStartHour) : card.fsrs.due;
}

/**
 * Когда следующее повторение: ближайший момент среди карточек, которые уже
 * изучаются и не стоят на паузе. null — повторять пока нечего.
 */
export function nextDue(cards: readonly CardRecord[], pausedTopics: ReadonlySet<string>, dayStartHour = DEFAULT_DAY_START_HOUR): number | null {
  let next: number | null = null;
  for (const card of cards) {
    if (pausedTopics.has(card.topicId) || card.fsrs.last_review === null) continue;
    const at = availableAt(card, dayStartHour);
    if (next === null || at < next) next = at;
  }
  return next;
}
