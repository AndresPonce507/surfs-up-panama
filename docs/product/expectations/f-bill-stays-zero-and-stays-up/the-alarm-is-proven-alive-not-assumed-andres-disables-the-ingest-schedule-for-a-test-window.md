# La alarma se prueba viva, no se supone: Andres apaga el horario de ingesta por una ventana de prueba, recibe el correo de ALARM con nombre y motivo, lo reenciende y recibe el correo de OK que cierra el ciclo
ID: EXP-f-bill-stays-zero-and-stays-up-4 · Spec rows: slice-04 · Persona: Andres, el operador que paga la factura y recibe los correos

## Intent
The alarm is proven alive, not assumed: Andres disables the ingest schedule for a test window, receives the ALARM email naming the alarm, the region and the state reason, re-enables the schedule, and receives the OK email that closes it. `system-architecture.md` §11 step 8 and `08-devops.md` §9 item 7 both require exactly this, once, and `08-devops.md` §7 states the doctrine: an alarm never seen firing proves nothing, same doctrine as the guardrail suite's red-then-green requirement. This is the first slice in the feature whose observable is an email in an inbox rather than a rejected build.

Timing honesty, load-bearing for this exam: with hourly runs and 2 consecutive 1 h evaluation periods, the ALARM email arrives roughly 2 to 3 hours after the last successful run (`08-devops.md` §7). An exam that expects the email within one hour and fails on its absence is exam error, not product failure. The epic row promising "within the hour" is flagged for amendment in the feature's open question 1.

## Preconditions
Honesty first: this slice has NO page and NO local command that can prove it. Its observables are two emails in Andres's inbox and the live state of one schedule and one alarm. It cannot run on a laptop: it needs the deployed system.

All human, all verified before starting; if any is missing, the verdict is INDETERMINATE, never a failure:

1. The four real CDK stacks exist and are deployed by a human from a clean checkout of the merged default branch (`08-devops.md` §3, §4). As of 2026-08-09 zero CloudFormation stacks exist (HANDOFF §10) and no slice anywhere owns building the stacks (feature open question 2), so this charter cannot be attempted yet.
2. Slices 01 to 03 of this feature are shipped, so the deployed switch carries the guarded declaration: BREACHING, 2 consecutive 1 h periods, ALARM and OK actions.
3. SSM secrets seeded and the SNS alarm topic email subscription CONFIRMED from the inbox (`system-architecture.md` §11 steps 6 and 7; `08-devops.md` §9 item 6). An unconfirmed subscription delivers nothing and proves nothing.
4. The ingest has run successfully at least once, so there is a live `IngestSuccess` signal to go missing.
5. A test window chosen where serving stale-but-correct for a few hours is acceptable; during the window the site keeps serving the last good build (`08-devops.md` §7).

## Charter
Probe the probe. Disable the EventBridge ingest schedule for a test window and let the silence do the work: the metric filter stops matching, the metric reports no datapoint, BREACHING converts absence into failure, and the ALARM email must arrive. Read that email like an operator woken at 6am: does it name the alarm, the region and the state reason well enough to act on without opening a laptop first? Then re-enable the schedule, force or await the next run, and confirm the OK email closes the loop. Log the real timestamps: last successful run, disable time, ALARM arrival, re-enable time, OK arrival.

## Expected observations (oracle)
- Con el horario apagado, llega UN correo de ALARM al buzón suscrito. El asunto nombra la alarma y la región; el cuerpo trae la razón de estado (datapoints faltantes o suma bajo 1) y las marcas de tiempo. Llega dentro de la ventana honesta de 2 a 3 horas después de la última corrida exitosa, nunca se exige dentro de una hora.
- Durante la ventana, el sitio sigue sirviendo el último pronóstico bueno: rancio pero correcto, nunca caído.
- Al reencender el horario y correr la ingesta de nuevo, llega el correo de OK que cierra el ciclo, y el sello de frescura del sitio avanza (paso 4 del runbook de `08-devops.md` §7).
- El ciclo completo queda anotado con horas reales: última corrida exitosa, apagado, ALARM, reencendido, OK. Sin esas horas el examen no está cerrado.
- Negative: si a las 4 horas del apagado no llegó ningún correo, es FALLA, y la observación anota qué se revisó antes de declararla: que el horario sí quedó apagado, que la suscripción está confirmada, y el estado de la alarma en la consola o por CLI de solo lectura.
- Negative: un correo de ALARM sin razón de estado legible, o que no nombre la alarma y la región, se reporta FALLA: un operador a las 6am no puede actuar con un correo mudo.
- Negative: si llega el ALARM pero nunca el OK después de reencender y correr con éxito, es FALLA: sin el OK nadie se entera de que el ingest se recuperó, y esa mitad es tan obligatoria como la primera.
- Negative: reencender el horario y declarar PASS sin haber visto el correo de OK es un examen mal cerrado.

If the stacks are not deployed, the subscription is not confirmed, or there is no schedule to disable, the verdict is INDETERMINATE with the missing precondition written down. Never a PASS by absence, and never a FAIL charged to a product that has not been given the chance to exist.

Deferred, not this slice: the month-close spend reading belongs to slice-05; the recurring monthly Anthropic console check stays an external audit obligation (`system-architecture.md` §9 guardrail 10).

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
