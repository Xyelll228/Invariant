/**
 * Список тем этой сборки для повторения, журнала ошибок и настроек: навыки,
 * заблуждения и адреса уровней (src/lib/learning/topics.ts). Задания темы
 * целиком лежат в отдельных файлах ru/learn/<id темы>.json.
 */
import type { APIRoute } from 'astro';
import { capitalize } from '../../../lib/format.ts';
import { catalogTopics, folders } from '../../../content/catalog-data.ts';
import { catalogTopicPath, topicPath } from '../../../content/paths.ts';
import { loadSite, preparedTopicFor } from '../../../content/site-data.ts';
import type { TopicLink, TopicsIndex, TopicSummary } from '../../../lib/learning/topics.ts';

export const GET: APIRoute = async () => {
  const site = await loadSite();

  const link = (topicId: string): TopicLink => {
    const page = site.pages.get(topicId);
    if (page) return { id: topicId, title: page.topic.title, path: page.path };
    const entry = catalogTopics.get(topicId);
    return { id: topicId, title: capitalize(entry?.title ?? topicId), path: entry ? catalogTopicPath(topicId) : topicPath(topicId, folders) };
  };

  const topics: TopicSummary[] = [];
  for (const page of site.pages.values()) {
    const prepared = await preparedTopicFor(page.topic.id);
    topics.push({
      id: page.topic.id,
      title: page.topic.title,
      path: page.path,
      levels: page.levels.map((level) => ({ level: level.level, title: level.title, path: level.path })),
      skills: prepared.skills.map(({ id, title, level }) => ({ id, title, level })),
      misconceptions: Object.fromEntries(
        Object.entries(prepared.misconceptions).map(([id, item]) => [
          id,
          { text: item.text, blockPath: item.blockPath, prerequisite: item.prerequisite ? link(item.prerequisite) : null },
        ]),
      ),
      confusableWith: page.topic.confusableWith,
    });
  }
  const index: TopicsIndex = { topics };
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
