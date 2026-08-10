import type { APIRoute } from 'astro';

import { renderGenericPreviewCard } from '../../share/preview-card-template';

export const GET: APIRoute = async () => new Response(Uint8Array.from(await renderGenericPreviewCard()), {
  headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=0, must-revalidate' },
});
