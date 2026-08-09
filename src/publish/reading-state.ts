// Static-reading state contract. The builder, not the browser, resolves these
// states from immutable call receipts. This is deliberately a RED scaffold:
// DISTILL defines the states before DELIVER implements their selection.

export type PublishedReceipt = {
  readonly surf_date: string;
  readonly published_at: string;
  readonly build_kind: 'dawn' | 'hourly';
  readonly spot_id: string;
  readonly score_q: number;
  readonly call_es?: string;
};

export type ReadingState =
  | {
      readonly kind: 'success';
      readonly receipt: PublishedReceipt;
      readonly published_at: string;
    }
  | {
      readonly kind: 'empty';
      readonly message_es: string;
    }
  | {
      readonly kind: 'stale';
      readonly receipt: PublishedReceipt;
      readonly published_at: string;
      /** Names the failed current data path while keeping the old receipt honest. */
      readonly notice_es: string;
    };

export function resolveYesterdayReading(input: {
  readonly spot_id: string;
  readonly prior_surf_date: string;
  readonly receipts: readonly PublishedReceipt[];
  readonly current_build_refused: boolean;
}): ReadingState {
  const receipt = input.receipts.find((candidate) =>
    candidate.spot_id === input.spot_id
      && candidate.surf_date === input.prior_surf_date
      && candidate.build_kind === 'dawn',
  );
  if (receipt === undefined) {
    return {
      kind: 'empty',
      message_es: `Todavía no hay un llamado de ayer para ${spotName(input.spot_id)}.`,
    };
  }
  if (input.current_build_refused) {
    return {
      kind: 'stale',
      receipt,
      published_at: receipt.published_at,
      notice_es: `Viejo. Lo último que vimos fue a las ${formatPanamaTime(receipt.published_at)} No pudimos sacar datos nuevos esta mañana.`,
    };
  }
  return { kind: 'success', receipt, published_at: receipt.published_at };
}

function spotName(spotId: string): string {
  return spotId === 'playa-venao' ? 'Playa Venao' : spotId;
}

export function formatPanamaTime(publishedAt: string): string {
  const instant = new Date(publishedAt);
  const hour = (instant.getUTCHours() + 19) % 24;
  const minutes = String(instant.getUTCMinutes()).padStart(2, '0');
  const meridiem = hour < 12 ? 'a.m.' : 'p.m.';
  return `${hour % 12 || 12}:${minutes} ${meridiem}`;
}
