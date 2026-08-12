// Slice-05 acceptance steps: the monthly self-grading file.
//
// Skip-gated whole by @blocked-on-real-reports (blocked-gate.steps.ts). The
// slice is operator-facing: the deliverable is
// learned/metrics/v1/dt=<month>/metrics.json plus the kill-switch verdict
// inside it, and NO public page renders it — a public accuracy page is
// explicitly out of scope (feature-delta.md Out-of-scope table).
//
// Three real absences stand behind the tag, each named where a step needs
// it: zero surf reports exist; the nightly observation export
// (07-write-path.md section 7.4, AP13) has NO owner slice anywhere
// (Pre-requisite 8, an ownership gap Andres routes); and the shipped
// PublishedCall rows are missing baseline_rank_raw / our_rank
// (Pre-requisite 3, flagged to the keystone/scoring lane 2026-08-09 — both
// recomputable from the immutable archive, but every month of drift grows
// the recompute debt).
//
// The driving port when this unblocks: gradeMonth in
// src/scorecard/metrics-job — reads only predictions/, log/observations/,
// log/calls/ and the identity resolution (06 section 2 boundary), returns
// the metrics file content. It never touches the write store.

import { Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const SCOPE = '@feature-f-show-our-track-record and @slice-05';

const DATA_BLOCK =
  'HARD BLOCK, still standing: zero surf reports exist, so a month of metrics would be a file ' +
  'of zeros, which is not a verdict Andres can act on (feature-delta.md slice-05 row). ' +
  'Additionally the nightly observation export that writes log/observations/v1 has no owner ' +
  'slice anywhere (Pre-requisite 8) and the PublishedCall baseline fields are missing ' +
  '(Pre-requisite 3).';

type Slice05State = {
  metrics: Record<string, unknown> | null;
};

let state: Slice05State = { metrics: null };

Before({ tags: SCOPE }, function () {
  state = { metrics: null };
});

// ---------------------------------------------------------------- Given

Given('reportes reales donde una misma persona calificó dos playas el mismo día', function () {
  assert.fail(DATA_BLOCK);
});

Given('un mes con reportes reales en los registros', function () {
  assert.fail(DATA_BLOCK);
});

Given('un mes cuya calibración muestra que la confianza alta no acierta más que la baja', function () {
  assert.fail(
    DATA_BLOCK +
      ' At re-entry this precondition may be fixture-driven: the kill-switch RULE (a failing ' +
      'calibration produces a recorded removal of the offending confidence term, removal not ' +
      'reweighting, C_spread first candidate — 06 section 10, research 09 section 3.6) is ' +
      'arithmetic, and fixtures may exercise arithmetic. They may never stand in for a real verdict.',
  );
});

Given('un archivo mensual con avance real hacia los 400 pares', function () {
  assert.fail(DATA_BLOCK);
});

Given('la calificación mensual configurada sin ningún acceso al almacén de escritura', function () {
  assert.fail(
    'completed at DISTILL re-entry: the boundary law (06 section 2 — the evaluation reads only ' +
      'predictions/, log/observations/, log/calls/ and the identity resolution) is asserted by ' +
      'running the grading with no write-store access configured at all and watching it finish.',
  );
});

Given('un mes cuyos registros no tienen ni un par comparable', function () {
  assert.fail(
    DATA_BLOCK +
      ' Note for re-entry: this zero-pairs scenario is the FIRST one DELIVER lights up — it is ' +
      'the honest state of the very first monthly run, and the file must state the counts and ' +
      'the insufficiency instead of inventing a verdict.',
  );
});

// ----------------------------------------------------------------- When

When('la calificación mensual arma los pares de comparación', async function () {
  await loadGrading();
  assert.fail('unreachable until the block clears; kept explicit so the run never passes vacuously');
});

When('corre la calificación mensual', async function () {
  await loadGrading();
  assert.fail('unreachable until the block clears; kept explicit so the run never passes vacuously');
});

When('se revisan todas las páginas y textos que el sitio emite', function () {
  assert.fail(
    'completed at DISTILL re-entry: sweeps the built public surface for product-level accuracy ' +
      'claims ("better than the raw model") which no copy may make before ~400 same-day pairs ' +
      'show positive lift (06 section 10; research 09 section 10.4).',
  );
});

async function loadGrading(): Promise<void> {
  // Specifier held in a variable on purpose: the module does not exist until
  // the slice unblocks, and a literal specifier would fail typecheck.
  const specifier = '../../../../src/scorecard/metrics-job';
  try {
    const mod = (await import(specifier)) as Record<string, unknown>;
    assert.equal(
      typeof mod['gradeMonth'],
      'function',
      'src/scorecard/metrics-job exists but exports no gradeMonth function; the acceptance ' +
        'suite drives the whole slice through that one port.',
    );
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.fail(
      'src/scorecard/metrics-job does not exist yet: no module computes the monthly ' +
        'self-grading (pairwise ranking accuracy vs B1, Brier + calibration vs B0, MAE per key, ' +
        'sigma_human, selection imbalance, shrinkage report, and the kill-switch verdict). The ' +
        'settled table is 06-learning-layer.md section 10.',
    );
  }
}

// ----------------------------------------------------------------- Then

Then('cada par pregunta si nuestro orden coincidió con el de esa persona', function () {
  assert.fail('completed at DISTILL re-entry: within-person pairs, same reporter, same local day, 2+ spots rated.');
});

Then('los empates de menos de un paso de calidad quedan fuera', function () {
  assert.fail('completed at DISTILL re-entry: the tie-exclusion rule of THE metric (06 section 10, row 1).');
});

Then('cada par se compara también contra el orden del modelo crudo', function () {
  assert.fail(
    'completed at DISTILL re-entry: the B1 baseline (baseline_rank_raw vs our_rank). The ' +
      'shipped PublishedCall writer emits neither field (Pre-requisite 3, flagged to the ' +
      'keystone/scoring lane); until they land, the baseline is recomputed from the immutable ' +
      'archive, and the recompute debt grows monthly.',
  );
});

Then('el archivo del mes trae las seis filas asentadas, cada una con su línea base', function () {
  assert.fail('completed at DISTILL re-entry: the six-row table of 06 section 10, verbatim as the oracle.');
});

Then('el avance hacia los 400 pares aparece contado, nunca presumido', function () {
  assert.fail('completed at DISTILL re-entry: the file counts progress toward the product-claim ladder; no copy claims it.');
});

Then('el archivo registra un veredicto de remoción del término de confianza señalado', function () {
  assert.fail('completed at DISTILL re-entry: a failing calibration produces a recorded removal verdict.');
});

Then('el veredicto es eliminar, nunca reponderar, y el primer candidato es el término de dispersión', function () {
  assert.fail(
    'completed at DISTILL re-entry: removal not reweighting (research 09 section 3.6 ' +
      'consequence 3, four cited studies); C_spread is the first candidate to die (06 section 10).',
  );
});

Then('ninguna superficie pública afirma que somos mejores que el modelo crudo', function () {
  assert.fail('completed at DISTILL re-entry: the sweep proves the claim ladder separation on the built surface.');
});

Then('el único lugar donde el avance existe es el archivo que lee Andres', function () {
  assert.fail('completed at DISTILL re-entry: learned/metrics/v1/dt=<month>/metrics.json, and nowhere public.');
});

Then('la corrida termina completa leyendo solo los tres registros y la resolución de identidad', function () {
  assert.fail('completed at DISTILL re-entry: the 06 section 2 read boundary, observed on a real run.');
});

Then('ningún paso intenta tocar el almacén de escritura', function () {
  assert.fail('completed at DISTILL re-entry: no write-store access is configured and the run still finishes.');
});

Then('el archivo dice cuántos pares hay, cero, y que no alcanza para calificar', function () {
  const metrics = state.metrics;
  assert.ok(metrics, 'test harness error: no metrics file content captured');
  assert.fail('completed at DISTILL re-entry: the zero-pairs month states its counts and its insufficiency.');
});

Then('ningún veredicto ni cifra de acierto aparece en el archivo', function () {
  assert.fail('completed at DISTILL re-entry: an empty month must never carry an invented verdict.');
});
