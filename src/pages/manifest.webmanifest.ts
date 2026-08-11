import type { APIRoute } from 'astro';
import { lightChromeColor } from '../styles/chrome-colors';

export const GET: APIRoute = () => new Response(JSON.stringify({
  name: '¿Dónde se surfea hoy?',
  short_name: 'Surf Panamá',
  lang: 'es',
  start_url: '/',
  display: 'standalone',
  theme_color: lightChromeColor,
  background_color: lightChromeColor,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}), { headers: { 'Content-Type': 'application/manifest+json' } });
