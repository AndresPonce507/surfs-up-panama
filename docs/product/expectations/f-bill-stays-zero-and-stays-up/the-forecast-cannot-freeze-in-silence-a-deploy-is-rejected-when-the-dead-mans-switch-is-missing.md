# El pronóstico no puede congelarse en silencio: un deploy sin el interruptor de hombre muerto completo revienta el CI diciendo cuál de sus cuatro piezas se rompió
ID: EXP-f-bill-stays-zero-and-stays-up-2 · Spec rows: slice-02 · Persona: Dueño del sitio que no quiere enterarse días tarde

## Intent
The forecast cannot freeze in silence: a deploy is rejected when the dead-man's switch is missing, when its missing-data handling is anything other than BREACHING, when it evaluates fewer than 2 consecutive 1 h periods, or when it lacks either its ALARM or its OK action, and the rejection names which of those broke. `08-devops.md` §7 calls `TreatMissingData: BREACHING` the load-bearing word: with no matching log line the metric reports no datapoint at all, not zero, so default handling holds the alarm green forever precisely when everything is dead. The OK action is equally load-bearing: without it the human never learns the ingest recovered (§7 runbook step 4). The alarm watches the `IngestSuccess` metric, never the Lambda (`system-architecture.md` §10 alarm 1). This slice is declaration and CI assert only; the live firing proof is slice-04's charter.

Timing honesty, built in: the settled detection floor is roughly 2 to 3 hours after the last successful run (`08-devops.md` §7). No observation in this charter demands within-the-hour. The epic row that promises one hour is flagged for amendment in the feature's open question 1.

## Preconditions
Honesty first: this slice has NO page. Its observable is a message in a terminal, not a screen. You will run a command and read what it prints; that printed text is the surface under exam. This is a Node 22 project; everything runs through npm scripts. No pytest, no cargo.

Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. An observation from any other root gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run ci:local` and read the output end to end, capturing the real exit code. If the output names a more specific command for the guardrail suite alone, you may also run that one, from this same folder.
4. For the bite test below: the gate's green output must itself NAME where the dead-man's switch declaration lives and the four properties it verified. Take that name from the gate's own output, never from reading source. Flip exactly ONE property in the smallest way possible (the missing-data handling to anything other than BREACHING is the highest-value bite, because it is the silent one), re-run step 3 and read the failure, restore exactly, and re-run to green before logging anything. If a second bite is cheap, remove the OK action and repeat.

## Charter
Explore the pre-deploy gate through its command surface to verify that the dead-man's switch declaration guard actually bites, property by property. You are not checking that an alarm fires; you are checking that the four words that make it a dead-man's switch instead of a decorative error counter cannot be silently edited away: presence, BREACHING, 2 consecutive 1 h periods, ALARM plus OK actions. Confirm the rejection names the broken property in plain words, not just "alarm invalid". Probe the honest side: what does it print when it cannot inspect the declaration at all?

## Expected observations (oracle)
- El gate corre desde el checkout limpio y termina verde nombrando, en palabras, las cuatro propiedades que verificó del interruptor: que existe, que la falta de datos se trata como BREACHING, que evalúa 2 períodos consecutivos de 1 hora, y que tiene acción de ALARM y de OK. Una lista concreta, no un OK pelado.
- La salida verde deja claro qué vigila el interruptor: la métrica `IngestSuccess`, no la Lambda, y que la detección honesta es de 2 a 3 horas. Nunca promete "dentro de la hora".
- Con la propiedad de datos faltantes cambiada a cualquier cosa distinta de BREACHING, el gate falla con salida distinta de cero y el mensaje nombra ESA propiedad y por qué importa: sin BREACHING la alarma queda verde para siempre justo cuando todo está muerto. Al restaurar, vuelve a verde.
- Si se prueba el segundo mordisco: sin la acción de OK, el rechazo nombra la acción de OK y dice que sin ella nadie se entera de que el ingest se recuperó.
- Negative: un rechazo genérico se reporta FALLA: si el mensaje no dice cuál de las cuatro propiedades se rompió, el operador del futuro va a adivinar, y adivinar a las 6am es lo que este slice existe para evitar.
- Negative: un verde mudo se reporta FALLA: si el resultado no nombra las propiedades que revisó, no se distingue de un gate que nunca miró.
- Negative: si el gate no pudo mirar, tiene que declararlo y decir qué le faltó. "Miré y está limpio" y "no miré" jamás pueden imprimir lo mismo.
- Negative: después de cada mordisco el árbol queda exactamente como estaba: todo restaurado, el gate en verde, `git status --short` limpio.

If, following the recipe, no command presents itself as the guardrail suite, or the gate's output never names the switch declaration and its four properties so a bite can be aimed, the verdict is INDETERMINATE with that observation written down. Never a PASS by absence.

Deferred, not this slice: the alarm actually firing and the ALARM and OK emails arriving belong to slice-04, post-deploy. Their absence is not a slice-02 failure; a silently editable BREACHING enum is.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
