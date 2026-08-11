// Slice-01 honesty scenarios: the anti-leak closure (application-architecture.md
// section 7 payload contract, section 8 leak paths L1 to L4, section 9
// enforcement, adr-report-flow-leak-isolation.md), the removed-English-tree
// check (HANDOFF section 6 item 3), the noscript contract (section 6), and the
// beach byte ceilings (section 4 route map, section 6 island inventory).
//
// Driving surfaces, production only:
//   - the walked flow: real `npm run build` output over real HTTP, Chromium at
//     390 px (world.ts surface, shared with report-capture.steps.ts);
//   - the leak gate: `node scripts/check-report-leak.mjs --dist <root>`, the
//     same CLI shape as the shipped page-weight gate
//     (`scripts/check-page-weight.mjs`, `npm run budget -- --dist`). The gate
//     does not exist yet; the When steps capture that as an outcome and the
//     Then steps fail at the behaviour oracle, active-RED, never at import;
//   - the local CI composition: `runLocalCi({argv: ['--list']})`, the shipped
//     production entry the keystone's page-weight scenarios already drive.
//
// A negative test that cannot fire proves nothing (section 9, clause
// check:unfired-is-not-evidence). Two teeth keep these scenarios falsifiable:
//   1. the marker-sensitivity guard: before asserting absence, the marker
//      vocabulary must FIRE on the repository's real published forecast
//      payload (data/published-surface.json). If the markers stop naming the
//      live forecast vocabulary, the guard fails the test rather than letting
//      the absence check pass vacuously;
//   2. the poisoned-copy proof: the leak gate is watched REFUSING a
//      deliberately poisoned contained copy, at authoring time, every run.

import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

import { runLocalCi } from '../../../../scripts/ci-local.mjs';
import {
  DIST_ROOT,
  FORECAST_MARKERS,
  REPOSITORY_ROOT,
  SPOT_ID,
  SPOT_NAME,
  SPOT_PATH,
  assertBuiltSite,
  failureContext,
  phonePage,
  scenarioState,
  snapshotRepositoryBuildOutput,
  visibleText,
} from './support/world';
import { assertStateDelta } from './support/state-delta';

const execFileAsync = promisify(execFile);

const KB = 1024;
/** Route map, application-architecture.md section 4: reportar 6 KB document. */
const REPORTAR_DOCUMENT_CEILING = 6 * KB;
/** Route map, section 4: reportado 4 KB document. */
const REPORTADO_DOCUMENT_CEILING = 4 * KB;
/** Island inventory, section 6: report flow island 5.0 KB gz across both screens. */
const ISLAND_CEILING = 5 * KB;

/** The production leak gate CLI, mirror of scripts/check-page-weight.mjs. */
const LEAK_GATE_SCRIPT = 'scripts/check-report-leak.mjs';

/**
 * The poison injected into a contained copy's reportar document: real forecast
 * vocabulary in a realistic publish shape, drawn from the same field names the
 * live published surface carries. If the gate cannot see THIS, it cannot see
 * a real leak.
 */
const POISON = '<div data-forecast>{"score_q":82,"size_range_m":[0.7,1.1],'
  + '"wind_state":"clean","conf_level":"media","best_window":{"start":"06:00","end":"09:30"}}</div>';

type ContainedCopy = Readonly<{ root: string; cleanupRoot: string }>;
type GateRun = Readonly<{ exitCode: number; output: string; examinedRoot: string }>;

const poisonedCopies = new WeakMap<object, ContainedCopy>();
const cleanCopies = new WeakMap<object, ContainedCopy>();
const poisonedRuns = new WeakMap<object, GateRun>();
const cleanRuns = new WeakMap<object, GateRun>();
const inventoryRuns = new WeakMap<object, { exitCode: number; output: string }>();
const trackedCopies = new WeakMap<object, ContainedCopy[]>();

class CapturingOutput {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }

  error(line: string): void {
    this.lines.push(line);
  }

  text(): string {
    return this.lines.join('\n');
  }
}

function trackCopy(world: object, copy: ContainedCopy): ContainedCopy {
  const list = trackedCopies.get(world) ?? [];
  list.push(copy);
  trackedCopies.set(world, list);
  return copy;
}

After({ tags: '@feature-f-tell-us-what-you-saw-cold' }, function (this: object) {
  for (const copy of trackedCopies.get(this) ?? []) {
    rmSync(copy.cleanupRoot, { recursive: true, force: true });
  }
  trackedCopies.delete(this);
});

function copyBuildOutput(world: object): ContainedCopy {
  assert.ok(
    existsSync(DIST_ROOT),
    'WHAT: there is no build output to copy. HOW: the Given step must run the real build first.',
  );
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'report-leak-proof-'));
  const root = join(cleanupRoot, 'dist');
  cpSync(DIST_ROOT, root, { recursive: true });
  return trackCopy(world, { root, cleanupRoot });
}

/**
 * The marker-sensitivity guard. The absence assertions below are only worth
 * anything if the marker vocabulary detects the real forecast payload this
 * repository publishes today. Run before every absence check.
 */
function assertMarkersDetectTheRealForecast(): void {
  const surfacePath = resolve(REPOSITORY_ROOT, 'data', 'published-surface.json');
  assert.ok(
    existsSync(surfacePath),
    'test bug guard: data/published-surface.json is gone, so the marker vocabulary cannot be '
      + 'proven live against the real forecast payload. Re-anchor the sensitivity guard before '
      + 'trusting any absence assertion.',
  );
  const surface = readFileSync(surfacePath, 'utf8');
  const firing = FORECAST_MARKERS.filter((marker) => surface.includes(marker));
  assert.ok(
    firing.length >= 3,
    `test bug guard: only ${firing.length} forecast marker(s) fire on the repository's real `
      + 'published forecast payload. WHY: an absence check whose markers name nothing real passes '
      + 'against any page, poisoned or not (section 9, check:unfired-is-not-evidence). HOW: keep '
      + 'FORECAST_MARKERS aligned with the live published-surface vocabulary.',
  );
}

function reportDocuments(kind: 'reportar' | 'reportado'): { path: string; relative: string }[] {
  const spotsRoot = resolve(DIST_ROOT, 'spots');
  if (!existsSync(spotsRoot)) return [];
  const found: { path: string; relative: string }[] = [];
  for (const slug of readdirSync(spotsRoot).sort()) {
    const candidate = resolve(spotsRoot, slug, `${kind}.html`);
    if (existsSync(candidate)) found.push({ path: candidate, relative: `spots/${slug}/${kind}.html` });
  }
  return found;
}

/** Every external subresource a built document references, resolved in dist. */
function referencedAssetPaths(documentBody: string): string[] {
  const references = new Set<string>();
  const patterns = [/<script[^>]*\ssrc="([^"]+)"/g, /<link[^>]*\shref="([^"]+)"/g];
  for (const pattern of patterns) {
    for (const match of documentBody.matchAll(pattern)) {
      const href = match[1]!;
      if (/^[a-z]+:|^\/\//i.test(href)) continue; // cross-origin: forbidden elsewhere, not readable here
      references.add(href.split(/[?#]/)[0]!);
    }
  }
  return [...references];
}

// ---------- the walked anti-leak oracle ----------

When('the surfer reloads mid flow', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  await page.reload({ waitUntil: 'load' });
});

Then(
  'nothing the report screen shows or loads carries forecast data',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    assertMarkersDetectTheRealForecast();

    const page = await phonePage(state);

    // L2: nothing on the report screens prefetches, and no speculation rules.
    const prefetches = await page.locator('link[rel="prefetch"], script[type="speculationrules"]').count();
    assert.equal(
      prefetches,
      0,
      `WHAT: the report screen carries ${prefetches} prefetch or speculation hint(s). WHY: a `
        + 'prefetched payload is leak path L2; the reveal has no URL to prefetch by design '
        + `(application-architecture.md section 8 L2, adr-report-flow-leak-isolation.md). HOW: ship the report screens with no prefetch and no speculation rules.${failureContext(state)}`,
    );

    // The leak surface: what the browser is showing right now, plus every
    // built report-route document, plus every asset those documents load.
    const surfaces: { url: string; body: string }[] = [
      { url: `live page ${page.url()}`, body: await page.content() },
    ];
    const documents = [...reportDocuments('reportar'), ...reportDocuments('reportado')];
    assert.ok(
      documents.length > 0,
      'WHAT: the built site holds no report-route document at all. HOW: build the site before walking it.',
    );
    for (const document of documents) {
      const body = readFileSync(document.path, 'utf8');
      surfaces.push({ url: document.relative, body });
      for (const reference of referencedAssetPaths(body)) {
        const assetPath = resolve(DIST_ROOT, reference.replace(/^\//, ''));
        if (!assetPath.startsWith(DIST_ROOT) || !existsSync(assetPath)) continue;
        surfaces.push({ url: `${document.relative} -> ${reference}`, body: readFileSync(assetPath, 'utf8') });
      }
    }

    for (const surface of surfaces) {
      for (const marker of FORECAST_MARKERS) {
        assert.ok(
          !surface.body.includes(marker),
          `WHAT: forecast vocabulary reached the report flow: ${JSON.stringify(marker)} in `
            + `${surface.url}. WHY: no payload delivered to the reportar route family may carry a `
            + 'forecast field, for any spot, ever; one leaked field re-opens the anchoring the '
            + 'two-screen design exists to close (application-architecture.md section 7 anti-leak '
            + 'contract, section 8 L1 to L4). HOW: keep forecast data out of the report documents '
            + `and out of everything they load.${failureContext(state)}`,
        );
      }
    }

    // The charter's negative, on the screen itself: before the label is saved
    // no score, band-of-today or forecast hint may show. Screen one's settled
    // copy carries no digits at all.
    const pathname = new URL(page.url()).pathname;
    if (new RegExp(`^/spots/${SPOT_ID}/reportar/?$`).test(pathname)) {
      const text = await visibleText(state);
      assert.ok(
        !/\d/.test(text),
        `WHAT: the report screen shows a number before the label is saved: ${JSON.stringify(text.slice(0, 200))}. `
          + 'WHY: any number here reads as our forecast arriving before the answer, the exact '
          + `anchoring leak decision 28 closes. HOW: keep screen one number-free.${failureContext(state)}`,
      );
    }
  },
);

// ---------- the leak gate, proven refusing ----------

Given(
  'a contained copy of the built site whose report screen is poisoned with a forecast',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    assertMarkersDetectTheRealForecast();
    state.distSnapshot = snapshotRepositoryBuildOutput();
    const copy = copyBuildOutput(this);
    const target = resolve(copy.root, 'spots', SPOT_ID, 'reportar.html');
    assert.ok(
      existsSync(target),
      `WHAT: the contained copy holds no ${SPOT_ID} reportar document to poison. HOW: build the real site first.`,
    );
    const body = readFileSync(target, 'utf8');
    const poisoned = body.includes('</body>')
      ? body.replace('</body>', `${POISON}</body>`)
      : body + POISON;
    writeFileSync(target, poisoned, 'utf8');
    poisonedCopies.set(this, copy);
  },
);

async function runLeakGate(root: string): Promise<GateRun> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'node',
      [LEAK_GATE_SCRIPT, '--dist', root],
      { cwd: REPOSITORY_ROOT, maxBuffer: 16 * 1024 * 1024 },
    );
    return { exitCode: 0, output: `${stdout}\n${stderr}`, examinedRoot: root };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof failed.code === 'number' ? failed.code : 1,
      output: `${failed.stdout ?? ''}\n${failed.stderr ?? ''}\n${failed.message ?? ''}`,
      examinedRoot: root,
    };
  }
}

When('the leak gate examines the poisoned copy', { timeout: 120_000 }, async function (this: object) {
  const copy = poisonedCopies.get(this);
  assert.ok(copy, 'WHAT: no poisoned copy exists to examine. HOW: prepare the contained poisoned copy first.');
  poisonedRuns.set(this, await runLeakGate(copy.root));
});

Then(
  'the gate refuses the poisoned copy naming the report route and what leaked',
  function (this: object) {
    const run = poisonedRuns.get(this);
    assert.ok(run, 'WHAT: the leak gate was never invoked on the poisoned copy.');
    assert.notEqual(
      run.exitCode,
      0,
      'WHAT: the leak gate accepted a report screen deliberately poisoned with a forecast. WHY: a '
        + 'leak gate never seen firing proves nothing (application-architecture.md section 9, '
        + 'check:unfired-is-not-evidence); this refusal IS the proof the gate can see a real leak. '
        + `HOW: ship ${LEAK_GATE_SCRIPT} as the dist grep gate over the report routes and make it exit non-zero on any forecast marker there.\n${run.output.slice(-2000)}`,
    );
    assert.match(
      run.output,
      new RegExp(`spots[/\\\\]${SPOT_ID}[/\\\\]reportar`),
      'WHAT: the refusal does not name the poisoned report route. WHY: a refusal that names '
        + 'nothing cannot be repaired, and a missing gate fails here with its real error instead '
        + `of passing as a refusal. HOW: name the offending route in the refusal.\n${run.output.slice(-2000)}`,
    );
    const named = FORECAST_MARKERS.filter((marker) => run.output.includes(marker));
    assert.ok(
      named.length > 0,
      'WHAT: the refusal does not say what leaked. WHY: the gate must name the forecast marker it '
        + `found so the leak can be closed, not guessed at. HOW: print every marker found on the route.\n${run.output.slice(-2000)}`,
    );
  },
);

When('the leak gate examines a clean copy of the built site', { timeout: 120_000 }, async function (this: object) {
  const copy = copyBuildOutput(this);
  cleanCopies.set(this, copy);
  cleanRuns.set(this, await runLeakGate(copy.root));
});

Then('the gate lets the clean copy pass naming what it checked', function (this: object) {
  const run = cleanRuns.get(this);
  assert.ok(run, 'WHAT: the leak gate was never invoked on the clean copy.');
  assert.equal(
    run.exitCode,
    0,
    'WHAT: the leak gate refused (or could not examine) the clean production build. WHY: the gate '
      + 'must separate a real leak from an honest page, and it must exist at all to do either. '
      + `HOW: ship ${LEAK_GATE_SCRIPT} and let a forecast-free build pass.\n${run.output.slice(-2000)}`,
  );
  assert.ok(
    run.output.includes(run.examinedRoot),
    `WHAT: the pass does not name the examined build output ${run.examinedRoot}. WHY: a pass over `
      + 'the wrong directory reads exactly like a pass over the right one. HOW: print the examined '
      + `root.\n${run.output.slice(-2000)}`,
  );
  assert.match(
    run.output,
    /reportar/,
    `WHAT: the pass does not name the report routes it scanned. HOW: list the scanned routes.\n${run.output.slice(-2000)}`,
  );
  assert.ok(
    run.output.includes('score_q'),
    'WHAT: the pass does not name the forecast marker vocabulary it grepped for. WHY: "checked" '
      + `without "checked for what" is unverifiable. HOW: print the marker list.\n${run.output.slice(-2000)}`,
  );
  assert.match(
    run.output,
    /import/i,
    'WHAT: the pass does not mention the import-graph rule. WHY: the closure is dependency-cruiser '
      + 'rule PLUS dist grep (application-architecture.md section 9); a pass that proves only one '
      + `half claims both. HOW: run and name the forbidden-import check for report-flow source.\n${run.output.slice(-2000)}`,
  );
});

Then('the leak gate runs in the default local gate', { timeout: 60_000 }, async function (this: object) {
  const inventory = new CapturingOutput();
  const exitCode = (await runLocalCi({ argv: ['--list'], output: inventory })) as number;
  inventoryRuns.set(this, { exitCode, output: inventory.text() });
  assert.equal(exitCode, 0, `WHAT: the local CI inventory exited ${exitCode}.\n${inventory.text()}`);
  assert.match(
    inventory.text(),
    /●\s+\S*leak/,
    'WHAT: no default local CI job runs the report-leak gate. WHY: a leak guard that needs a '
      + 'remembered flag can be bypassed at merge, and the whole point of the closure is that a '
      + 'refactor cannot quietly reopen a path (adr-report-flow-leak-isolation.md). HOW: add a '
      + `default job (suggested name "leak") to scripts/ci-local-core.mjs running ${LEAK_GATE_SCRIPT} against the built output.\n${inventory.text()}`,
  );
});

Then('contained leak proofs leave the repository build output unchanged', function (this: object) {
  const state = scenarioState(this);
  assert.ok(
    state.distSnapshot,
    'WHAT: no repository build-output snapshot was taken before the contained proofs.',
  );
  assertStateDelta({
    before: state.distSnapshot,
    after: snapshotRepositoryBuildOutput(),
    universe: 'repo-root:dist',
    expected: 'identical',
    context: 'A contained leak proof that mutates the repository build output poisons every later assertion against it.',
  });
});

// ---------- the removed English tree ----------

Then('the built report screens link no removed English twin', function (this: object) {
  const documents = [...reportDocuments('reportar'), ...reportDocuments('reportado')];
  assert.ok(documents.length > 0, 'WHAT: no built report document exists to inspect. HOW: build the site first.');
  for (const document of documents) {
    const body = readFileSync(document.path, 'utf8');
    const matches = body.match(/(?:href|hreflang)="[^"]*"[^>]*|\/en\/[^"'\s<>]*/g)?.filter((m) => m.includes('/en/')) ?? [];
    assert.deepEqual(
      matches,
      [],
      `WHAT: ${document.relative} links into the removed English tree: ${JSON.stringify(matches.slice(0, 5))}. `
        + 'WHY: slice scope ships the Spanish root tree only, and an alternate link into a tree '
        + 'that does not exist is a broken promise on every report screen (HANDOFF section 6 item '
        + '3, application-architecture.md section 4 slice-01 scope). HOW: emit the report routes '
        + 'with no /en/ alternate until F-READ-IT-IN-YOUR-LANGUAGE ships the tree.',
    );
  }
});

// ---------- JavaScript off ----------

Given("the surfer's phone runs no JavaScript", function (this: object) {
  const state = scenarioState(this);
  assert.equal(state.page, null, 'test bug: JavaScript must be switched off before the phone opens a page');
  state.flags.javaScriptEnabled = false;
});

Then('the screen says exactly {string}', { timeout: 60_000 }, async function (this: object, copy: string) {
  const state = scenarioState(this);
  const text = await visibleText(state);
  assert.ok(
    text.includes(copy),
    `WHAT: the screen does not say ${JSON.stringify(copy)}. WHY: that sentence is the settled `
      + 'noscript copy, verbatim application-architecture.md section 10; without JavaScript it is '
      + 'the only honest thing the report screen can say. HOW: render it word for word.'
      + `${failureContext(state)}\nscreen said: ${JSON.stringify(text.slice(0, 300))}`,
  );
});

Then('there is no way to send a report', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const enabledSubmits = await page
    .locator('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])')
    .count();
  assert.equal(
    enabledSubmits,
    0,
    `WHAT: the report screen offers ${enabledSubmits} live submit control(s) with JavaScript off. `
      + 'WHY: without the island there is no commit, so an enabled Mandar is a label silently '
      + `dropped (application-architecture.md section 6, JS-off behaviour declared). HOW: keep the control disabled without JavaScript.${failureContext(state)}`,
  );
  const postingForms = await page.locator('form[action]').count();
  assert.equal(
    postingForms,
    0,
    `WHAT: the report screen carries ${postingForms} form(s) with a plain-HTML submission target. `
      + `WHY: a no-JS submission path would bypass the durable commit entirely. HOW: the form submits only through the island.${failureContext(state)}`,
  );
});

When('the surfer returns to the spot page', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  await page.goto(`${state.baseUrl}${SPOT_PATH}`, { waitUntil: 'load' });
});

Then('the spot page still reads fine without JavaScript', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const text = await visibleText(state);
  assert.ok(
    text.includes(SPOT_NAME),
    `WHAT: the spot page does not read as ${SPOT_NAME} without JavaScript. WHY: reading never `
      + `needs JavaScript; only reporting does (application-architecture.md section 6). HOW: keep every reading route complete publish-time HTML.${failureContext(state)}`,
  );
  for (const raw of ['undefined', 'NaN']) {
    assert.ok(
      !text.includes(raw),
      `WHAT: the spot page shows raw technical text without JavaScript: ${JSON.stringify(raw)}.${failureContext(state)}`,
    );
  }
});

// ---------- byte ceilings ----------

function gzBytesOf(path: string): number {
  return gzipSync(readFileSync(path)).length;
}

function assertDocumentsWithinCeiling(kind: 'reportar' | 'reportado', ceiling: number, label: string): void {
  const documents = reportDocuments(kind);
  assert.ok(documents.length > 0, `WHAT: no built ${kind} document exists to weigh. HOW: build the site first.`);
  for (const document of documents) {
    const bytes = gzBytesOf(document.path);
    assert.ok(bytes > 0, `WHAT: ${document.relative} measured zero gzipped bytes; the measurement cannot be trusted.`);
    assert.ok(
      bytes <= ceiling,
      `WHAT: ${document.relative} weighs ${bytes} B gz, over its ${label} ceiling (${ceiling} B). `
        + 'WHY: the report screens must load on one bar of beach signal; the ceilings are '
        + 'application-architecture.md section 4, enforced per decision 27. HOW: cut the document, '
        + 'never the honesty copy.',
    );
  }
}

Then('the report screen document weighs at most 6 KB gzipped', { timeout: 60_000 }, function (this: object) {
  assertDocumentsWithinCeiling('reportar', REPORTAR_DOCUMENT_CEILING, '6 KB');
});

Then('the saved screen document weighs at most 4 KB gzipped', { timeout: 60_000 }, function (this: object) {
  assertDocumentsWithinCeiling('reportado', REPORTADO_DOCUMENT_CEILING, '4 KB');
});

Then(
  'everything the report screen loads beyond its document stays within the 5 KB island budget',
  { timeout: 60_000 },
  function (this: object) {
    const documents = [...reportDocuments('reportar'), ...reportDocuments('reportado')];
    assert.ok(documents.length > 0, 'WHAT: no built report document exists to weigh. HOW: build the site first.');
    for (const document of documents) {
      const body = readFileSync(document.path, 'utf8');
      let scriptBytes = 0;
      const weighed: string[] = [];
      for (const reference of referencedAssetPaths(body)) {
        if (!/\.m?js$/.test(reference)) continue;
        const assetPath = resolve(DIST_ROOT, reference.replace(/^\//, ''));
        assert.ok(
          assetPath.startsWith(DIST_ROOT) && existsSync(assetPath),
          `WHAT: ${document.relative} loads a script that the build did not emit: ${reference}. `
            + 'WHY: an unreachable island is a report screen that silently cannot save. HOW: emit every referenced script.',
        );
        scriptBytes += gzBytesOf(assetPath);
        weighed.push(reference);
      }
      assert.ok(
        scriptBytes <= ISLAND_CEILING,
        `WHAT: ${document.relative} loads ${scriptBytes} B gz of script (${weighed.join(', ')}), `
          + 'over the 5 KB island budget. WHY: the report island is budgeted at 5.0 KB gz across '
          + 'both screens (application-architecture.md section 6). HOW: slim the island; the queue, '
          + 'the probe and the commit fit the budget by design.',
      );
    }
  },
);
