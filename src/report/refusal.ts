// What the browser makes of a refusal the write path sent back.
//
// WHY-NEW-FILE: src/report/refusal.ts
//   CLOSEST-EXISTING: src/report/submit.ts
//   EXTENSION-COST: submit.ts is the transport -- it owns fetch, the
//     credential header and the receipt parse. Its private plainRefusal
//     already reduced a whole refusal to one string; growing that private
//     helper into a classification the queue and the screen both depend on
//     would bury a shared decision inside the one module that may not be
//     called without a network.
//   PARALLEL-RATIONALE: roadmap step 05-01 names this path in files_to_modify,
//     and the decision here is pure (a parsed response body in, a sentence and
//     a persistence out) so it can be driven with no fetch, no DOM and no
//     store -- which is exactly how the queue law in step 05-02 drives it.
//
// This module must never import from src/data/forecast, src/publish/** or
// src/pipeline/**: the report flow may not reach the forecast layer
// (application-architecture.md section 9, leak path L1, enforced by
// .dependency-cruiser.cjs). It imports nothing at all.
//
// The wording is never composed here. Every refusal the write path can send
// carries its own WHAT sentence, already plain Spanish and already reviewed
// (src/report/local-lambda.ts). Rewriting it in the browser would put a second
// author on the same sentence, and the two would drift. The browser only
// substitutes its own sentence when a refusal arrives with nothing readable in
// it at all, which a front door refusing before the handler runs can do.

/**
 * Whether waiting could ever make this exact report acceptable.
 *
 * `settled` is the honest end of a report: the saved bytes are immutable
 * (domain-model.md section 10 gives SurfReport no edit command), so a report
 * refused for what those bytes say will be refused for it every time. A wrong
 * phone clock is the case this slice exists for -- observed_at never changes,
 * and every later send is further outside the plausibility window than the one
 * just refused. Sending it again is not persistence, it is a machine insisting.
 *
 * `may_arrive_later` is a report that is still waiting: a full daily
 * allowance, a store that could not answer, a refusal that arrived unreadable.
 * The same bytes are accepted next time, so the queue keeps carrying them.
 */
export type RefusalPersistence = 'settled' | 'may_arrive_later';

/** The two things a refused send must tell the rest of the app. */
export interface RefusalDecision {
  /** Plain Spanish, the handler's own sentence wherever it sent one. */
  readonly message: string;
  readonly persistence: RefusalPersistence;
}

/** Said only when the refusal itself could not be read. Plain, and it claims no reason. */
export const SEND_REFUSED_MESSAGE = 'No pudimos enviar el reporte ahora.';

/**
 * The refusal codes whose report can never become valid by waiting.
 *
 * Deliberately one entry rather than every refusal that arguably belongs
 * here. `unknown_spot` is the obvious second candidate and is left out on
 * purpose: slice-03 keeps that label queued and visible, and moving it is that
 * slice's call, not this one's. Everything unlisted stays waiting, because the
 * cost of the two mistakes is not symmetric -- wrongly settling a report
 * strands a label the server would have accepted, while wrongly keeping one
 * costs a send that refuses again.
 */
const SETTLED_REFUSAL_CODES: ReadonlySet<string> = new Set(['observed_at_out_of_range']);

/**
 * Read a refused response body as the sentence to show and the answer to
 * "should this report ever send itself again?".
 */
export function decideRefusal(body: unknown): RefusalDecision {
  const refusal = refusalFrom(body);
  const what = refusal?.what;
  const code = refusal?.code;
  return {
    // The two halves are read independently on purpose. A refusal carrying a
    // sentence but no code still gets said out loud; it simply cannot be
    // settled, which is the safe way round.
    message: typeof what === 'string' && what.length > 0 ? what : SEND_REFUSED_MESSAGE,
    persistence: typeof code === 'string' && SETTLED_REFUSAL_CODES.has(code) ? 'settled' : 'may_arrive_later',
  };
}

function refusalFrom(body: unknown): { readonly code?: unknown; readonly what?: unknown } | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const error = (body as { readonly error: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  return error as { readonly code?: unknown; readonly what?: unknown };
}
