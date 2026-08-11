import type { APIRoute } from 'astro';

import { forecast } from '../../data/forecast';
import { spotById } from '../../data/region';
import { selectPreviewCard } from '../../share/preview-card';
import { renderGenericPreviewCard, renderSpotPreviewCard } from '../../share/preview-card-template';

export function getStaticPaths() {
  return forecast.days[0].map((summary) => ({ params: { slug: summary.spot_id } }));
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  const summary = forecast.days[0].find((candidate) => candidate.spot_id === slug);
  const identity = slug === undefined ? undefined : spotById(slug);
  if (summary === undefined || identity === undefined) {
    return new Response('Not found', { status: 404 });
  }
  const selection = selectPreviewCard({ ...summary, spot_name: identity.name });
  const card = selection.kind === 'spot'
    ? await renderSpotPreviewCard(summary, identity.name)
    : await renderGenericPreviewCard();
  if (selection.kind === 'generic') {
    console.warn(`preview-card: ${summary.spot_id} missing ${selection.missing_fields.join(', ')}, using generica`);
  }
  return new Response(Uint8Array.from(card), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
};
