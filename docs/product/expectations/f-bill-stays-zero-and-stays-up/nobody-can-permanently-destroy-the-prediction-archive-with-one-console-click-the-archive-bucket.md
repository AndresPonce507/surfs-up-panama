# Nadie puede destruir el archivo de predicciones con un clic: el bucket sale con versionado y el deploy que lo quita revienta el CI con nombre y motivo
ID: EXP-f-bill-stays-zero-and-stays-up-1 · Spec rows: slice-01 · Persona: Dueño del sitio cuidando el archivo irreemplazable

## Intent
Nobody can permanently destroy the prediction archive with one console click: the archive bucket ships with versioning on, and a deploy that drops it is rejected by CI naming the bucket, the missing versioning, and that the prediction log has no other recovery path. HANDOFF §3 calls the log the single most important thing in the system; `08-devops.md` §6 says it has no rollback by design and names the one unguarded actor as a human with console access; `08-devops.md` §11 decision 1 chose bucket versioning as the fix. The exposure starts the minute the first `cdk deploy` runs and the first hourly ingest writes, which is why this lands before that deploy exists.

## Preconditions
Honesty first: this slice has NO page. Its observable is a message in a terminal, not a screen. You will run a command and read what it prints; that printed text is the surface under exam. This is a Node 22 project; everything runs through npm scripts. No pytest, no cargo.

Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. An observation from any other root gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run ci:local` and read the output end to end, capturing the real exit code, never piped into `tail`. The guardrail assertion suite runs inside this gate. If the output names a more specific command for the guardrail suite alone, you may also run that one, from this same folder.
4. For the bite test below: the gate's green output must itself NAME the file or folder holding the versioning declaration it checked. Take that name from the gate's own output, never from reading source. Remove or neutralize that one declaration in the smallest way the gate's own message suggests (for example renaming the named file with an `.aside` suffix), re-run step 3 and read the failure, then restore it exactly as it was and re-run step 3 once more to green, before logging anything.

## Charter
Explore the pre-deploy gate through its command surface to verify that the versioning protection over the archive bucket actually bites. You are checking a guard dog: that it exists, that it says in plain words what it watches and why, and that it barks when what it watches is taken away. Probe the honest side too: what does it print when it cannot look at all? A green that cannot name the bucket and the versioning it verified is indistinguishable from a gate that never looked.

## Expected observations (oracle)
- El gate corre desde el checkout limpio y termina verde nombrando, en palabras, qué protegió: que el bucket del archivo sale con versionado activado, y por qué importa: el log de predicciones no tiene otro camino de recuperación. Una lista concreta, no un OK pelado.
- Con la declaración de versionado quitada o escondida, el gate falla con código de salida distinto de cero y su mensaje nombra el bucket, el versionado que falta, y que el log de predicciones no tiene otro camino de recuperación. Al restaurarla, vuelve a verde.
- El chequeo recorre todos los buckets sintetizados, no una lista fija: la salida verde deja claro que el día que exista el bucket real, queda cubierto sin editar el test.
- Negative: un verde mudo se reporta FALLA: si el resultado no nombra el bucket ni el versionado que revisó, no se distingue de un gate que nunca miró.
- Negative: si el gate no pudo mirar (no encontró la definición de infra, o no pudo evaluarla), no puede decir "todo bien": tiene que declarar que no pudo mirar y qué le faltó. "Miré y está limpio" y "no miré" jamás pueden imprimir lo mismo.
- Negative: una advertencia no es un rechazo. Si el versionado falta y el gate termina con salida cero, es FALLA aunque haya impreso un warning.
- Negative: después del bite test el árbol queda exactamente como estaba: todo restaurado, el gate en verde, `git status --short` limpio. Un examen que deja el repo tocado es un examen mal cerrado.

If, following the recipe, no command presents itself as the guardrail suite, or the gate's output never names the versioning declaration so the bite test cannot be aimed, the verdict is INDETERMINATE with that observation written down. Never a PASS by absence.

Deferred, not this slice: the live check `aws s3api get-bucket-versioning --bucket <archive-bucket>` returning `"Status": "Enabled"` is a post-deploy launch verification. Zero CloudFormation stacks exist today (verified 2026-08-09, HANDOFF §10), so there is no bucket to ask; that proof belongs with the first human deploy, and that call is AccessDenied for `andres-cli` until the `s3:GetBucketVersioning` action is added or an admin profile is used.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
