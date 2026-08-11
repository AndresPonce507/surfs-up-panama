// Slice-05: it opens like an app. The observables are the app identity the
// built home page names for itself (how a phone learns a site can live on the
// home screen), the icon files a phone would fetch at install time, and what
// a normal visit does and does not cost. The A2HS hint is deliberately NOT
// asserted present: its settled words promise avisos, no live way to ask for
// avisos exists yet, and the absence scenario guards exactly that staging
// (see the feature file's preamble for the ownership call).

import { Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DIST_ROOT,
  assertBuiltSite,
  builtFileBytes,
  ensureServedSite,
  failureContext,
  freshPhone,
  gzippedBytes,
  normalise,
  readHomeWithSignal,
  requestsAsked,
  scenarioState,
  startCountingRequests,
  visibleText,
} from './support/world';

/** Manifest plus favicon ceiling: application-architecture.md section 5 line item 5. */
const IDENTITY_CEILING_BYTES = Math.round(1.5 * 1024);

/** The settled hint's opening words — the promise that must NOT render yet. */
const AVISOS_PROMISE = '¿Quieres avisos?';
const A2HS_INSTRUCTION = 'Añadir a pantalla de inicio';

type AppIdentity = Readonly<{
  href: string | null;
  manifest: Record<string, unknown> | null;
  identityGzBytes: number | null;
  asked: string[] | null;
}>;

const identities = new WeakMap<object, AppIdentity>();

function manifestHrefFromBuiltHome(): string | null {
  const home = resolve(DIST_ROOT, 'index.html');
  if (!existsSync(home)) return null;
  const html = readFileSync(home, 'utf8');
  const link = /<link\b[^>]*rel=["']manifest["'][^>]*>/i.exec(html);
  if (link === null) return null;
  const href = /href=["']([^"']+)["']/i.exec(link[0]);
  return href?.[1] ?? null;
}

function readIdentity(): { href: string | null; manifest: Record<string, unknown> | null } {
  const href = manifestHrefFromBuiltHome();
  if (href === null) return { href: null, manifest: null };
  const bytes = builtFileBytes(href.startsWith('http') ? new URL(href).pathname : href);
  if (bytes === null) return { href, manifest: null };
  try {
    return { href, manifest: JSON.parse(bytes.toString('utf8')) as Record<string, unknown> };
  } catch {
    return { href, manifest: null };
  }
}

function iconSources(manifest: Record<string, unknown> | null): { src: string; sizes: string }[] {
  if (manifest === null) return [];
  const icons = manifest['icons'];
  if (!Array.isArray(icons)) return [];
  return icons
    .filter((icon): icon is Record<string, unknown> => typeof icon === 'object' && icon !== null)
    .map((icon) => ({ src: String(icon['src'] ?? ''), sizes: String(icon['sizes'] ?? '') }));
}

// ---------- Whens ----------

When(
  'a surfer\'s phone asks how the site wants to live on a home screen',
  { timeout: 300_000 },
  async function (this: object) {
    scenarioState(this);
    await assertBuiltSite();
    const { href, manifest } = readIdentity();
    identities.set(this, { href, manifest, identityGzBytes: null, asked: null });
  },
);

When(
  'the site owner watches a normal visit and weighs what makes the site installable',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    const { href, manifest } = readIdentity();
    let identityGzBytes: number | null = null;
    if (href !== null) {
      const manifestBytes = builtFileBytes(href.startsWith('http') ? new URL(href).pathname : href);
      const faviconBytes = builtFileBytes('/favicon.svg');
      if (manifestBytes !== null && faviconBytes !== null) {
        identityGzBytes = gzippedBytes(manifestBytes) + gzippedBytes(faviconBytes);
      }
    }
    await freshPhone(state);
    startCountingRequests();
    await readHomeWithSignal(state);
    identities.set(this, { href, manifest, identityGzBytes, asked: requestsAsked() });
  },
);

// ---------- Thens ----------

Then(
  'the site presents itself in Spanish as its own app that opens at the front page',
  function (this: object) {
    const state = scenarioState(this);
    const identity = identities.get(this);
    assert.ok(identity, `test bug: the phone never asked for the app identity.${failureContext(state)}`);
    assert.ok(
      identity.href !== null,
      'WHAT: the built home page names no app identity, so no phone can learn this site wants a '
        + 'home screen. WHY: installability is the door to the standalone context, and on iPhone '
        + 'that installed context is the only place alerts can ever be offered later. '
        + `HOW: name the settled identity from the page head (application-architecture.md section 12). `
        + `NOTE: the head is a recorded cross-lane seam — see the slice-05 roadmap step.${failureContext(state)}`,
    );
    const manifest = identity.manifest;
    assert.ok(
      manifest !== null,
      `WHAT: the app identity at ${JSON.stringify(identity.href)} is missing from the build or unreadable. `
        + `WHY: an identity the page names but the site does not serve installs nothing.${failureContext(state)}`,
    );
    assert.equal(
      manifest['display'],
      'standalone',
      `WHAT: the site would open as ${JSON.stringify(manifest['display'])}, not as its own app. `
        + 'WHY: standalone is settled because the installed context IS the future alerts context. '
        + `HOW: display standalone (application-architecture.md section 12).${failureContext(state)}`,
    );
    assert.equal(
      manifest['start_url'],
      '/',
      `WHAT: the installed app would open at ${JSON.stringify(manifest['start_url'])}, not the front page. `
        + `WHY: start_url "/" is the settled identity.${failureContext(state)}`,
    );
    assert.equal(
      manifest['lang'],
      'es',
      `WHAT: the app identity speaks ${JSON.stringify(manifest['lang'])}, not Spanish. `
        + `WHY: lang es is the settled identity; the English surface is another feature's.${failureContext(state)}`,
    );
    assert.ok(
      typeof manifest['theme_color'] === 'string' && (manifest['theme_color'] as string).length > 0,
      'WHAT: the app identity names no theme colour. WHY: the settled identity carries theme '
        + `colours per theme so the installed frame matches the site.${failureContext(state)}`,
    );
  },
);

Then(
  'both home-screen icons are real and the phone can fetch them',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const identity = identities.get(this);
    assert.ok(identity, `test bug: the phone never asked for the app identity.${failureContext(state)}`);
    const icons = iconSources(identity.manifest);
    for (const needed of ['192', '512']) {
      const icon = icons.find((candidate) => candidate.sizes.includes(`${needed}x${needed}`));
      assert.ok(
        icon !== undefined && icon.src.length > 0,
        `WHAT: the app identity names no ${needed}x${needed} icon (icons: ${JSON.stringify(icons)}). `
          + 'WHY: both settled sizes are required for a real install on both platforms; a missing '
          + 'icon installs as a grey letter. '
          + `HOW: create both icons from the favicon mark — flagged for Andres's eye, not his hands (feature-delta Pre-requisite 6b).${failureContext(state)}`,
      );
      const path = icon.src.startsWith('http') ? new URL(icon.src).pathname : icon.src;
      const emitted = builtFileBytes(path);
      assert.ok(
        emitted !== null && emitted.length > 0,
        `WHAT: the ${needed}x${needed} icon at ${JSON.stringify(icon.src)} is named but not in the build. `
          + `WHY: an icon the identity names and the site cannot serve installs as a broken image.${failureContext(state)}`,
      );
      const { baseUrl } = await ensureServedSite();
      const fetched = await fetch(`${baseUrl}${path}`).catch(() => null);
      assert.ok(
        fetched !== null && fetched.ok,
        `WHAT: asking the site for the ${needed}x${needed} icon got ${fetched === null ? 'nothing' : fetched.status}. `
          + `WHY: install time is the one moment these files are fetched; they must answer.${failureContext(state)}`,
      );
    }
  },
);

Then('the page makes no promise of avisos yet', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const now = normalise(await visibleText(state));
  for (const promise of [AVISOS_PROMISE, A2HS_INSTRUCTION]) {
    assert.ok(
      !now.includes(promise),
      `WHAT: the page shows ${JSON.stringify(promise)} while no live way to ask for avisos exists. `
        + 'WHY: the settled hint opens by promising avisos, and no slice ships a sentence that is '
        + 'untrue at the moment it ships — the same staging rule the offline copy followed. The '
        + 'alerts feature flips this hint visible in the same change that brings its subscribe '
        + 'path live, and amends this scenario then. Do not "fix" this by rendering the hint '
        + 'early. '
        + `HOW: keep the hint staged dark until the subscribe path is real (slice-05 roadmap step).${failureContext(state)}`,
    );
  }
});

Then('the app identity and the favicon together weigh 1.5 KB or less', function (this: object) {
  const state = scenarioState(this);
  const identity = identities.get(this);
  assert.ok(identity, `test bug: nothing was weighed before this check.${failureContext(state)}`);
  assert.ok(
    identity.identityGzBytes !== null,
    'WHAT: there is no app identity in the build to weigh. WHY: the weight gate for line item 5 '
      + 'only means something once the identity exists; its absence is the real finding. '
      + `HOW: ship the settled identity, then weigh it.${failureContext(state)}`,
  );
  assert.ok(
    identity.identityGzBytes <= IDENTITY_CEILING_BYTES,
    `WHAT: the app identity plus the favicon weigh ${identity.identityGzBytes} bytes gzipped, over the `
      + `${IDENTITY_CEILING_BYTES} byte ceiling. `
      + 'WHY: line item 5 of the section 5 budget is contractual; first visits pay for identity, '
      + 'never for icons. '
      + `HOW: trim the identity; icons carry the pixels, the identity only points.${failureContext(state)}`,
  );
});

Then('the visit fetched neither home-screen icon', function (this: object) {
  const state = scenarioState(this);
  const identity = identities.get(this);
  assert.ok(identity, `test bug: no visit was watched before this check.${failureContext(state)}`);
  assert.ok(
    identity.asked !== null,
    `test bug: the visit's requests were not counted.${failureContext(state)}`,
  );
  const icons = iconSources(identity.manifest);
  assert.ok(
    icons.length > 0,
    'WHAT: the app identity names no icons, so there is nothing to prove unfetched. '
      + `WHY: this guard is only evidence once the icons exist.${failureContext(state)}`,
  );
  const fetched = identity.asked.filter((request) =>
    icons.some((icon) => {
      const path = icon.src.startsWith('http') ? new URL(icon.src).pathname : icon.src;
      return path.length > 0 && request.includes(path);
    }),
  );
  assert.ok(
    fetched.length === 0,
    `WHAT: a normal visit fetched home-screen icons: ${JSON.stringify(fetched)}. `
      + 'WHY: icons are fetched at install time only — zero bytes on any visit is the settled '
      + 'budget (application-architecture.md section 5 line item 6). '
      + `HOW: point at the icons from the identity; never preload them.${failureContext(state)}`,
  );
});
