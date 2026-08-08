# Un cambio de infra que tocaría los recibos de ayer o soltaría el freno del gasto revienta el CI con nombre y motivo
ID: EXP-daily-call-with-permanent-receipts-2 · Spec rows: slice-02 · Persona: Dueño del sitio cuidando el archivo y la factura

## Intent
Nobody can quietly destroy yesterday's receipts or unbound the bill: an infra change that would expire or touch the prediction log, or drop a cost guardrail value, fails CI loudly, naming what broke and why.

## Preconditions
Honesty first: this slice has NO page. Its observable is a message in a terminal, not a screen. You will run a command and read what it prints; that printed text is the surface under exam. This is a Node 22 project; everything runs through npm scripts. No pytest, no cargo.

Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run ci:local` and read the output end to end. The guardrail assertion suite runs inside this gate. If the output names a more specific command for the guardrail suite alone, you may also run that one, from this same folder.
4. For the bite test below: the gate's green output must itself NAME the file or folder holding the infra definition it checked. Take that name from the gate's own output, never from reading source. Hide it by renaming it with an `.aside` suffix, re-run step 3 and read the failure, then rename it back exactly as it was and re-run step 3 once more to green, before logging anything.

## Charter
Explore the guardrail gate through its command surface to verify that the protection over the prediction log and the cost guardrails actually bites. You are checking a guard dog: that it exists, that it says in plain words what it watches, and that it barks when what it watches is taken away. Probe the honest side too: what does it print when it cannot look at all?

## Expected observations (oracle)
- El gate corre desde el checkout limpio y termina verde nombrando, en palabras, qué protegió: que nada expira ni toca el log de predicciones, y que los valores de guardia de costos siguen puestos. Una lista concreta de chequeos, no un OK pelado.
- Con la definición de infra escondida (renombrada con `.aside`), el gate falla fuerte y su mensaje nombra qué no encontró y por qué importa. Al restaurarla, vuelve a verde.
- Negative: un verde mudo se reporta FALLA: si el resultado no nombra qué revisó, no se distingue de un gate que nunca miró.
- Negative: si el gate no pudo mirar (no encontró la infra, o no pudo evaluarla), no puede decir "todo bien": tiene que declarar que no pudo mirar y qué le faltó. "Miré y está limpio" y "no miré" jamás pueden imprimir lo mismo.
- Negative: después del bite test el árbol queda exactamente como estaba: todo restaurado, el gate en verde, nada renombrado. Un examen que deja el repo tocado es un examen mal cerrado.

If, following the recipe, no command presents itself as the guardrail suite, or the gate's output never names what it checks so the bite test cannot be aimed, the verdict is INDETERMINATE with that observation written down. Never a PASS by absence.

Deferred, not this slice: the dead-man's switch observable and the budget deny action belong to F-BILL-STAYS-ZERO-AND-STAYS-UP.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
