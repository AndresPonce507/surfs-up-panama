# Un camino de escritura que pueda inflar la factura no llega ni a desplegarse: el CI lo revienta con nombre y motivo
ID: EXP-f-tell-us-what-you-saw-cold-2 · Spec rows: slice-02 · Persona: Dueño del sitio cuidando la factura

## Intent
Nobody can deploy a write path that can run up a bill: before deploy, CI rejects a write Function
URL that is not locked to the site origin, a report function without its reserved concurrency, a
table that is not provisioned at the free tier, or a missing breaker alarm, naming what broke and
why. Sizing truth comes from `system-architecture.md` §6.1 (the corrected arithmetic), never from
`07-write-path.md` §12, which HANDOFF §6 records as falsified.

## Preconditions
Honesty first: this slice has NO page. Its observable is a message in a terminal, not a screen.
You will run a command and read what it prints; that printed text is the surface under exam. This
is a Node 22 project; everything runs through npm scripts. No AWS account and no credentials are
needed or used: the gate runs guardrail assertions plus credential-free CDK synth.

1. `cd` into the checkout under test.
2. `npm ci` (first time on this machine only).
3. `npm run ci:local` and read the output end to end. If the output names a more specific command
   for the guardrail suite alone, you may also run that one, from the same folder.
4. For each bite test below: take the name of the declaration file or value from the gate's own
   green output, never from reading source. Change or hide exactly one declared value, re-run, read
   the failure, restore exactly, re-run to green, before logging anything.

## Charter
Explore the pre-deploy guardrail gate through its command surface and verify the four write-path
protections actually bite. You are checking a guard dog: that it exists, that it says in plain
words what it watches, and that it barks when what it watches is taken away. Aim at least these
bites, one at a time, restoring between each: (1) a write Function URL's origin lock loosened or
its auth changed away from the locked-to-origin posture, (2) the report function's reserved
concurrency removed, (3) the table's billing mode moved off provisioned 25/25, (4) one breaker
alarm dropped. Probe the honest side too: what does it print when it cannot inspect at all?

## Expected observations (oracle)
- El gate corre desde el checkout limpio, sin credenciales, y termina verde nombrando en palabras
  qué protegió sobre el camino de escritura: los cuatro URLs de escritura amarrados al origen
  exacto del sitio, la concurrencia reservada de cada función (report 2, mint 1, push 1, presign
  1), la tabla en modo aprovisionado 25/25, y las alarmas de los breakers. Una lista concreta, no
  un OK pelado.
- Cada bite hace fallar el gate fuerte, y el mensaje nombra qué valor se rompió, por qué importa
  para la factura, y cómo restaurarlo. Al restaurar, vuelve a verde.
- El resultado distingue con honestidad lo que sí pudo revisar (declaraciones locales) de lo que
  requiere auditoría externa. Un verde local jamás se presenta como prueba sobre la consola real.
- Negative: un verde mudo se reporta FALLA. Si el resultado no nombra qué revisó, no se distingue
  de un gate que nunca miró.
- Negative: si el gate no pudo mirar (no encontró la declaración, o no pudo evaluarla), no puede
  decir "todo bien": tiene que declarar que no pudo y qué le faltó. "Miré y está limpio" y "no
  miré" jamás pueden imprimir lo mismo.
- Negative: después de cada bite el árbol queda exactamente como estaba: todo restaurado, el gate
  en verde, nada renombrado. Un examen que deja el repo tocado es un examen mal cerrado.

If, following the recipe, no command presents itself as the guardrail suite, or the gate's output
never names the write-path values so a bite cannot be aimed, the verdict is INDETERMINATE with
that observation written down. Never a PASS by absence.

UI N/A rationale (per HANDOFF §4): this slice changes only CDK declarations and CI assertions and
emits no HTML. U1 to U7 do not apply; no pixel check is fabricated. This terminal charter is the
U8-equivalent human examination of the slice's real surface.

Deferred, not this slice: the $18 budget deny action and the dead-man's switch observable belong
to F-BILL-STAYS-ZERO-AND-STAYS-UP. The keystone's own prediction-log lifecycle guard already
shipped and stays green; this slice only amends the write-path assert population.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
