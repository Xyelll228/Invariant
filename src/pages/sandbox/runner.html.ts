/**
 * Страница песочницы для вложенного окна (iframe sandbox="allow-scripts").
 * Как она устроена — src/sandbox/runner-page.ts.
 */
import type { APIRoute } from 'astro';
import { buildRunnerPage } from '../../sandbox/runner-page.ts';

export const prerender = true;

export const GET: APIRoute = () => new Response(buildRunnerPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
