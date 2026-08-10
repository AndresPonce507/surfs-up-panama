// The static-publication seam. Build owns the ordering: bundle -> complete
// static route set -> manifest commit marker -> public CloudFront probe.
// Render/upload and public HTTP are adapters, keeping the plan testable.

import type { PublishedSurfaceUpdate } from '../publish/static-surface';

export type StaticPublicationPlan = {
  readonly build_id: string;
  readonly surface: PublishedSurfaceUpdate;
};

export function planStaticPublication(
  build_id: string,
  surface: PublishedSurfaceUpdate,
): StaticPublicationPlan {
  return { build_id, surface };
}

export function assertCompleteStaticPublication(paths: readonly string[]): void {
  if (!paths.some((path) => path === 'index.html' || path.endsWith('.html'))) {
    throw new Error('static publication refused: WHAT no HTML route was generated; WHY a JSON bundle alone cannot serve the reading surface; HOW fix the renderer before advancing the manifest.');
  }
}
