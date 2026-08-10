// Property laws for the two share addresses (step 01-02). These own the two
// behaviors the step is scoped to.
//
// Law 1 is the config-follows-configuration law: for ANY configured site and
// ANY publish instant, the closing line of the message is an absolute https
// address whose origin is that configured site, ending in the P1 build stamp
// of that instant. The site generator holds only fictional origins and never
// the one in astro.config.mjs, so a hostname written by hand anywhere under
// src/share fails this law on every draw. That is the executable form of "no
// hostname literal under src/share" — stronger than reading the source, since
// it also catches a literal reached through an import.
//
// The stamp oracle is built from the same integer components the instant is
// generated from (Hebert ch.3 "generalizing example tests": embed the known
// answer in the input, predict where it surfaces in the output), so it never
// re-derives through the code under test.
//
// Law 2 is the carrier symmetry (Hebert ch.3 "symmetric properties"): whatever
// the composer wrote, decoding the anchor's text parameter gives it back
// character for character. The message under test is a real composed one from
// step 01-01, not a fuzzed string, because that is exactly what ships: five
// lines with newlines, accents, commas, colons and a URL inside a query
// parameter.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { stampedShareLink, whatsAppShareHref } from '../../src/share/share-link';
import { composeWhatsAppCallMessage, type ShareDaySummary } from '../../src/share/whatsapp-call-message';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Fictional origins only. The real configured host of this project must never
 * appear here: this generator is what proves the code reads the parameter.
 * Both the bare form (astro.config.mjs's literal) and the trailing-slash form
 * (what `String(Astro.site)` hands a component) are drawn, since both reach
 * production callers.
 */
const configuredSiteArbitrary = fc
  .tuple(
    fc.constantFrom('olas-registradas.example', 'surfea.example', 'pronostico.example.org', 'd3xample.cloudfront.example'),
    fc.constantFrom('', ':8443'),
    fc.constantFrom('', '/'),
  )
  .map(([host, port, trailingSlash]) => `https://${host}${port}${trailingSlash}`);

/** A publish instant plus the stamp the P1 header contract owes it. */
const publishInstantArbitrary = fc
  .record({
    year: fc.integer({ min: 2026, max: 2032 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ year, month, day, hour, minute, second }) => ({
    publishedAt: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.000Z`,
    expectedStamp: `b_${year}-${pad(month)}-${pad(day)}T${pad(hour)}Z`,
  }));

/**
 * Three published mornings that between them carry every shape the carrier has
 * to survive: accents, a two-word and a five-word spot name, all three wind
 * words, and the score at both ends of its range.
 */
const DAY_SUMMARIES: readonly ShareDaySummary[] = [
  {
    fecha: '9 de agosto',
    spotName: 'Playa Venao',
    scoreQ: 78,
    sizeBand: 'chest_head',
    windState: 'clean',
    windowStart: '06:00',
    windowEnd: '09:00',
    confidenceLevel: 'high',
  },
  {
    fecha: '1 de diciembre',
    spotName: 'Santa Catalina La Punta',
    scoreQ: 100,
    sizeBand: 'head_overhead',
    windState: 'choppy',
    windowStart: '05:45',
    windowEnd: '07:15',
    confidenceLevel: 'medium',
  },
  {
    fecha: '28 de febrero',
    spotName: 'Playa Los Destiladeros',
    scoreQ: 0,
    sizeBand: 'flat',
    windState: 'blown_out',
    windowStart: '16:30',
    windowEnd: '18:00',
    confidenceLevel: 'low',
  },
];

describe('stampedShareLink', () => {
  it('Property: for any configured site and publish instant the link is absolute https on that site, sealed with that morning stamp', () => {
    fc.assert(
      fc.property(configuredSiteArbitrary, publishInstantArbitrary, (configuredSite, instant) => {
        const link = stampedShareLink(configuredSite, instant.publishedAt);

        assert.ok(link.startsWith('https://'), `la dirección compartida no es absoluta https: "${link}"`);

        const shared = new URL(link);
        assert.equal(
          shared.origin,
          new URL(configuredSite).origin,
          'la dirección no deriva del sitio configurado que se le pasó',
        );
        assert.doesNotMatch(shared.hostname, /^(?:localhost|127\.)/, 'la dirección apunta al host local');
        assert.equal(
          shared.searchParams.get('b'),
          instant.expectedStamp,
          'el sello no es el de la mañana publicada que se le pasó',
        );
        assert.match(link, /\?b=b_\d{4}-\d{2}-\d{2}T\d{2}Z$/, 'la dirección no termina en un sello con la forma b_AAAA-MM-DDTHHZ');
      }),
      { numRuns: 200 },
    );
  });
});

describe('whatsAppShareHref', () => {
  it('Property: the wa.me action decodes its text back to the exact composed message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DAY_SUMMARIES),
        configuredSiteArbitrary,
        publishInstantArbitrary,
        (day, configuredSite, instant) => {
          const message = composeWhatsAppCallMessage(day, stampedShareLink(configuredSite, instant.publishedAt));
          const href = whatsAppShareHref(message);

          assert.ok(
            href.startsWith('https://wa.me/?text='),
            `la acción no es un ancla absoluta al portador sin número: "${href}"`,
          );
          const carrier = new URL(href);
          assert.equal(carrier.protocol, 'https:', 'la acción no es https');
          assert.equal(carrier.host, 'wa.me', `la acción apunta a ${carrier.host} y no al portador wa.me`);
          assert.equal(carrier.pathname, '/', 'la acción fija un número en vez de dejar elegir el chat');
          assert.equal(
            carrier.searchParams.get('text'),
            message,
            'el mensaje que viaja en la acción no es exactamente el que compuso el llamado',
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
