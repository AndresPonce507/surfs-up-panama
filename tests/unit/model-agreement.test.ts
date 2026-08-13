// F-KNOW-HOW-MUCH-TO-TRUST-IT, slice-01.
//
// Two things are proven here, and they are separate concerns that happen to
// meet in the same module:
//
//   1. `modelAgreement` — the pure per-variable reading of the published
//      spread terms, and the Spanish sentence composed from it. Research 09
//      section 8.4 bullet 3 and section 14.4: name the specific disagreement,
//      never a generic "conditions may vary".
//
//   2. The fake-zero guard inside `confidence`. Research 09 section 8.3
//      Finding 2: `H == 0 && T == 0` is a land-masked grid cell, not a flat
//      ocean, and any code reading model output must treat it as MISSING.
//      `blend()` already refuses it; `confidence()` did not, and it consumes
//      the same member list.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  DISAGREEMENT_THRESHOLD,
  SPREAD_VARIABLES,
  confidence,
  confidenceReasonEs,
  modelAgreement,
  type ConfidenceLevel,
  type ModelAgreement,
  type SpreadTerms,
  type SpreadVariable,
} from '../../src/scoring/confidence';

// Slice-03, F-KNOW-HOW-MUCH-TO-TRUST-IT: `modelAgreement` gained a required
// third `factors` argument (the per-factor removability switch). Every call
// in this file predates the flag and is about the term ENABLED, so passing
// this fixed constant everywhere below preserves each assertion's meaning
// exactly; the flag-off readings are pinned separately by the acceptance
// contract `el-termino-que-se-puede-apagar.feature`.
const SPREAD_ON = { spread: true } as const;
import { blend, type MemberRow } from '../../src/scoring/engine';
import { FACTOR_VOCAB } from '../../src/publish/factor-vocab';

const term = () => fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true });
const terms = (): fc.Arbitrary<SpreadTerms> =>
  fc.record({ height: term(), period: term(), direction: term() });
const level = (): fc.Arbitrary<ConfidenceLevel> => fc.constantFrom('low', 'medium', 'high');

function member(source: string, h_m: number, t_s: number, dir_deg: number): MemberRow {
  return { source, lead_h: 0, swell: { h_m, t_s, dir_deg }, swell2: null };
}

// The three real Playa Venao members that research 09 section 8.2 measured
// live on 2026-08-08, minus the fourth, so the fake zero can take its place.
const VENAO_REAL_MEMBERS: MemberRow[] = [
  member('a', 0.64, 15.5, 206),
  member('b', 0.66, 15.5, 204),
  member('c', 0.78, 11.6, 212),
];
const LAND_MASKED_MEMBER = member('d', 0, 0, 0);

describe('modelAgreement — the threshold is pinned by the research, not by taste', () => {
  it("reproduces section 7.5's own worked Playa Venao reading: agree on size and direction, split on period", () => {
    // The exact three penalty terms research 09 section 7.5 computes from the
    // measured Venao members, and the exact sentence it writes from them:
    // "Models agree on size and direction but split badly on period".
    const venao: SpreadTerms = { height: 0.239, period: 0.832, direction: 0.09 };

    const reading = modelAgreement(venao, 'low', SPREAD_ON);

    assert.equal(reading.kind, 'compared');
    assert.deepEqual(reading.kind === 'compared' ? [...reading.agree].sort() : [], ['direction', 'height']);
    assert.deepEqual(reading.kind === 'compared' ? [...reading.disagree] : [], ['period']);
  });

  it('keeps the threshold inside the window that worked reading forces', () => {
    // 0.239 must read as agreement and 0.832 must read as disagreement, so
    // any threshold outside this half-open interval contradicts the document
    // that justifies the feature.
    assert.ok(DISAGREEMENT_THRESHOLD > 0.239, `threshold ${DISAGREEMENT_THRESHOLD} would call Venao's height a disagreement`);
    assert.ok(DISAGREEMENT_THRESHOLD <= 0.832, `threshold ${DISAGREEMENT_THRESHOLD} would call Venao's period an agreement`);
  });
});

describe('modelAgreement — laws', () => {
  it('partitions the three variables: every variable lands in exactly one side', () => {
    fc.assert(fc.property(terms(), level(), (spread, confLevel) => {
      const reading = modelAgreement(spread, confLevel, SPREAD_ON);
      if (reading.kind !== 'compared') return;
      const seen = [...reading.agree, ...reading.disagree].sort();
      assert.deepEqual(seen, [...SPREAD_VARIABLES].sort());
      for (const variable of reading.agree) assert.ok(!reading.disagree.includes(variable));
    }));
  });

  it('is monotone: raising one variable never moves it back into agreement', () => {
    fc.assert(fc.property(
      terms(),
      level(),
      fc.constantFrom<SpreadVariable>(...SPREAD_VARIABLES),
      fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }),
      (spread, confLevel, variable, bump) => {
        const before = modelAgreement(spread, confLevel, SPREAD_ON);
        const after = modelAgreement({ ...spread, [variable]: spread[variable] + bump }, confLevel, SPREAD_ON);
        if (before.kind !== 'compared' || after.kind !== 'compared') return;
        if (before.disagree.includes(variable)) assert.ok(after.disagree.includes(variable));
      },
    ));
  });

  it('never reports agreement when the terms are all zero and the level is low: that is one model, not consensus', () => {
    // A single usable member caps c_spread at 0.4 (research 09 section 7.5's
    // f(M)), so c_total <= 0.4, so the level is low. Zero terms with a level
    // ABOVE low can only come from two or more members that genuinely agreed.
    fc.assert(fc.property(level(), (confLevel) => {
      const reading = modelAgreement({ height: 0, period: 0, direction: 0 }, confLevel, SPREAD_ON);
      if (confLevel === 'low') {
        assert.equal(reading.kind, 'not_comparable');
        return;
      }
      assert.equal(reading.kind, 'compared');
      assert.deepEqual(reading.kind === 'compared' ? [...reading.disagree] : ['unreachable'], []);
    }));
  });
});

describe('confidenceReasonEs — what a surfer actually reads', () => {
  /** One reading of every shape the surface can produce. Built inside the
   * tests, never at describe time, so a throwing scaffold fails each test
   * behaviourally instead of breaking collection. */
  const everyReading = (): ModelAgreement[] => [
    modelAgreement({ height: 0, period: 0, direction: 0 }, 'low', SPREAD_ON),
    modelAgreement({ height: 0, period: 0, direction: 0 }, 'medium', SPREAD_ON),
    modelAgreement({ height: 0.239, period: 0.832, direction: 0.09 }, 'medium', SPREAD_ON),
    modelAgreement({ height: 9, period: 9, direction: 9 }, 'low', SPREAD_ON),
    modelAgreement({ height: 9, period: 0.01, direction: 0.01 }, 'medium', SPREAD_ON),
  ];

  it('names a concrete variable, or says outright that there is nothing to compare', () => {
    fc.assert(fc.property(terms(), level(), (spread, confLevel) => {
      const sentence = confidenceReasonEs(confLevel, modelAgreement(spread, confLevel, SPREAD_ON));
      const namesAVariable = /tamaño|período|dirección/u.test(sentence);
      const saysNothingToCompare = /no hay con qué comparar/u.test(sentence);
      assert.ok(namesAVariable || saysNothingToCompare, `frase vaga: "${sentence}"`);
    }));
  });

  it('keeps every honesty invariant the published surface depends on', () => {
    fc.assert(fc.property(terms(), level(), (spread, confLevel) => {
      const sentence = confidenceReasonEs(confLevel, modelAgreement(spread, confLevel, SPREAD_ON));
      // Slice-07's three standing assertions, which must not regress.
      assert.match(sentence, /modelo/iu, 'toda razón nombra a los modelos');
      assert.match(sentence, /nadie.*playa|playa.*nadie/isu, 'toda razón dice que nadie reportó desde la playa');
      // Research 09 section 3.6: a qualitative flag, never a calibrated figure.
      assert.doesNotMatch(sentence, /\d|%/u, 'la confianza nunca se muestra como cifra');
      // Project copy rule: no em dashes anywhere in a UI string.
      assert.doesNotMatch(sentence, /—/u, 'sin rayas largas');
      // Project copy rule: zero technical text on the Spanish surface.
      assert.doesNotMatch(sentence, /\b(?:ncep|gfs|dwd|ecmwf|meteofrance|gwam|wam|json|null|undefined)\b/iu);
    }));
  });

  it('never claims agreement on a reading that is not comparable', () => {
    const sentence = confidenceReasonEs('low', modelAgreement({ height: 0, period: 0, direction: 0 }, 'low', SPREAD_ON));
    assert.doesNotMatch(sentence, /modelos coinciden/iu, 'una sola opinión no puede leerse como acuerdo');
    assert.match(sentence, /no hay con qué comparar/u);
  });

  it('never claims "Hoy" in the not-comparable sentence, because RankedList renders the exact same sentence unchanged on the Mañana page', () => {
    // Source-blind examination (Vera, 2026-08-13) caught this verbatim: the
    // Mañana page's own rank-1 disclosure read "Hoy solo un modelo alcanza a
    // ver este spot...", carrying the word "Hoy" onto the tomorrow page.
    // `confidenceReasonEs` has no day parameter and RankedList.astro does not
    // thread one through Confidence.astro, so the sentence must be true on
    // both days by construction: day-neutral wording, not a claim about
    // "today" specifically. Property over every level, because a caller may
    // construct `not_comparable` at any level even though `modelAgreement`
    // itself only produces it at `low`.
    fc.assert(fc.property(level(), (confLevel) => {
      const sentence = confidenceReasonEs(confLevel, { kind: 'not_comparable' });
      assert.doesNotMatch(
        sentence,
        /\bhoy\b/iu,
        `WHAT: the not-comparable reason for "${confLevel}" claims "Hoy" (today). WHY: this exact sentence renders unchanged on the Mañana (tomorrow) page, so it must never name a specific day. Got "${sentence}".`,
      );
    }));
  });

  it('says every distinct reading differently, so the sentence carries information', () => {
    const sentences = everyReading().map((reading) => confidenceReasonEs('medium', reading));
    assert.equal(new Set(sentences).size, sentences.length, `dos lecturas distintas produjeron la misma frase: ${sentences.join(' | ')}`);
  });

  it('says the two shared factor words exactly as the one shared vocabulary module says them', () => {
    // `src/publish/factor-vocab.ts` exists precisely so this feature and
    // f-see-what-killed-it cannot drift on the same words. The scoring core
    // must not import the publish layer, so the words are declared locally
    // and asserted equal here, mirroring tests/unit/weakest-link-vocab.test.ts.
    const sentence = confidenceReasonEs('medium', modelAgreement({ height: 9, period: 0.01, direction: 9 }, 'medium', SPREAD_ON));
    assert.match(sentence, new RegExp(FACTOR_VOCAB.size.noun, 'u'), 'el tamaño se dice como lo dice el vocabulario compartido');
    assert.match(sentence, new RegExp(FACTOR_VOCAB.dir.noun, 'u'), 'la dirección se dice como la dice el vocabulario compartido');
  });
});

describe('the fake zero must be missing everywhere, not only in the blend', () => {
  it('excludes a H=0 T=0 member from the blend instead of averaging it in', () => {
    const withoutFake = blend([...VENAO_REAL_MEMBERS]);
    const withFake = blend([...VENAO_REAL_MEMBERS, LAND_MASKED_MEMBER]);

    assert.equal(withoutFake.kind, 'ok');
    assert.equal(withFake.kind, 'ok');
    if (withoutFake.kind !== 'ok' || withFake.kind !== 'ok') return;
    assert.deepEqual(withFake.swell, withoutFake.swell, 'el cero falso movió el promedio del oleaje');
    assert.equal(withFake.members_used, 3);
    assert.equal(withFake.members_null, 1, 'el cero falso debe contarse como ausente, no como usado');
  });

  it('excludes a H=0 T=0 member from the spread terms instead of exploding them', () => {
    const withoutFake = confidence(VENAO_REAL_MEMBERS, { kind: 'absolute' }, null, null, []);
    const withFake = confidence([...VENAO_REAL_MEMBERS, LAND_MASKED_MEMBER], { kind: 'absolute' }, null, null, []);

    assert.deepEqual(
      withFake.spread_terms,
      withoutFake.spread_terms,
      'una celda enmascarada por tierra cambió el desacuerdo entre modelos: la página diría que los modelos no se ponen de acuerdo cuando sí',
    );
    assert.equal(withFake.level, withoutFake.level, 'el cero falso movió el nivel de confianza publicado');
  });

  it('reads the same agreement with and without the fake zero, on the sentence a surfer sees', () => {
    const real = confidence(VENAO_REAL_MEMBERS, { kind: 'absolute' }, null, null, []);
    const poisoned = confidence([...VENAO_REAL_MEMBERS, LAND_MASKED_MEMBER], { kind: 'absolute' }, null, null, []);

    assert.equal(
      confidenceReasonEs(poisoned.level, modelAgreement(poisoned.spread_terms, poisoned.level, SPREAD_ON)),
      confidenceReasonEs(real.level, modelAgreement(real.spread_terms, real.level, SPREAD_ON)),
    );
  });

  it('treats a spot where every model is land masked as not comparable, never as flat agreement', () => {
    const allMasked = confidence(
      [member('a', 0, 0, 0), member('b', 0, 0, 0), member('c', 0, 0, 0)],
      { kind: 'absolute' },
      null,
      null,
      [],
    );
    const reading = modelAgreement(allMasked.spread_terms, allMasked.level, SPREAD_ON);
    assert.equal(reading.kind, 'not_comparable');
  });
});
