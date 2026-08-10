// Property laws for the pure WhatsApp share-message composer (step 01-01,
// application-architecture.md §10 template). These own the two behaviors the
// step is scoped to: the message never leaks technical text, and it is
// always exactly the five-line template in order. The content oracle
// re-derives its expectation from the same canonical vocabulary constants
// the composer must consume (Hebert ch.3 "Modeling" strategy): `sizeBands`
// (src/data/size-bands.ts) and `CONFIDENCE_LEVEL_WORD_ES`
// (src/scoring/confidence.ts). The three Spanish wind words have no
// canonical export yet — report-vocab.ts exports only the wire tokens — so
// the oracle mirrors the same three words the task and src/pipeline/build.ts's
// local (unexported) mapping both use.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { WIND_STATE_TOKENS, type WindStateToken } from '../../src/data/report-vocab';
import { sizeBands, type SizeBandToken } from '../../src/data/size-bands';
import { CONFIDENCE_LEVEL_WORD_ES, type ConfidenceLevel } from '../../src/scoring/confidence';
import { composeWhatsAppCallMessage, type ShareDaySummary } from '../../src/share/whatsapp-call-message';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const SPOT_NAMES = [
  'Playa Venao', 'Morrillo', 'Punta Chame', 'Playa Serena',
  'Santa Catalina La Punta', 'Playa Los Destiladeros', 'El Palmar',
];

/** Task-given canonical words (no exported ES label exists for wind yet). */
const WIND_STATE_WORD_ES: Readonly<Record<WindStateToken, string>> = {
  clean: 'limpio',
  choppy: 'picado',
  blown_out: 'destrozado',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const fechaArbitrary = fc
  .tuple(fc.integer({ min: 1, max: 28 }), fc.constantFrom(...MONTHS_ES))
  .map(([day, month]) => `${day} de ${month}`);

const clockArbitrary = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.constantFrom('00', '15', '30', '45'))
  .map(([hour, minute]) => `${pad(hour)}:${minute}`);

const shareDaySummaryArbitrary: fc.Arbitrary<ShareDaySummary> = fc.record({
  fecha: fechaArbitrary,
  spotName: fc.constantFrom(...SPOT_NAMES),
  scoreQ: fc.integer({ min: 0, max: 100 }),
  sizeBand: fc.constantFrom(...(sizeBands.map((band) => band.value) as SizeBandToken[])),
  windState: fc.constantFrom(...WIND_STATE_TOKENS),
  windowStart: clockArbitrary,
  windowEnd: clockArbitrary,
  confidenceLevel: fc.constantFrom(...(Object.keys(CONFIDENCE_LEVEL_WORD_ES) as ConfidenceLevel[])),
});

// A controlled, safe-alphabet generator rather than fc.webUrl(): a fuzzed
// hostname could, at very low but nonzero probability, spell a forbidden
// token (e.g. "null") inside a random path segment, producing a spurious
// failure unrelated to the composer under test.
const shareLinkArbitrary = fc
  .tuple(
    fc.constantFrom('surfsuppanama.com', 'olas-panama.example', 'surfea.hoy'),
    fc.integer({ min: 2026, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 0, max: 23 }),
  )
  .map(([host, year, month, day, hour]) =>
    `https://${host}/?b=b_${year}-${pad(month)}-${pad(day)}T${pad(hour)}Z`,
  );

describe('composeWhatsAppCallMessage', () => {
  it('Property: the composed message carries zero technical text for any populated input', () => {
    fc.assert(
      fc.property(shareDaySummaryArbitrary, shareLinkArbitrary, (day, shareLink) => {
        const message = composeWhatsAppCallMessage(day, shareLink);
        assert.doesNotMatch(message, /[{}[\]]/, 'plantilla sin llenar: quedan llaves o corchetes');
        assert.doesNotMatch(
          message,
          /\b(?:ncep|gfs|dwd|ecmwf)(?:[_-]?[a-z0-9]+)*\b/i,
          'el mensaje nombra un modelo meteorológico',
        );
        assert.doesNotMatch(
          message,
          /\b(?:score_q|size_band|size_range_m|wind_state|best_window|conf_level|build_id|build_kind|spot_id|call_es)\b/i,
          'el mensaje expone un campo interno',
        );
        assert.doesNotMatch(message, /\bNaN\b|\bnull\b|\bundefined\b/, 'el mensaje imprime un valor vacío crudo');
        assert.doesNotMatch(message, /\bBest:|\bconfidence\b|\bUpdated\b/, 'el mensaje cae al inglés');
        assert.doesNotMatch(message, /—/, 'el mensaje usa una raya em, prohibida en toda copia');
      }),
      { numRuns: 100 },
    );
  });

  it('Property: the message is exactly five non-empty lines, SURF/Mejor:/size-wind-window/Confianza/link in order', () => {
    fc.assert(
      fc.property(shareDaySummaryArbitrary, shareLinkArbitrary, (day, shareLink) => {
        const message = composeWhatsAppCallMessage(day, shareLink);
        const lines = message.split('\n');

        assert.equal(lines.length, 5, `la plantilla del llamado tiene 5 líneas, el mensaje trae ${lines.length}`);
        assert.ok(lines.every((line) => line.trim() !== ''), 'ninguna línea de la plantilla puede quedar vacía');

        const [dateLine, bestLine, conditionsLine, confidenceLine, linkLine] = lines as [string, string, string, string, string];

        assert.ok(dateLine.startsWith('SURF '), 'la primera línea debe arrancar con "SURF "');
        assert.ok(dateLine.includes(day.fecha), 'la primera línea debe llevar la fecha verbatim');

        assert.ok(bestLine.startsWith('Mejor: '), 'la segunda línea debe arrancar con "Mejor: "');
        assert.ok(bestLine.includes(day.spotName), 'la segunda línea debe nombrar el spot');
        assert.match(bestLine, new RegExp(`\\b${day.scoreQ}\\b`), 'score_q debe aparecer tal cual, sin redondear ni escalar');

        const sizeEs = sizeBands.find((band) => band.value === day.sizeBand)?.label.es;
        assert.ok(sizeEs !== undefined, 'test fixture error: tamaño sin etiqueta canónica');
        assert.ok(conditionsLine.includes(sizeEs!), 'la tercera línea debe llevar el tamaño de la tabla canónica');
        assert.ok(
          conditionsLine.includes(WIND_STATE_WORD_ES[day.windState]),
          'la tercera línea debe llevar la palabra canónica del viento',
        );
        assert.ok(conditionsLine.includes(day.windowStart), 'la ventana debe llevar la hora inicial verbatim');
        assert.ok(conditionsLine.includes(day.windowEnd), 'la ventana debe llevar la hora final verbatim');

        assert.ok(confidenceLine.startsWith('Confianza '), 'la cuarta línea debe arrancar con "Confianza "');
        assert.ok(
          confidenceLine.includes(CONFIDENCE_LEVEL_WORD_ES[day.confidenceLevel]),
          'la confianza debe ser la palabra canónica de scoring/confidence.ts',
        );

        assert.equal(linkLine, shareLink, 'la quinta línea debe ser el enlace ya compuesto, verbatim');
      }),
      { numRuns: 100 },
    );
  });
});
