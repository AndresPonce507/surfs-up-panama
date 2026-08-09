export type SurfaceCall = {
  readonly spot_id: string;
  readonly score_q: number;
  readonly call_es: string;
};

export type PublishedSurfaceUpdate = {
  readonly schema: 'published-surface-update/v1';
  readonly surf_date: string;
  readonly published_at: string;
  readonly build_kind: 'dawn' | 'hourly';
  readonly calls: readonly SurfaceCall[];
};

export type StaticSurface = {
  readonly schema: 'static-surface/v1';
  readonly current: PublishedSurfaceUpdate;
  readonly dawn_receipts: readonly PublishedSurfaceUpdate[];
};

export function mergePublishedSurface(
  previous: StaticSurface | null,
  incoming: PublishedSurfaceUpdate,
): StaticSurface {
  const retained = previous?.dawn_receipts ?? [];
  const dawn_receipts = incoming.build_kind === 'dawn'
    ? retainDawnReceipt(retained, incoming)
    : retained;
  return {
    schema: 'static-surface/v1',
    current: incoming,
    dawn_receipts,
  };
}

export function previousCivilDate(surfDate: string): string {
  const atNoonUtc = new Date(`${surfDate}T12:00:00Z`);
  atNoonUtc.setUTCDate(atNoonUtc.getUTCDate() - 1);
  return atNoonUtc.toISOString().slice(0, 10);
}

function retainDawnReceipt(
  receipts: readonly PublishedSurfaceUpdate[],
  incoming: PublishedSurfaceUpdate,
): PublishedSurfaceUpdate[] {
  const existing = receipts.find((receipt) => receipt.surf_date === incoming.surf_date);
  if (existing !== undefined) return [...receipts];
  return [...receipts, incoming].sort((left, right) => left.surf_date.localeCompare(right.surf_date));
}
