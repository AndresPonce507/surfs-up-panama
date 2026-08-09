# Una avalancha de escrituras no puede ganarle a la factura ni llevarse el archivo por delante: el deploy sin el freno de $18 bien apuntado revienta el CI diciendo cuál línea se rompió
ID: EXP-f-bill-stays-zero-and-stays-up-3 · Spec rows: slice-03 · Persona: Dueño del sitio que paga la factura y cuida el archivo

## Intent
A runaway write flood cannot outrun the bill and cannot take the archive down with it: a deploy is rejected when the $18 action-enabled budget is absent, when its threshold drifts, when its deny scope reaches past the four write Function URLs, or when it names the ingest role, and the rejection says which. The $1, $5, $15 and $20 lines are declared in the same place. This is the piece the keystone's slice-02 explicitly deferred to this feature. `system-architecture.md` §6.1 states the enforcement that must actually work is guardrail 8's $18 budget action. The heaviest guard is the ingest-role one: `system-architecture.md` §9 guardrail 8 records that an earlier design denied the ingest role too, which would let a billing flood stop the prediction log, destroying the irreplaceable artifact (HANDOFF §3) to save dollars.

Corrected premise, verified 2026-08-09 against the live account (HANDOFF §10): there is NO $20 CloudWatch billing alarm to import. `system-architecture.md` §9 guardrail 9 claims one "already exists on the account"; the account has zero CloudWatch alarms, and the only budget is `agentflow-guardrail`, $20, which belongs to the other project sharing this account (`system-architecture.md` §19 flag 6). The $20 line must therefore be CREATED by this project's declarations, and the resources must carry the project cost-allocation tag so a project-scoped signal is even possible. A gate output claiming the $20 line was imported from the account is claiming something false.

## Preconditions
Honesty first: this slice has NO page. Its observable is a message in a terminal, not a screen. You will run a command and read what it prints; that printed text is the surface under exam. This is a Node 22 project; everything runs through npm scripts. No pytest, no cargo.

Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. An observation from any other root gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run ci:local` and read the output end to end, capturing the real exit code. If the output names a more specific command for the guardrail suite alone, you may also run that one, from this same folder.
4. For the bite tests below: the gate's green output must itself NAME where the money lines are declared. Take that name from the gate's own output, never from reading source. Aim up to three bites, one at a time, restoring exactly and re-running to green between each: drift the $18 threshold to another number; widen the deny scope past the four write Function URLs; add the ingest role to the deny scope. The third is the one that matters most.

## Charter
Explore the pre-deploy gate through its command surface to verify that the money-line protection actually bites, line by line. You are checking two different promises at once: that the bill has a working brake (the $18 action-enabled budget with the $1, $5, $15 warnings and the $20 last line around it), and that the brake can never be aimed at the archive (the deny scope stops at the four write Function URLs and never names the ingest role). Confirm the gate says plainly that the four deny targets do not exist yet, so this is a declaration guard, not live protection. Probe the honest side: what does it print when it cannot inspect the declarations at all?

## Expected observations (oracle)
- El gate corre desde el checkout limpio y termina verde nombrando, en palabras, las cinco líneas de dinero que verificó: avisos en $1, $5 y $15, el freno con acción en $18, y la línea final de $20. Una lista concreta, no un OK pelado.
- La salida verde dice que la línea de $20 la CREA este proyecto. Nunca dice que fue importada de la cuenta: en la cuenta no hay ninguna alarma y el único presupuesto de $20 es del otro proyecto.
- La salida verde nombra el alcance exacto del freno de $18: las cuatro Function URLs de escritura, nada más, y deja constancia de que el rol de ingest queda fuera a propósito, porque una avalancha jamás puede parar el log de predicciones.
- La salida verde nombra la etiqueta de asignación de costos del proyecto sobre los recursos declarados, el paso que hace posible un $0.00 por proyecto en una cuenta compartida.
- Con el umbral de $18 movido a otro número, el gate falla con salida distinta de cero nombrando el umbral que esperaba y el que encontró. Restaurado, vuelve a verde.
- Con el alcance del freno ampliado más allá de las cuatro URLs de escritura, el gate falla nombrando el recurso de más. Restaurado, vuelve a verde.
- Con el rol de ingest agregado al alcance del freno, el gate falla y su mensaje nombra el archivo como el motivo: parar el ingest para ahorrar dólares destruye el artefacto irreemplazable. Este es el rechazo más importante del slice. Restaurado, vuelve a verde.
- Negative: un rechazo genérico se reporta FALLA: si el mensaje no dice cuál línea o cuál alcance se rompió, no sirve a las 6am.
- Negative: un verde mudo se reporta FALLA: si el resultado no nombra las líneas que revisó, no se distingue de un gate que nunca miró.
- Negative: si el gate presenta este verde local como protección viva de un camino de escritura, es FALLA: las cuatro URLs pertenecen a F-TELL-US-WHAT-YOU-SAW-COLD y todavía no existen. El observable de este slice es el rechazo del CI, no una denegación real.
- Negative: si el gate no pudo mirar, tiene que declararlo y decir qué le faltó. "Miré y está limpio" y "no miré" jamás pueden imprimir lo mismo.
- Negative: después de cada mordisco el árbol queda exactamente como estaba: todo restaurado, el gate en verde, `git status --short` limpio.

If, following the recipe, no command presents itself as the guardrail suite, or the gate's output never names the money-line declarations so a bite can be aimed, the verdict is INDETERMINATE with that observation written down. Never a PASS by absence.

Deferred, not this slice: a live denial of the four write URLs (they do not exist until F-TELL-US-WHAT-YOU-SAW-COLD ships), the live behavior of any budget after the first deploy, the Billing-console activation of the cost-allocation tag key (pre-requisite 8, human, with its own delay), and the Anthropic $5 limit, which stays an external audit obligation the gate names but never claims to have checked (`system-architecture.md` §9 guardrail 10).

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
