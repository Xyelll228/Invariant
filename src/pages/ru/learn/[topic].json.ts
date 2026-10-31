/**
 * Задания темы для повторения (ТЗ, «Разбор ошибок и повторение»): условия,
 * вычисленные при сборке ответы, заблуждения и адреса блоков. Страница
 * повторения загружает файл темы, только когда пора повторить её навык;
 * Service Worker хранит копию для работы без сети.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadSite, preparedTopicFor } from '../../../content/site-data.ts';

export const getStaticPaths = (async () => {
  const site = await loadSite();
  return [...site.pages.keys()].map((topic) => ({ params: { topic } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const topic = await preparedTopicFor(String(params.topic));
  return new Response(JSON.stringify(topic), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
