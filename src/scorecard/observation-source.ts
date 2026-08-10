// How many surf reports a spot has, asked as a driven port and answered as a
// structured outcome.
//
// Zero reports have ever been filed and no observation store is deployed in
// this build. The honest answer today is therefore an absence, and the whole
// point of this module is that the absence is REPORTED rather than inferred:
// asking the source always yields an outcome, so "we cannot tell yet" is a
// positive statement from a surface that had to exist, not the silence left
// behind by an empty collection.
//
// The source is a value, passed in wherever it is used. It is never a
// module-scope singleton reached for at the point of use, so a caller can
// inject a refusing source and so slice-03 can swap in the real store read
// without touching the callers.

/**
 * The two things a source may honestly say.
 *
 * `store-absent` is the only outcome producible in this build. `counted`
 * exists because slice-03 replaces the day-one source with the real read and
 * the union has to be able to say so; nothing here constructs one.
 */
export type ObservationCount =
  | { readonly kind: 'store-absent'; readonly reason: string }
  | { readonly kind: 'counted'; readonly n_obs: number; readonly n_reporters: number };

/** Driven port: ask a source how many observations a spot has. Total. */
export type ObservationSource = (spotId: string) => ObservationCount;

const NO_STORE_DEPLOYED =
  'no observation store is deployed in this build, so nothing has been recorded for any spot yet';

/**
 * The day-one source. It answers the same store-absent outcome for every spot
 * id, which is what makes the unconditional render safe: no spot can fall
 * through to a page without a box because no spot id goes unanswered.
 */
export const dayOneObservationSource: ObservationSource = () => ({
  kind: 'store-absent',
  reason: NO_STORE_DEPLOYED,
});

/** The id the probe asks about. Reachability is the question, not this spot. */
const PROBE_SPOT_ID = 'probe';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const saysStoreAbsent = (value: Record<string, unknown>): boolean => {
  const reason = value['reason'];
  return value['kind'] === 'store-absent' && typeof reason === 'string' && reason.trim().length > 0;
};

const saysCounted = (value: Record<string, unknown>): boolean =>
  value['kind'] === 'counted' && isCount(value['n_obs']) && isCount(value['n_reporters']);

const isObservationCount = (value: unknown): value is ObservationCount =>
  isRecord(value) && (saysStoreAbsent(value) || saysCounted(value));

const describe = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'a function';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const describeThrown = (cause: unknown): string =>
  cause instanceof Error ? `an error: ${cause.message}` : describe(cause);

const refused = (sourceName: string, because: string): Error =>
  new Error(
    `The observation source "${sourceName}" refused its probe, ${because}. ` +
      'The build stops here: a source that cannot answer must never be read past, ' +
      'because the alternative is printing a counter nobody can stand behind.',
  );

/**
 * Prove the source is reachable and answers with a structured outcome, before
 * anything reads it. Wire, then probe, then use.
 *
 * Returns nothing and throws on refusal, deliberately: a boolean would be
 * silently ignorable, and the one thing this probe exists to prevent is a
 * caller carrying on past a source that could not answer.
 */
export const probeObservationSource = (sourceName: string, source: ObservationSource): void => {
  let answer: unknown;

  try {
    answer = source(PROBE_SPOT_ID);
  } catch (cause) {
    throw refused(sourceName, `it threw ${describeThrown(cause)}`);
  }

  if (!isObservationCount(answer)) {
    throw refused(sourceName, `it answered ${describe(answer)} instead of a structured outcome`);
  }
};
