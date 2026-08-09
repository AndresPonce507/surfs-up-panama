#!/usr/bin/env node
// Live smoke against the hosted preview. This is the automated half of the
// examiner walk: it checks the things a human reviewer would otherwise have to
// eyeball on twenty pages, and it checks them against the SHIPPED artifact
// rather than against a local dev server.
//
// Why it exists: `astro preview` resolves directory URLs itself, so the local
// server hides a whole class of hosting bug. Slice-04 burned six examiner
// rounds on artifacts that disagreed with the served page. Everything here
// reads the real HTTPS origin.
//
// Usage: node scripts/preview/verify-preview.mjs [--origin https://...]
// Exits non-zero and names the failed observable, why it matters, and what to
// do next, matching the repo's gate convention.

import { readFileSync } from 'node:fs';

const DEFAULT_ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';

const originFlag = process.argv.indexOf('--origin');
const ORIGIN = originFlag === -1 ? DEFAULT_ORIGIN : process.argv[originFlag + 1];

/**
 * A metre value standing on its own, e.g. `1.2 m`. The published contract is
 * always a range carrying "≈", because a point value promises a precision four
 * wave models do not agree on. Mirrors the property test in
 * tests/unit/published-display-format.test.ts.
 */
const BARE_METRE = /(?:^|[^–\d.≈])\d+(?:[.,]\d+)?\s*m\b(?!\s*o más)/u;

const CONF_WORDS = ['confianza alta', 'confianza media', 'confianza baja'];

const failures = [];
const notes = [];

function fail(observable, why, next) {
  failures.push({ observable, why, next });
}

async function get(path) {
  const res = await fetch(`${ORIGIN}${path}`, { redirect: 'follow' });
  const body = await res.text();
  return { status: res.status, body };
}

/** Spot id -> {lat, lon}, read from the seed file the pipeline itself uses. */
function spotCoordinates() {
  const out = {};
  let text;
  try {
    text = readFileSync('data/spots/pa-pacific.yaml', 'utf8');
  } catch {
    return out;
  }
  let current = null;
  for (const line of text.split('\n')) {
    const id = line.match(/^\s*-\s*spot_id:\s*([a-z0-9-]+)/u);
    if (id) {
      current = id[1];
      out[current] = {};
      continue;
    }
    if (!current) continue;
    const lat = line.match(/^\s*lat:\s*(-?[\d.]+)/u);
    if (lat) out[current].lat = Number(lat[1]);
    const lon = line.match(/^\s*lon:\s*(-?[\d.]+)/u);
    if (lon) out[current].lon = Number(lon[1]);
  }
  return out;
}

/** Great-circle km between two seed spots, or null when either is unknown. */
function separationKm(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gu, ' ')
    .replace(/<style[\s\S]*?<\/style>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ');
}

async function main() {
  console.log(`Verifying ${ORIGIN}\n`);

  // --- home -----------------------------------------------------------------
  const home = await get('/');
  if (home.status !== 200) {
    fail(
      `home returned ${home.status}`,
      'nothing else can be trusted if the entry point is not served',
      'republish the preview with scripts/preview/publish-preview.mjs',
    );
    report();
    return;
  }

  const spotLinks = [...new Set([...home.body.matchAll(/href="(\/spots\/[^"]*)"/gu)].map((m) => m[1]))];
  if (spotLinks.length === 0) {
    fail(
      'the home page links to no spot pages',
      'the whole slice-06 journey starts by tapping a spot in the list',
      'check RankedList.astro is rendering hrefs',
    );
  }
  notes.push(`home links to ${spotLinks.length} spot pages`);

  // --- every spot link actually resolves ------------------------------------
  // This is the check that caught the 403: the site links to the directory form
  // while the build emits the file form.
  const broken = [];
  const pages = new Map();
  for (const link of spotLinks) {
    const res = await get(link);
    if (res.status !== 200) broken.push(`${link} -> ${res.status}`);
    else pages.set(link, res.body);
  }
  if (broken.length > 0) {
    fail(
      `${broken.length} of ${spotLinks.length} spot links do not resolve: ${broken.slice(0, 3).join(', ')}${broken.length > 3 ? ' ...' : ''}`,
      'a surfer taps a spot and gets an error instead of that spot page, which is the core slice-06 journey',
      'republish with scripts/preview/publish-preview.mjs, which writes the directory-form alias keys',
    );
  }

  // --- no bare exact metre value anywhere -----------------------------------
  for (const [link, html] of pages) {
    const text = stripTags(html);
    const hit = text.match(BARE_METRE);
    if (hit) {
      fail(
        `${link} shows a bare metre value "${hit[0].trim()}"`,
        'a point value promises precision the forecast does not have; the contract is always a range with "≈"',
        'render through formatSizeEs in src/publish/display-format.ts instead of composing the string inline',
      );
      break;
    }
  }

  // --- distinct spots must not show identical numbers -----------------------
  //
  // Two spots inside one wave-model grid cell receive identical forecast
  // inputs, so identical output is physics, not a cloning bug. The GFS wave
  // grid is 0.16 deg, about 18 km. playa-teta and playa-serena sit 2.58 km
  // apart and legitimately match. Outside a cell, identical numbers really do
  // mean the page is repeating a neighbour, so that stays a failure.
  //
  // This distinction is the point of the check, not a softening of it: the
  // spot-06 charter's negative is that distinct spots must not show
  // "suspiciously" copied data, and two beaches the model cannot tell apart
  // are not suspicious. What would be suspicious is two spots the model CAN
  // tell apart showing the same numbers.
  const GRID_KM = 18;
  const coords = spotCoordinates();
  const fingerprints = new Map();
  for (const [link, html] of pages) {
    const slug = link.replace(/^\/spots\//u, '').replace(/\/$/u, '');
    const nums = (stripTags(html).match(/\d+(?:[.,]\d+)?/gu) ?? []).join(',');
    if (fingerprints.has(nums) && nums.length > 20) {
      const other = fingerprints.get(nums);
      const km = separationKm(coords[slug], coords[other.slug]);
      if (km === null || km > GRID_KM) {
        fail(
          `${link} shows numbers identical to ${other.link}${km === null ? '' : ` and they are ${km.toFixed(1)} km apart`}`,
          'two spots the wave model can tell apart must not show the same data; that means the page is repeating a neighbour',
          'check the producer is writing per-spot values, not repeating days[0].spots[0]',
        );
        break;
      }
      notes.push(
        `${link} and ${other.link} match, but they are ${km.toFixed(1)} km apart, inside one ${GRID_KM} km model cell, so identical numbers are expected`,
      );
    }
    fingerprints.set(nums, { link, slug });
  }

  // --- confidence word on the list ------------------------------------------
  const homeText = stripTags(home.body).toLowerCase();
  const hasConfWord = CONF_WORDS.some((w) => homeText.includes(w));
  if (!hasConfWord) {
    notes.push('no confidence wording on the home page yet (expected until slice-07 lands)');
  }

  // --- a misspelled route must not show a raw error -------------------------
  const bad = await get('/spots/playa-venaoo/');
  const badText = bad.body.slice(0, 400);
  if (/<Error>|AccessDenied|<\?xml/u.test(badText)) {
    fail(
      `a misspelled spot route serves a raw error: ${badText.replace(/\s+/gu, ' ').slice(0, 80)}`,
      'the charter says no spot page may show a raw error or come up blank, not even a bad address',
      'publish a 404 page and map the origin 403 to it at the CDN',
    );
  }

  report();
}

function report() {
  for (const n of notes) console.log(`  note  ${n}`);
  if (failures.length === 0) {
    console.log('\nAll preview observables passed.');
    process.exit(0);
  }
  console.log('');
  for (const f of failures) {
    console.error(`FAIL  ${f.observable}`);
    console.error(`      why   ${f.why}`);
    console.error(`      next  ${f.next}\n`);
  }
  process.exit(1);
}

await main();
