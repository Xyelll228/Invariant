/**
 * Манифест веб-приложения: по нему приложение ставится на экран «Домой»
 * (ТЗ, «Что это»: PWA). Адреса строятся от base, поэтому у превью свой
 * манифест со своей областью и своим названием.
 */
import type { APIRoute } from 'astro';
import { t } from '../i18n/index.ts';
import { previewPr, url } from '../lib/site.ts';

export const prerender = true;

export const GET: APIRoute = () => {
  const name = previewPr === null ? t('site.name') : `${t('site.name')} — превью № ${previewPr}`;
  const manifest = {
    id: url('ru/'),
    name,
    short_name: previewPr === null ? t('site.name') : `Превью № ${previewPr}`,
    description: t('site.description'),
    lang: 'ru',
    dir: 'ltr',
    start_url: url('ru/'),
    scope: url(),
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: url('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: url('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: url('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
};
