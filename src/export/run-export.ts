// The driving port: one nightly observation export run.
//
// Functional core, imperative shell. Everything between the scan and the puts
// is a pure pipeline of small named steps -- read the item as a row, keep the
// rows the closed day received, group them into one object per tile -- and the
// only effects are the two injected ports at either end.
//
// The run takes no input. It is a pure function of the clock instant, the
// items the store hands back and the spot seeds it was given, which is what
// makes the whole thing testable through this one signature.

import { abuseSignalsFor, abuseSignalsKey, mintLedgerEntriesOf } from './abuse-signals';
import { closedUtcDayAt, isWithinUtcDay, observationObjectsFor } from './observation-objects';
import { observationRowOf, type ObservationRow } from './observation-row';
import type { ExportDeps, ExportOutcome } from './ports';

export async function runExport(deps: ExportDeps): Promise<ExportOutcome> {
  const day = closedUtcDayAt(deps.clock.now());
  const items = await deps.store.scanItems();
  const rows = rowsReceivedOn(day, items);
  const objects = observationObjectsFor(day, rows, deps.spots);
  for (const object of objects) {
    await deps.log.putIfAbsent(object.key, object.body);
  }
  await deps.signals.putIfAbsent(abuseSignalsKey(day), signalsDocumentFor(day, rows, items, deps.timezone));
  return { day, rows: rows.length, keys: objects.map((object) => object.key) };
}

/** The accepted reports of one closed UTC day, in the order the scan gave them. */
function rowsReceivedOn(day: string, items: readonly unknown[]): readonly ObservationRow[] {
  const rows: ObservationRow[] = [];
  for (const item of items) {
    const row = observationRowOf(item);
    if (row !== null && isWithinUtcDay(day, row.received_at)) rows.push(row);
  }
  return rows;
}

/**
 * The night's coordination signals, as the text the ops file carries.
 *
 * ONE scan feeds two outputs with different field allowances, and this is the
 * seam where they part. The rows above are the accepted reports and carry no
 * src_hash, because R5 forbids it and the log is immutable. The signals below
 * read the SAME scan again for the mint ledger, where src_hash lives and where
 * section 7.4 wants it counted. Neither reader can see the other's items:
 * each selects positively on its own sort key.
 *
 * Indented rather than dense, because the only consumer named for this file is
 * a person reading it during an incident.
 */
function signalsDocumentFor(
  day: string,
  rows: readonly ObservationRow[],
  items: readonly unknown[],
  timezone: string,
): string {
  const signals = abuseSignalsFor(day, rows, mintLedgerEntriesOf(items), timezone);
  return `${JSON.stringify(signals, null, 2)}\n`;
}
