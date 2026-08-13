// Observation-export ports: the seams the acceptance tests drive through.
// Types only, mirroring src/pipeline/ports.ts.
//
// Two rules are inherited verbatim from that file and are the reason this
// module exists at all:
//
//   - Nothing in the export core reads the ambient clock or the ambient
//     filesystem. The clock is passed in, and so are the spot coordinates the
//     tile is computed from, so the whole core is a pure function of what it
//     was handed (contract:declared-inputs-not-ambient-reads).
//   - Storage capability is deliberately narrow. The export reads the write
//     store and writes the observation log. It receives no port that could
//     mutate the write store, and no port that could write outside the log
//     prefix, so the read-only-on-DynamoDB property the export role is granted
//     in IAM is also shaped into the code that role runs.

import type { Clock } from '../pipeline/ports';
import type { SpotCoordinate } from '../pipeline/adapters/spot-coordinates';

/**
 * The read half of the write store. `unknown` is honest: a scan returns every
 * item shape the table holds, and deciding which of them is an accepted report
 * is the export core's job, not the adapter's.
 */
export interface StoredItemReader {
  scanItems(): Promise<readonly unknown[]>;
}

/**
 * The observation log's write half. First writer of a key wins, exactly as
 * S3 `If-None-Match: *` behaves for the predictions log; a repeat write is a
 * duplicate acknowledgement, never an overwrite. The log is immutable, so
 * there is deliberately no `put` that could clobber.
 */
export interface ObservationLogStore {
  putIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'>;
}

/**
 * The ops signals file's write half, and a SECOND capability rather than a
 * second method on the log's.
 *
 * The two outputs are the same write-once contract over two different
 * prefixes, and the deployed role grants them as two separate prefixes for
 * the same reason: `log/observations/v1/*` is the immutable record consumers
 * read, `ops/abuse-signals/v1/*` is an operator's tripwire. A run that lost
 * its way and wrote signals into the log prefix would be writing a file no
 * consumer can parse into a place no one can delete it from, so the two
 * capabilities are handed over separately and named for what they carry.
 */
export interface AbuseSignalsStore {
  putIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'>;
}

/** Everything one export run is handed. Dependencies only; it takes no input. */
export interface ExportDeps {
  readonly store: StoredItemReader;
  readonly log: ObservationLogStore;
  readonly signals: AbuseSignalsStore;
  readonly clock: Clock;
  /** The human-owned launch seed's coordinates, read by the composition root. */
  readonly spots: readonly SpotCoordinate[];
  /**
   * The zone whose civil day the coordination signals are bucketed by
   * (07-write-path.md section 7.4 groups them per spot per LOCAL day).
   *
   * Passed in rather than read, for the same reason the clock is: a core that
   * reached for a zone would silently re-bucket the night the day someone ran
   * it from a different machine. Every one of the launch seed's rows declares
   * `America/Panama`, which is the value the composition root supplies and the
   * same literal src/pipeline/build.ts already falls back to.
   */
  readonly timezone: string;
}

/** What one run says it did, in the log's own vocabulary. */
export type ExportOutcome = {
  /** The UTC day that had just closed when the run started. */
  readonly day: string;
  /** How many accepted reports of that day became rows. */
  readonly rows: number;
  /** The object keys the run offered to the log, in tile order. */
  readonly keys: readonly string[];
};
