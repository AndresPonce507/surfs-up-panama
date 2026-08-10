// Example-based state-transition tests for the report island's pure UI
// decisions.
//
// Paradigm exemption, documented at both the step and the skill level: this
// step's implementation notes exempt island.ts as DOM orchestration wiring,
// single-shot by nature, compensated by the property-based laws already on
// the record (report-record.test.ts, 01-01) and the queue (report-queue.
// test.ts, 01-02). Separately, nw-tdd-methodology's PBT mandate exempts
// "pure-function tests with single output and no side effects" outright, and
// that is exactly what decideProbeUi, decideCommitUi and parseAnswers are:
// two- or three-branch maps with no invariant a generated input space would
// explore beyond the branches themselves. Examples covering every branch are
// the honest test here; a property would be tautological ("ready in, ready
// out").
//
// What is NOT tested here: DOM wiring (mountReportIsland, the IndexedDB
// adapter, history.replaceState, form removal). That is exercised by
// tests/acceptance/f-tell-us-what-you-saw-cold/three-taps-locks-the-label.feature
// in a real browser against real IndexedDB, per this step's driving surface.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

import type { CommitOutcome, QueueOutcome, Refused } from '../../src/report/queue';
import {
  QUEUED_CONFIRMATION_MESSAGE,
  STORAGE_REFUSED_MESSAGE,
  decideCommitUi,
  decideProbeUi,
  parseAnswers,
  type ConfirmationLinks,
} from '../../src/report/island';

const refusal: Refused = { kind: 'refused', reason: 'open_refused', detail: 'boom' };

const links: ConfirmationLinks = {
  historyUrl: '/spots/playa-venao/reportado/',
  backHref: '/spots/playa-venao/',
  backLabel: 'Playa Venao',
};

describe('deciding what the screen does after the sentinel probe', () => {
  it('enables Mandar once the probe reports ready', () => {
    const ready: QueueOutcome = {
      kind: 'ready',
      queue: { commit: async () => ({ kind: 'queued', report_id: 'x' }) },
    };
    assert.deepEqual(decideProbeUi(ready), { kind: 'ready' });
  });

  it('shows a plain storage notice, never enables Mandar, when the probe refuses', () => {
    assert.deepEqual(decideProbeUi(refusal), { kind: 'notice', message: STORAGE_REFUSED_MESSAGE });
  });
});

describe('deciding what the screen does after Mandar commits', () => {
  it('swaps to the reportado address and renders the verbatim queued confirmation once the record is queued', () => {
    const queued: CommitOutcome = { kind: 'queued', report_id: 'a-report-id' };

    assert.deepEqual(decideCommitUi(queued, links), {
      kind: 'confirmed',
      message: QUEUED_CONFIRMATION_MESSAGE,
      ...links,
    });
    assert.equal(
      QUEUED_CONFIRMATION_MESSAGE,
      'Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue.',
      'the queued confirmation is the settled copy verbatim (application-architecture.md section 10)',
    );
  });

  it('never swaps the address and shows the storage notice instead when a passed-probe commit still refuses', () => {
    assert.deepEqual(decideCommitUi(refusal, links), { kind: 'notice', message: STORAGE_REFUSED_MESSAGE });
  });
});

describe('reading the three answers off the form', () => {
  it('accepts exactly the three canonical tokens the surfer picked', () => {
    const answers = parseAnswers({ size_band: 'waist_chest', wind: 'choppy', quality: 'good' });
    assert.deepEqual(answers, { size_band: 'waist_chest', wind: 'choppy', quality: 'good' });
  });

  it('refuses to compose a record when any answer is missing or not a canonical token', () => {
    assert.equal(
      parseAnswers({ size_band: null, wind: 'choppy', quality: 'good' }),
      undefined,
      'a missing answer must never reach composeReportRecord',
    );
    assert.equal(
      parseAnswers({ size_band: 'waist_chest', wind: 'choppy', quality: 'placeholder' }),
      undefined,
      'a tampered or stale value that is not a canonical token must never reach composeReportRecord '
        + '(domain-model.md section 10: a committed record has no edit command)',
    );
  });
});

// ---------------------------------------------------------------------------
// Cold-load regression: source-blind examination (event ddc0ba7c) found the
// confirmation address /spots/{slug}/reportado/ permanently blank on a cold
// load -- reload, a fresh tab, a bookmark -- because the document that route
// ships has zero <script> tags of its own; the confirmation only ever paints
// as a side effect of the in-app transition carried over from /reportar/.
// The row a surfer committed survives in IndexedDB, but the address that is
// supposed to state that truth cannot state anything without a prior
// same-session navigation.
//
// LAYER COMPROMISE, named rather than hidden: the honest test for "what a
// cold load renders" is a real browser loading the built document with no
// prior in-app navigation (an acceptance/E2E layer). This repo has no jsdom
// or fake-indexeddb devDependency (package.json, checked before writing this
// test), and adding one is a package.json + lockfile change outside this
// step's files_to_modify. So this check runs one layer down: it reads the
// real `npm run build` output byte-for-byte and asserts the one structural
// fact the whole suite missed and the examiner's curl caught -- the reportado
// document carries no script at all, so nothing on it can ever re-derive the
// confirmation from storage. A script tag being present is necessary, not
// sufficient, for the real fix; this test proves the necessary condition is
// currently false, which is exactly what makes the page permanently blank.
//
// FILE-BOUNDARY FINDING: the reportado document is emitted by
// src/pages/spots/[slug]/reportado.astro -> src/components/ReportShell.astro,
// neither of which is in this step's files_to_modify (island.ts,
// ReportCapture.astro, reportar.astro, this test file). Base.astro (the
// shared layout both screens use) ships no script of its own either -- every
// page must declare its own <script>, and reportar.astro's script (mounting
// src/report/island.ts) is only ever bundled into pages whose component tree
// includes ReportCapture.astro, which ReportShell.astro does not. Nothing
// reachable from this step's four files can place a script on the reportado
// document. This test is therefore intentionally left RED and uncommitted:
// GREEN requires editing ReportShell.astro and/or reportado.astro, which this
// step is not authorised to touch.
describe('cold load of the confirmation address (event ddc0ba7c)', () => {
  const DIST_ROOT = resolve(import.meta.dirname, '../../dist');
  const REPORTADO_DOCUMENT = resolve(DIST_ROOT, 'spots/playa-venao/reportado.html');

  it('ships a document built by `npm run build` to examine', () => {
    assert.ok(
      existsSync(REPORTADO_DOCUMENT),
      `WHAT: no build output at ${REPORTADO_DOCUMENT}. HOW: run \`npm run build\` first -- this check `
        + 'reads real built HTML, not a fixture, because the defect is about what a cold load renders.',
    );
  });

  it('carries a script of its own, so a cold load can re-derive the confirmation from durable storage', () => {
    const html = readFileSync(REPORTADO_DOCUMENT, 'utf8');
    const scriptCount = (html.match(/<script\b/g) ?? []).length;
    assert.ok(
      scriptCount >= 1,
      'WHAT: the built reportado document ships zero <script> tags. WHY: with no script of its own, this '
        + 'address is permanently blank on any cold load -- a reload, a fresh tab straight to the URL, a '
        + 'bookmark, or mobile Safari reclaiming the tab under memory pressure seconds after the surfer '
        + 'tapped Mandar -- because the confirmation is only ever painted by the in-app client-side '
        + 'transition carried over from /reportar/, which a cold load never runs. The IndexedDB row '
        + 'survives; only the address\'s ability to state that truth does not. HOW: the reportado document '
        + '(src/components/ReportShell.astro, out of this step\'s files_to_modify) needs a script that '
        + 'reads the durably committed report for this spot and renders the settled confirmation from it '
        + 'on load, not only as a transition side effect.',
    );
  });
});
