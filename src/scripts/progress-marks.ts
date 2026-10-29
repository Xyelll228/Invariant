/**
 * Состояние уровней тем в каталоге и во вкладках уровней (ТЗ, «Экраны»:
 * «у темы — состояние каждого уровня»). Прогресс хранится только в браузере,
 * поэтому отметки дописываются на странице после загрузки.
 *
 *   <span data-level-state="algo.sorting.insertion:fundament"></span>
 *
 * Скрытая обёртка с data-state-holder показывается, только если отметка есть.
 */
import { allProgress } from '../lib/learning/store.ts';

const TEXT = { 'in-progress': 'изучается', mastered: 'освоен' } as const;

async function mark(): Promise<void> {
  const targets = document.querySelectorAll<HTMLElement>('[data-level-state]');
  if (targets.length === 0) return;
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
}

void mark();
