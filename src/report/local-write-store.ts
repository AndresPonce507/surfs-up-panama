// Real local durability adapter for the report Lambda composition. It is not
// a browser queue: these files model the server-owned credential ledger,
// immutable report receipt and per-device daily quota boundary.

import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { ReportRecord } from './report-record';

export interface StoredCredential {
  readonly device_id: string;
  readonly issued_at: string;
  readonly issued_at_epoch: number;
  readonly src_hash: string;
}

export interface Receipt {
  readonly outcome: 'no_snapshot' | 'queued_duplicate';
  readonly report_id: string;
  readonly predicted: null;
  readonly counter: { readonly n_reports: number; readonly threshold: number };
}

type StoredReport = {
  readonly device_id: string;
  readonly received_at: string;
  readonly credential_issued_at: string;
  readonly record: ReportRecord;
  readonly receipt: Receipt;
};

export type StoredReportResult =
  | { readonly kind: 'accepted'; readonly receipt: Receipt }
  | { readonly kind: 'duplicate'; readonly receipt: Receipt }
  | { readonly kind: 'quota_exceeded' };

/** A filesystem-backed local equivalent of the server's immutable write store. */
export class LocalWriteStore {
  constructor(private readonly root: string) {}

  async mintCredential(candidate: StoredCredential): Promise<StoredCredential> {
    return this.withStoreLock(async () => {
      const path = join(this.root, 'credentials', `${candidate.device_id}.json`);
      const existing = await readJson<StoredCredential>(path);
      if (existing !== null) return existing;
      await writeJson(path, candidate);
      return candidate;
    });
  }

  async storeReport(
    record: ReportRecord,
    deviceId: string,
    receivedDay: string,
    quotaLimit: number,
    receivedAt: string,
    credentialIssuedAt: string,
  ): Promise<StoredReportResult> {
    return this.withStoreLock(async () => {
      const reportPath = join(this.root, 'reports', `${record.report_id}.json`);
      const prior = await readJson<StoredReport>(reportPath);
      if (prior !== null) return { kind: 'duplicate', receipt: duplicateReceipt(prior.receipt) };

      const reports = await this.reports();
      const quotaUsed = reports.filter((stored) => stored.device_id === deviceId && stored.received_at.startsWith(receivedDay)).length;
      if (quotaUsed >= quotaLimit) return { kind: 'quota_exceeded' };
      const counter = reports.filter((stored) => stored.record.spot_id === record.spot_id).length + 1;
      const receipt: Receipt = {
        outcome: 'no_snapshot',
        report_id: record.report_id,
        predicted: null,
        counter: { n_reports: counter, threshold: 30 },
      };
      await writeJson(reportPath, {
        device_id: deviceId,
        received_at: receivedAt,
        credential_issued_at: credentialIssuedAt,
        record,
        receipt,
      });
      return { kind: 'accepted', receipt };
    });
  }

  private async reports(): Promise<readonly StoredReport[]> {
    const directory = join(this.root, 'reports');
    try {
      const names = await readdir(directory);
      const records = await Promise.all(names.filter((name) => name.endsWith('.json')).map((name) => readJson<StoredReport>(join(directory, name))));
      return records.filter((record): record is StoredReport => record !== null);
    } catch (error: unknown) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  private async withStoreLock<T>(action: () => Promise<T>): Promise<T> {
    const lock = await acquireLock(join(this.root, '.write-store.lock'));
    try {
      return await action();
    } finally {
      await lock.file.close();
      await rm(lock.path, { force: true });
    }
  }
}

function duplicateReceipt(receipt: Receipt): Receipt {
  return { ...receipt, outcome: 'queued_duplicate' };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error: unknown) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}

async function acquireLock(path: string) {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    try {
      const file = await open(path, 'wx', 0o600);
      return { path, file };
    } catch (error: unknown) {
      if (!isAlreadyPresent(error)) throw error;
      await pause();
    }
  }
  throw new Error('write store unavailable: timed out waiting for its durable transaction lock');
}

function pause(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 1); });
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
