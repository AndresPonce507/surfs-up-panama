// The offline report queue, as the acceptance tests reach it.
//
// ============================================================================
// CROSS-LANE CONTRACT — RECONCILE BEFORE EITHER SIDE GOES GREEN
// ============================================================================
// The queue itself is F-TELL-US-WHAT-YOU-SAW-COLD slice-01's deliverable: an
// IndexedDB store, records keyed by `report_id`, append at commit, delete on
// server ack (application-architecture.md section 12; domain-model.md
// section 7.4). That module DOES NOT EXIST YET. The database and store names
// below are this harness's proposal, made because the flush scenarios cannot
// be authored without a name; they are NOT settled by any design document.
//
// The moment f-tell slice-01 ships its queue module, these two constants MUST
// be reconciled against it in the same change, or every flush scenario here
// keeps planting into a store no production code reads and stays RED for a
// stale reason. Flagged in the slice-03 roadmap step and in the DISTILL
// section of feature-delta.md. If the names below win, f-tell inherits them;
// if f-tell chooses others, this file follows. One name, two consumers.
// ============================================================================
//
// The record shape is NOT invented: it is P2's wire contract verbatim
// (application-architecture.md section 7 row P2; 07-write-path.md section
// 4.1), and the wind and quality words come from the one vocabulary file
// src/data/report-vocab.ts, because a queued record replays byte-identical
// and a placeholder token queued today becomes a schema-invalid POST later
// (f-tell feature-delta, Pre-requisite 1 — closed 2026-08-09).

import type { Page } from 'playwright';

import { QUALITY_TOKENS, WIND_STATE_TOKENS } from '../../../../../src/data/report-vocab';

export const QUEUE_DATABASE = 'psb-report-queue';
export const QUEUE_STORE = 'entries';

export { QUALITY_TOKENS, WIND_STATE_TOKENS };

/** P2's body, the fields a committed label carries (07-write-path.md §4.1). */
export type QueuedReport = Readonly<{
  report_id: string;
  spot_id: string;
  observed_at: string;
  submitted_at: string;
  size_band: string;
  size_band_schema: number;
  wind: string;
  quality: string;
  trigger: string;
}>;

/**
 * A committed label as f-tell's capture would have written it: canonical
 * vocabulary tokens only, ULID-shaped id, observed before submitted. The
 * acceptance suite owns the PRECONDITION (a report is waiting) because
 * capture is another feature's journey; the behaviour under test here is
 * only ever the flush.
 */
export function settledQueuedReport(overrides: Partial<QueuedReport> = {}): QueuedReport {
  const observed = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  return {
    report_id: '01J0SIGNALSLICE03FLUSH001',
    spot_id: 'playa-venao',
    observed_at: observed,
    submitted_at: new Date().toISOString(),
    size_band: 'waist_chest',
    size_band_schema: 1,
    wind: WIND_STATE_TOKENS[1],
    quality: QUALITY_TOKENS[2],
    trigger: 'organic',
    ...overrides,
  };
}

/** Commits a record into the phone's own queue, exactly where capture would. */
export async function plantQueuedReport(page: Page, record: QueuedReport): Promise<void> {
  await page.evaluate(
    async ([database, store, planted]) => {
      await new Promise<void>((done, refuse) => {
        const opening = indexedDB.open(database as string);
        opening.onupgradeneeded = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains(store as string)) {
            db.createObjectStore(store as string);
          }
        };
        opening.onerror = () => refuse(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains(store as string)) {
            db.close();
            refuse(new Error(`queue store "${store}" missing in "${database}"`));
            return;
          }
          const writing = db.transaction(store as string, 'readwrite');
          writing.objectStore(store as string).put(planted, (planted as QueuedReport).report_id);
          writing.oncomplete = () => {
            db.close();
            done();
          };
          writing.onerror = () => {
            db.close();
            refuse(writing.error);
          };
        };
      });
    },
    [QUEUE_DATABASE, QUEUE_STORE, record] as const,
  );
}

/** Every report still waiting on the phone. Empty when the flush has done its job. */
export async function queuedReports(page: Page): Promise<QueuedReport[]> {
  return page.evaluate(
    async ([database, store]) => {
      const databases = await indexedDB.databases();
      if (!databases.some((candidate) => candidate.name === database)) return [];
      return new Promise<QueuedReport[]>((done, refuse) => {
        const opening = indexedDB.open(database as string);
        opening.onerror = () => refuse(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains(store as string)) {
            db.close();
            done([]);
            return;
          }
          const reading = db.transaction(store as string, 'readonly');
          const request = reading.objectStore(store as string).getAll();
          request.onerror = () => {
            db.close();
            refuse(request.error);
          };
          request.onsuccess = () => {
            db.close();
            done((request.result as unknown[]).filter((row): row is QueuedReport => (
              typeof row === 'object' && row !== null && typeof (row as { report_id?: unknown }).report_id === 'string'
            )));
          };
        };
      });
    },
    [QUEUE_DATABASE, QUEUE_STORE] as const,
  );
}
