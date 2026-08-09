# Un cambio de infra que tocaría los recibos de ayer o soltaría el freno del gasto revienta el CI con nombre y motivo
ID: EXP-daily-call-with-permanent-receipts-2 · Spec rows: slice-02 · Persona: Dueño del sitio cuidando el archivo y la factura

## Intent
Nobody can quietly destroy yesterday's receipts or unbound the bill: before deploy, an infra change that would expire or touch the prediction log, or drop any locally declared cost guardrail value, fails CI loudly, naming what broke and why. This guard covers prediction-log lifecycle safety and all eleven declared values for log retention, lifecycle rules, reserved concurrency, and timeouts. Anthropic and CloudFront are honest external-audit concerns, not proof supplied by a local declaration check. The dead-man's switch observable and the $18 budget deny action are deferred to F-BILL-STAYS-ZERO-AND-STAYS-UP.

## Preconditions
Honesty first: this slice has NO page. Its observable is a message in a terminal, not a screen. You will run a command and read what it prints; that printed text is the surface under exam. This is a Node 22 project; everything runs through npm scripts. No pytest, no cargo.

Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run ci:local` and read the output end to end. The guardrail assertion suite runs inside this gate. If the output names a more specific command for the guardrail suite alone, you may also run that one, from this same folder.
4. For the bite test below: the gate's green output must itself NAME the file or folder holding the infra definition it checked. Take that name from the gate's own output, never from reading source. Hide it by renaming it with an `.aside` suffix, re-run step 3 and read the failure, then rename it back exactly as it was and re-run step 3 once more to green, before logging anything.

## Charter
Explore the pre-deploy guardrail gate through its command surface to verify that the protection over the prediction log and every locally declared cost guardrail actually bites. You are checking a guard dog: that it exists, that it says in plain words what it watches, and that it barks when what it watches is taken away. Confirm that it distinguishes what it can inspect from Anthropic and CloudFront concerns that require an external audit. Probe the honest side too: what does it print when it cannot look at all? Do not treat the deferred dead-man's switch or $18 budget deny action as an observation this slice must satisfy.

## Expected observations (oracle)
- El gate corre desde el checkout limpio y termina verde nombrando, en palabras, qué protegió: que ninguna regla de ciclo de vida expira o toca el log de predicciones, y que siguen puestos los once valores declarados de retención, ciclo de vida, concurrencia reservada y tiempos de espera. Una lista concreta de chequeos, no un OK pelado.
- El resultado distingue con honestidad los controles que sí pudo revisar de los temas de Anthropic y CloudFront que requieren auditoría externa. Nunca presenta ese verde local como prueba de que esos dos gastos están cubiertos.
- Con la definición de infra escondida (renombrada con `.aside`), el gate falla fuerte y su mensaje nombra qué no encontró y por qué importa. Al restaurarla, vuelve a verde.
- Negative: un verde mudo se reporta FALLA: si el resultado no nombra qué revisó, no se distingue de un gate que nunca miró.
- Negative: si el gate no pudo mirar (no encontró la infra, o no pudo evaluarla), no puede decir "todo bien": tiene que declarar que no pudo mirar y qué le faltó. "Miré y está limpio" y "no miré" jamás pueden imprimir lo mismo.
- Negative: después del bite test el árbol queda exactamente como estaba: todo restaurado, el gate en verde, nada renombrado. Un examen que deja el repo tocado es un examen mal cerrado.

If, following the recipe, no command presents itself as the guardrail suite, or the gate's output never names what it checks so the bite test cannot be aimed, the verdict is INDETERMINATE with that observation written down. Never a PASS by absence.

Deferred, not this slice: the dead-man's switch observable and the $18 budget deny action belong to F-BILL-STAYS-ZERO-AND-STAYS-UP. Their absence is not a Slice-02 failure; removing a declared lifecycle or cost value is.

## Session log (append-only)
| date | examiner | verdict | observations |
| 2026-08-09 | /root/slice02_vera_bite_examine | FAIL | `npm run ci:local -- --job=infra` was green before and after restoration, naming 3 lifecycle rules, 11 values, and external-audit limits. With `infra` renamed to `infra.aside`, it exited 1 with `ERR_MODULE_NOT_FOUND` for `infra/guardrail-evaluator.mjs`; it did not say why that missing definition matters. Restored exactly; `git status --short` showed no `infra` rename. |
| 2026-08-09 | /root/slice02_vera_final | PASS | `npm run ci:local -- --job=infra` passed before and after the bite, naming 3 lifecycle rules, 11 Lambda guardrail values, prediction no-overlap protection, and Anthropic/CloudFront as external-audit concerns. With `infra` renamed to `infra.aside`, it exited 1: `cannot inspect ... infrastructure definition is missing; retention and local cost guardrail checks cannot run; restore the infra/ definition from version control`. Restoration exited 0; `git status --short` showed `infra/`, not `infra.aside`. |
|------|----------|---------|--------------|
