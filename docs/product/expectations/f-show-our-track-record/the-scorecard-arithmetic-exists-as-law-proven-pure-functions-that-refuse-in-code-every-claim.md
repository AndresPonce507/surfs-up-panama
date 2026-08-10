# La aritmética del historial existe como leyes probadas que se niegan en código a publicar cualquier cifra que los datos no respalden, y los rechazos se ven fallar antes de creerles

ID: EXP-f-show-our-track-record-2 · Spec rows: slice-02 · Persona: Andres, el dueño cuya regla número uno es no reclamar jamás más certeza de la que los datos ganan

## Intent
The whole product rests on one rule: never claim more certainty than the data earns. Slice-02 is
that rule as executable arithmetic — pairing, daily aggregates, 30/90-day windows, and the
three-clause claim gate (n >= 10, five distinct trust-eligible reporters, |bias| > 2·se_gate with
the floored standard error) — proven as properties over generated fixtures, with the refusal laws
demonstrated FIRING, because a gate never seen refusing proves nothing. This slice renders
nothing, touches no cloud, and that is why every sentence it ships is true.

## Preconditions
Honesty first: this slice has NO page. Its observable is a test run and its exit code, read in a
terminal. Everything runs from the tree under test.

1. `cd /Users/andres/psb-record`
2. `npm ci` (first time on this machine only)
3. Run the slice's acceptance selection, redirected to a file with the exit code captured on the
   next statement, never through a pipeline:
   `npm run test:at -- --tags "@feature-f-show-our-track-record and @slice-02" > /tmp/s02.log 2>&1`
   then `echo $?` and read the file.
4. Run the unit suite the same way: `npm run test > /tmp/s02-unit.log 2>&1`, then `echo $?`.

## Charter
Read the run like the owner auditing his own honesty machine. The refusal laws are the product:
below five real people, below ten paired observations, or inside the noise floor, NOTHING
publishes, however large the bias looks. Look for the demonstrations that matter: the trust
filter seen actually dropping a young credential's samples under a nonzero config (an unfired
gate is not evidence), and the coordinated-liars fixture where perfectly agreeing reports never
tighten the gate. Then look for the falsifiability discipline: each refusal law is recorded as
having been watched FAILING against a deliberately broken gate, then reverted. A suite that has
never failed for the right reason proves nothing in this repository — two tests here have already
passed for accidental reasons.

## Expected observations (oracle)
- La corrida de la selección del slice termina con salida cero y nombra sus escenarios: leyes de
  emparejamiento, de orden, de ventanas, del piso del margen, del filtro de confianza, de los dos
  rechazos de la reja, de la forma del contador, de los anclajes y de la reconstrucción.
- El rechazo con menos de cinco personas y el rechazo con menos de diez pares aparecen como
  propiedades sobre datos generados, no como un ejemplo suelto cada uno.
- La demostración del filtro de confianza usa una configuración de prueba distinta de cero y se
  ve a la credencial joven perder sus muestras de toda cuenta con reja.
- El piso del margen se ve morder: reportes coordinados sin variación nunca publican antes que
  reportes honestos del mismo tamaño y el mismo sesgo.
- Negative: ningún escenario de este slice dibuja una página, siembra un reporte en ninguna
  superficie pública, ni deja rastro en `dist/` — es aritmética sobre datos de prueba y nada más.
- Negative: una fila de viento en cualquier cuenta es FALLA en voz alta, nunca una columna extra
  silenciosa. El viento salió del grano el 2026-08-08 y no vuelve por una prueba.
- Negative: si la corrida pasa con los módulos de la proyección ausentes o vacíos, eso es FALLA
  del examen mismo: una ley que no puede fallar no es una ley.

If the run cannot be selected (zero scenarios matched) the verdict is INDETERMINATE with that
observation written down — cucumber exits 0 on an empty selection and that is a vacuous green,
not a pass.

Deferred, not this slice: the counter moving on real reports (slice-03), the claim headline
(slice-04), the monthly metrics file (slice-05), and every AWS deployment concern.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
