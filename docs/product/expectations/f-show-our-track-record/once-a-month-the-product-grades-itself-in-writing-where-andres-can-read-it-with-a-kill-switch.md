# Una vez al mes el producto se califica a sí mismo por escrito donde Andres puede leerlo, con el veredicto del interruptor que elimina un término de confianza el día que los datos digan que no sirve, y sin presumir nada en ninguna página pública

ID: EXP-f-show-our-track-record-5 · Spec rows: slice-05 · Persona: Andres, el operador que decide con el archivo, no con esperanzas

## Intent
Once a month the product grades itself in writing: pairwise ranking accuracy against the
raw-model baseline with progress toward the 400 pairs a public claim needs, Brier and the
calibration table per confidence level, MAE per key, the sigma_human ceiling, selection
imbalance, the shrinkage report — and the kill-switch verdict that removes a confidence term the
day the data shows high-confidence mornings are not more often right. Removal, not reweighting;
the spread term is the first candidate to die. The deliverable is
`learned/metrics/v1/dt=<month>/metrics.json` and the verdict inside it. **No public page renders
it: a public accuracy page is explicitly out of scope.**

## Preconditions
**HARD BLOCKED TODAY, three ways, all real.** Zero surf reports exist, so a metrics file would
be zeros — not a verdict Andres can act on. The nightly observation export that writes
`log/observations/v1` has no owner slice in any plan anywhere (feature-delta Pre-requisite 8, an
ownership gap Andres routes). And the shipped PublishedCall rows are missing the
`baseline_rank_raw` / `our_rank` fields THE metric compares against (Pre-requisite 3, flagged to
the keystone/scoring lane; recomputable from the archive, but the debt grows monthly). Until
real reports flow, every verdict is INDETERMINATE by construction. Nothing may be seeded.

When the block clears:

1. `cd /Users/andres/psb-record`
2. `npm ci` (first time on this machine only)
3. Run the monthly grading the way its own docs or `package.json` scripts name it, redirected to
   a file with the exit code captured on the next statement.
4. Open the emitted `learned/metrics/v1/dt=<month>/metrics.json` and read it whole.

## Charter
Read the file like the owner deciding what to fix next month. Are all six settled rows there,
each against its named baseline, with the pairwise ranking accuracy first because it is THE
metric? Does the file count progress toward the 400-pair ladder without any copy anywhere
claiming it early? If the calibration says high-confidence days are not more often right, is
there a recorded REMOVAL verdict naming the offending term — removal, never a quiet reweighting?
Then probe the boundary: the evaluation reads only the immutable logs and the identity
resolution; it must run to completion with no write-store access configured at all.

## Expected observations (oracle)
- El archivo del mes existe en su ruta con las seis filas asentadas: precisión de orden por
  pares contra el modelo crudo con el avance hacia los 400 pares, Brier con su calibración por
  nivel de confianza, el error por llave, el techo humano, el desbalance de selección y el
  reporte de encogimiento.
- Cada fila trae su línea base nombrada; los empates de menos de un paso de calidad quedan
  excluidos de los pares y el archivo lo dice.
- Si la calibración falla, el archivo trae un veredicto de remoción que nombra el término, y el
  término de dispersión es el primer candidato.
- La corrida termina completa sin ninguna credencial del almacén de escritura configurada.
- Negative: un mes sin pares suficientes dice cuántos hay y que no alcanza; un veredicto
  inventado sobre datos vacíos es FALLA.
- Negative: cualquier texto público, página, README o copy de venta que afirme "mejores que el
  modelo crudo" antes de ~400 pares con ventaja positiva es FALLA, venga de donde venga.
- Negative: un reajuste silencioso de un término que la calibración reprobó, en lugar de su
  remoción registrada, es FALLA del interruptor.
- Negative: si la corrida necesita acceso de escritura para leer los registros, es FALLA de
  diseño: calificarse jamás requiere poder escribir.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
