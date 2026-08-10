// The render law for the share action (step 01-03).
//
// One property owns the whole step, because the component owns exactly one
// behavior: given an already-composed WhatsApp address and an already-written
// Spanish label, it emits that pair as a single plain anchor and nothing else.
// The three criteria the step lists (one anchor carrying the prewritten href /
// a Spanish accessible name / zero JavaScript shipped) are three readings of
// that same render, so they are asserted together over the full observable
// surface rather than split into three tests that would all break for one
// change.
//
// Asserting the surface as a whole is the point: `anchorCount`, `href`,
// `accessibleName`, `scriptCount` and `inlineHandlerCount` are declared in one
// place, so a second anchor, a stray handler or a swallowed label fails the
// property even though no assertion was written looking for it. That is the
// state-delta discipline in the tools this repo actually has (fast-check plus
// node:assert); there is no Python state_delta here.
//
// The message travelling through the href is a REAL composed call from step
// 01-01 sealed with a real link from step 01-02, never a fuzzed string: five
// lines with newlines, accents, a colon, commas and a whole URL inside a query
// parameter is exactly the shape that breaks naive attribute handling, and it
// is what ships.
//
// Geometry is deliberately NOT asserted here. Container rendering produces
// markup, not layout: 44 px targets, the 390 px fit and the contrast of the
// label against its real backdrop are measured on the built page by the U1-U7
// gate and the slice-01 acceptance run, which is where a pixel actually
// exists.
//
// HTML is read with narrow regexes rather than a parser: the only DOM parsers
// on disk (parse5) arrive as transitive dependencies of other packages, and a
// unit test may not depend on a package this project has not declared. The
// fragment under test is one wrapper and one anchor, which is well inside what
// a regex can read honestly.

import assert from 'node:assert/strict';

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import fc from 'fast-check';
import { describe, it } from 'vitest';

// `tsc --noEmit` cannot resolve a `.astro` specifier: Astro ships no ambient
// `*.astro` module declaration, and the plugin that resolves one runs in
// editors and in `astro check`, not in the typecheck gate. Vitest resolves it
// for real through Astro's compiler (vitest.config.ts), which is what the test
// actually runs against. Suppressed as `expect-error` rather than `ignore` on
// purpose: the day the toolchain does resolve it, this line fails and asks to
// be deleted.
// @ts-expect-error -- see above
import ShareControls from '../../src/components/ShareControls.astro';
import { stampedShareLink, whatsAppShareHref } from '../../src/share/share-link';
import { composeWhatsAppCallMessage, type ShareDaySummary } from '../../src/share/whatsapp-call-message';

/** The observable surface of one render: everything the published page can see. */
type RenderedShareAction = {
  readonly anchorCount: number;
  readonly href: string;
  readonly accessibleName: string;
  readonly scriptCount: number;
  readonly inlineHandlerCount: number;
};

function decodeEntities(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function attribute(openingTag: string, name: string): string | undefined {
  const found = openingTag.match(new RegExp(`\\s${name}="([^"]*)"`));
  const value = found?.[1];
  return value === undefined ? undefined : decodeEntities(value);
}

function observe(html: string): RenderedShareAction {
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const openingTag = anchors[0]?.[1] ?? '';
  const visibleText = decodeEntities((anchors[0]?.[2] ?? '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
  return {
    anchorCount: anchors.length,
    href: attribute(openingTag, 'href') ?? '',
    // The accessible name of a plain anchor: its label override if one exists,
    // otherwise the words a person reads. Same reading the published-surface
    // audit performs.
    accessibleName: attribute(openingTag, 'aria-label') ?? visibleText,
    scriptCount: [...html.matchAll(/<script\b/gi)].length,
    inlineHandlerCount: [...html.matchAll(/\son[a-z]+="/gi)].length,
  };
}

/**
 * Two published mornings that between them carry the hostile shapes: accents,
 * a one-word and a four-word spot name, the score at both ends of its range,
 * and both a clean and a destroyed wind.
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
    spotName: 'Playa Los Destiladeros',
    scoreQ: 0,
    sizeBand: 'flat',
    windState: 'blown_out',
    windowStart: '16:30',
    windowEnd: '18:00',
    confidenceLevel: 'low',
  },
];

/** Fictional origins only: no component may carry the real host. */
const prewrittenHrefArbitrary = fc
  .tuple(
    fc.constantFrom(...DAY_SUMMARIES),
    fc.constantFrom('https://olas-registradas.example', 'https://surfea.example/', 'https://pronostico.example.org:8443'),
    fc.constantFrom('2026-08-09T11:00:00.000Z', '2027-01-31T23:45:12.000Z'),
  )
  .map(([day, configuredSite, publishedAt]) =>
    whatsAppShareHref(composeWhatsAppCallMessage(day, stampedShareLink(configuredSite, publishedAt))),
  );

/**
 * Spanish label text, from one word to the longest phrase the coast can throw
 * at a phone: accents, capitals and the longest spot name on the surface.
 */
const spanishLabelArbitrary = fc
  .array(
    fc.constantFrom(
      'Mandar',
      'el',
      'llamado',
      'al',
      'grupo',
      'Compartir',
      'por',
      'WhatsApp',
      'Playa',
      'Los',
      'Destiladeros',
      'Santa',
      'Catalina',
      'La',
      'Punta',
      'ahora',
      'mañana',
    ),
    { minLength: 1, maxLength: 9 },
  )
  .map((words) => words.join(' '));

describe('ShareControls', () => {
  it('Property: any prewritten call and any Spanish label render as exactly one plain anchor carrying both, with no script', async () => {
    const container = await AstroContainer.create();

    await fc.assert(
      fc.asyncProperty(prewrittenHrefArbitrary, spanishLabelArbitrary, async (href, label) => {
        const surface = observe(await container.renderToString(ShareControls, { props: { href, label } }));

        assert.equal(
          surface.anchorCount,
          1,
          `la tarjeta debe ofrecer una sola acción de WhatsApp y renderizó ${surface.anchorCount}`,
        );
        assert.equal(
          surface.href,
          href,
          'la acción no lleva el llamado ya escrito que se le pasó, carácter por carácter',
        );
        assert.equal(
          surface.accessibleName,
          label,
          'el nombre accesible de la acción no es la etiqueta en español completa que se le pasó',
        );
        assert.equal(surface.scriptCount, 0, 'la acción manda JavaScript y debe ser un ancla normal');
        assert.equal(
          surface.inlineHandlerCount,
          0,
          'la acción trae un manejador en línea y debe funcionar con los scripts apagados',
        );
      }),
      { numRuns: 100 },
    );
  });
});
