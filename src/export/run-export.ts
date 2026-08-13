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
