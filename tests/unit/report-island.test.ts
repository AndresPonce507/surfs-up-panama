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
// What is NOT tested here: DOM wiring (mountReportIsland, mountReportReveal,
// the IndexedDB adapter, history.replaceState, form removal). That is
// exercised by
// tests/acceptance/f-tell-us-what-you-saw-cold/three-taps-locks-the-label.feature
// in a real browser against real IndexedDB, per this step's driving surface.
//
// parseSpotIdFromRevealPath (below) is the one exception to the "examples
// only" rule above: it has a genuine roundtrip invariant (paths.reported
// builds the address; this parses the spot back out of it), which is exactly
// nw-functional-software-crafter's PBT signal for a roundtrip, so it is
// proven as a property against every real launch spot rather than a
// hand-picked example.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import fc from 'fast-check';
import { afterAll, describe, it } from 'vitest';

import { region } from '../../src/data/region';
import { paths } from '../../src/i18n/routes';
import type { CommitOutcome, QueueOutcome, Refused } from '../../src/report/queue';
import {
  CONFIRMED_HEADING,
  NOTHING_QUEUED_HEADING,
  NOTHING_QUEUED_MESSAGE,
  QUEUED_CONFIRMATION_MESSAGE,
  STORAGE_REFUSED_MESSAGE,
  decideCommitUi,
  decideProbeUi,
  decideRevealUi,
  parseAnswers,
  parseLocaleFromRevealPath,
  parseSpotIdFromRevealPath,
  type ConfirmationLinks,
  type RevealLinks,
} from '../../src/report/island';

const refusal: Refused = { kind: 'refused', reason: 'open_refused', detail: 'boom' };

const links: ConfirmationLinks = {
  historyUrl: '/spots/playa-venao/reportado/',
  backHref: '/spots/playa-venao/',
  backLabel: 'Playa Venao',
};

const revealLinks: RevealLinks = {
  backHref: '/spots/playa-venao/',
  backLabel: 'Playa Venao',
  reportHref: '/spots/playa-venao/reportar/',
  reportLabel: '¿ESTUVISTE? CUÉNTANOS',
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
      heading: CONFIRMED_HEADING,
      message: QUEUED_CONFIRMATION_MESSAGE,
      nav: { href: links.backHref, label: links.backLabel, emphasis: 'quiet' },
      historyUrl: links.historyUrl,
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

  it('gives the confirmed screen a heading and a quiet way back, never a prominent way into reportar (event <second-round: no heading, no card, no way back>)', () => {
    const queued: CommitOutcome = { kind: 'queued', report_id: 'a-report-id' };
    const decision = decideCommitUi(queued, links);
    assert.equal(decision.kind, 'confirmed');
    if (decision.kind !== 'confirmed') return;
    assert.ok(decision.heading.length > 0, 'a confirmed screen with no heading is exactly what read as unfinished');
    assert.equal(decision.nav.emphasis, 'quiet', 'a saved label must never invite "report again" -- they just did');
    assert.ok(!decision.nav.href.includes('/reportar'), 'the confirmed nav must never point back into an editable form');
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

describe('deciding what the reportado document shows on a cold load (event ddc0ba7c)', () => {
  it('renders the verbatim queued confirmation when the phone durably holds a report for this spot', () => {
    assert.deepEqual(decideRevealUi(true, revealLinks), {
      kind: 'confirmed',
      heading: CONFIRMED_HEADING,
      message: QUEUED_CONFIRMATION_MESSAGE,
      nav: { href: revealLinks.backHref, label: revealLinks.backLabel, emphasis: 'quiet' },
    });
    assert.equal(
      QUEUED_CONFIRMATION_MESSAGE,
      'Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue.',
      'slice-01 never sends, so the queued variant is the only honest state whether the load is live or cold',
    );
  });

  it('states plainly that nothing is stored, never an error and never a false confirmation, when nothing is queued', () => {
    assert.deepEqual(decideRevealUi(false, revealLinks), {
      kind: 'not_found',
      heading: NOTHING_QUEUED_HEADING,
      message: NOTHING_QUEUED_MESSAGE,
      nav: { href: revealLinks.reportHref, label: revealLinks.reportLabel, emphasis: 'primary' },
    });
    assert.ok(!/\d/.test(NOTHING_QUEUED_MESSAGE), 'the no-forecast oracle forbids digits anywhere on this screen');
    assert.ok(!/\d/.test(NOTHING_QUEUED_HEADING), 'the no-forecast oracle forbids digits anywhere on this screen');
    assert.notEqual(
      NOTHING_QUEUED_MESSAGE,
      QUEUED_CONFIRMATION_MESSAGE,
      'nothing stored must never read as the same sentence as a real saved label',
    );
  });

  it('carries a heading and a way forward into reporting for both states -- the built reportado document must never ship a bare, headingless, dead-end <p> (this step\'s second-round finding)', () => {
    for (const hasQueuedReport of [true, false]) {
      const decision = decideRevealUi(hasQueuedReport, revealLinks);
      assert.ok(
        decision.heading.length > 0,
        `WHAT: decideRevealUi(${hasQueuedReport}) has no heading. WHY: both reportado states shipped as a `
          + 'single unclassed <p>, no heading, no card, no way back/forward -- exactly what read as unfinished.',
      );
      assert.ok(decision.nav.href.length > 0 && decision.nav.label.length > 0, 'every reveal state must offer a real navigable link, never a dead end');
    }
    assert.equal(
      decideRevealUi(false, revealLinks).nav.emphasis,
      'primary',
      'nothing stored is where a way forward matters most -- the nav must be the prominent CTA into reporting',
    );
  });
});

describe('reading the spot identity back out of the reveal address', () => {
  it('roundtrips every real launch spot and its locale, both the reportado and reported URL shapes, es and en', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...region.spots.map((spot) => spot.spot_id)),
        fc.constantFrom('es' as const, 'en' as const),
        (spotId, locale) => {
          const address = paths.reported(locale, spotId);
          assert.equal(
            parseSpotIdFromRevealPath(address),
            spotId,
            `parseSpotIdFromRevealPath must invert paths.reported for every real spot; got address ${address}`,
          );
          assert.equal(
            parseLocaleFromRevealPath(address),
            locale,
            `parseLocaleFromRevealPath must invert paths.reported's own locale prefix; got address ${address}`,
          );
        },
      ),
    );
  });

  it('finds nothing on an address that is not a reveal address', () => {
    assert.equal(parseSpotIdFromRevealPath('/spots/playa-venao/reportar/'), undefined);
    assert.equal(parseSpotIdFromRevealPath('/'), undefined);
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
// RESOLVED, scope-widening note 2026-08-10: this check was first proven RED
// on a run where src/pages/spots/[slug]/reportado.astro was out of this
// step's files_to_modify (the reportado document is emitted by
// reportado.astro -> src/components/ReportShell.astro, and neither was
// reachable from island.ts, ReportCapture.astro or reportar.astro alone).
// ReportShell.astro remains out of scope -- it renders no <slot />, so it
// cannot host a child script -- but reportado.astro was widened into this
// step's files_to_modify because no other step in the roadmap owned it. The
// fix lives there: reportado.astro now declares its own <script> as a
// sibling of <ReportShell />, importing mountReportReveal from this module.
// (That script tag renders after ReportShell's </html> in the raw build
// output, since ReportShell has no slot to place it inside; real browsers,
// Chromium included, reparent trailing body content per the WHATWG HTML5
// "after after body" insertion-mode rules, so it executes exactly as if it
// had been written inside <body> -- verified against the real built output
// with a real Chromium page load, both with and without a durably queued
// report, before this comment was written.) Re-run against the fix: GREEN.
describe('cold load of the confirmation address (event ddc0ba7c)', () => {
  const projectRoot = resolve(import.meta.dirname, '../..');
  const testRoot = mkdtempSync(join(tmpdir(), 'surfs-up-report-island-'));
  const isolatedProject = join(testRoot, 'project');
  const reportadoDocument = resolve(isolatedProject, 'dist/spots/playa-venao/reportado.html');
  let buildOutput: string | undefined;

  function buildReportadoDocument(): string {
    if (buildOutput !== undefined) return buildOutput;

    mkdirSync(isolatedProject);
    for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
      copyFileSync(join(projectRoot, name), join(isolatedProject, name));
    }
    for (const name of ['data', 'docs', 'public', 'scripts', 'src']) {
      cpSync(join(projectRoot, name), join(isolatedProject, name), { recursive: true });
    }
    symlinkSync(join(projectRoot, 'node_modules'), join(isolatedProject, 'node_modules'), 'dir');

    const build = spawnSync('npm', ['run', 'build'], {
      cwd: isolatedProject,
      encoding: 'utf8',
    });
    assert.equal(
      build.status,
      0,
      `the cold-load contract needs its own production build:\n${build.stdout}\n${build.stderr}`,
    );
    assert.ok(
      existsSync(reportadoDocument),
      `WHAT: isolated build emitted no ${reportadoDocument}. HOW: restore the reportado route in the production builder.`,
    );
    buildOutput = readFileSync(reportadoDocument, 'utf8');
    return buildOutput;
  }

  afterAll(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('ships a document built by `npm run build` to examine', () => {
    assert.match(buildReportadoDocument(), /<!doctype html>/i);
  }, 60_000);

  it('carries a script of its own, so a cold load can re-derive the confirmation from durable storage', () => {
    const html = buildReportadoDocument();
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
