/**
 * Состояние уровней тем в каталоге и во вкладках уровней (ТЗ, «Экраны»:
 * «у темы — состояние каждого уровня»). Прогресс хранится только в браузере,
 * поэтому отметки дописываются на странице после загрузки.
 *
 *   <span data-level-state="algo.sorting.insertion:fundament"></span>
 *
 * Скрытая обёртка с data-state-holder показывается, только если отметка есть.
 *
 * На карте связей (TopicMap.astro) у темы — состояние «освоено», «изучается»
 * или «можно начинать» (src/lib/learning/map-state.ts).
 */
import { MAP_STATE_TEXT, mapState } from '../lib/learning/map-state.ts';
import { allProgress } from '../lib/learning/store.ts';
import type { Level, ProgressRecord } from '../lib/learning/types.ts';

function markMap(records: readonly ProgressRecord[]): void {
  for (const node of document.querySelectorAll<SVGElement>('[data-map-topic]')) {
    const prerequisites = (node.dataset.mapRequires ?? '')
      .split(' ')
      .filter(Boolean)
      .map((item) => {
        const [topic = '', level = 'fundament'] = item.split(':');
        return { topic, level: level as Level };
      });
    const levels = (node.dataset.mapLevels ?? '').split(' ').filter(Boolean) as Level[];
    const state = mapState({ topicId: node.dataset.mapTopic ?? '', levels, prerequisites, records });
    const label = node.querySelector('[data-map-state]');
    const title = node.dataset.mapTitle ?? '';
    if (state) node.dataset.state = state;
    else delete node.dataset.state;
    if (label) label.textContent = state ? MAP_STATE_TEXT[state] : '';
    // Имя ссылки для экранного диктора — с состоянием темы.
    node.setAttribute('aria-label', state ? `${title} — ${MAP_STATE_TEXT[state]}` : title);
  }
}

const TEXT = { 'in-progress': 'изучается', mastered: 'освоен' } as const;

async function mark(): Promise<void> {
  const targets = document.querySelectorAll<HTMLElement>('[data-level-state]');
  if (targets.length === 0 && !document.querySelector('[data-map-topic]')) return;
  let records;
  try {
    records = await allProgress();
  } catch {
    return;
  }
  const states = new Map(records.map((record) => [`${record.topicId}:${record.level}`, record.status]));
  for (const target of targets) {
    const status = states.get(target.dataset.levelState ?? '');
    if (status === 'in-progress' || status === 'mastered') {
      target.textContent = TEXT[status];
      target.dataset.status = status;
      target.hidden = false;
      const holder = target.closest<HTMLElement>('[data-state-holder]');
      if (holder) holder.hidden = false;
    }
  }
  markMap(records);
}

void mark();
