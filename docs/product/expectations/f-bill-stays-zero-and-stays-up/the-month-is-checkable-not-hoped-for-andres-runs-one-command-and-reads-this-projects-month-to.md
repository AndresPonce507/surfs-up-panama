# El mes se puede verificar, no solo esperar: Andres corre un comando y lee el gasto del mes de ESTE proyecto, cada línea de capa gratuita que consume con su tipo, y el comando falla con nombre el primer mes que algo pase de $0.00
ID: EXP-f-bill-stays-zero-and-stays-up-5 · Spec rows: slice-05 · Persona: Andres, el operador cuya restricción es $0.00 al mes, permanente

## Intent
The month is checkable, not hoped for: Andres runs one command and reads this project's month-to-date AWS spend, every free-tier line it is consuming with that line's type, and the command exits non-zero and names the service the first month anything on this project is above $0.00. `BRIEF.md` constraint 1 sets the target at $0.00 per month permanently; `system-architecture.md` §12's ~$0.32 subtotal is a design estimate, not a bill, and nothing today converts the estimate into an observed month close. The account is shared with the other project's Amplify and RDS (`system-architecture.md` §19 flag 6), so an account-wide number is not a $0.00 signal for this project; the per-project half only exists once the cost-allocation tag key is activated and tagged data reaches Cost Explorer (feature pre-requisite 8).

## Preconditions
Honesty first: this slice has NO page. Its observable is one command's printed report and its exit code, read in a terminal. The spend it reads is live account data, so this exam runs against the real account with read-only credentials; verified 2026-08-09 that `aws ce get-cost-and-usage` and `aws freetier get-free-tier-usage` both work for `andres-cli` (HANDOFF §10 and the ops plan's account reads).

1. `cd /Users/andres/panama-surf`, all commands from this root.
2. The first `cdk deploy` has happened and this project's resources exist, tagged by slice-03; otherwise the free-tier half has nothing to report (the API only returns services with current-month usage) and the verdict is INDETERMINATE.
3. The project cost-allocation tag key is activated in the Billing console and tagged data has appeared in Cost Explorer (activation has a delay). If not yet active, the command must say so itself; see the oracle.
4. Run the one command the slice ships. Its name must be discoverable from `package.json` scripts or the gate's own output, not from reading source. Capture the real exit code.

## Charter
Run the month-close command like the owner reading a bill. Does it answer the three questions that matter without a console visit: what has THIS project spent this month, which free-tier lines is it consuming and of what type (always-free versus 12-month, the difference that decides whether month 13 costs $14 or $0), and is anything above $0.00? Then read what it refuses to claim: the Anthropic $5 limit has no API, so the command must report it as an external audit obligation, the same honesty `infra/lib/audit-obligations.ts` already practices. Probe the shared-account trap deliberately: confirm the command never sells the account-wide number as the project's.

## Expected observations (oracle)
- El comando imprime el gasto del mes en curso de ESTE proyecto, leído de la cuenta, con su moneda y el período que cubre. Con el proyecto en $0.00, termina con salida cero y lo dice en palabras.
- Imprime cada línea de capa gratuita que el proyecto consume este mes, y cada línea trae su tipo, siempre gratis o de 12 meses. La línea de DynamoDB con su tipo es la que cierra sola, en el mes 13, la pregunta abierta de HANDOFF §6 punto 8.
- Nombra la obligación de auditoría externa de Anthropic: que el límite de $5 se verifica en esa consola a mano, y que este comando no lo revisó ni puede revisarlo. Nunca lo presenta como verificado.
- El primer mes que algo de este proyecto pase de $0.00, el comando termina con salida distinta de cero y nombra el servicio. Si ese estado no es observable hoy, esta línea se verifica leyendo que el comando declara esa regla en su propia salida o ayuda; inventarle gasto a la cuenta para provocarla no es parte de este examen.
- Negative: si la etiqueta de costos del proyecto no está activa todavía, el comando lo dice y presenta el número de cuenta completa COMO número de cuenta completa, compartido con el otro proyecto. Presentar ese número como el gasto del proyecto es FALLA: el otro proyecto tiene Amplify y RDS en la misma cuenta.
- Negative: un $0.00 mudo se reporta FALLA: sin las líneas de capa gratuita y sus tipos, "no gastamos nada" no se distingue de "no miramos nada".
- Negative: un comando que necesite credenciales de escritura para leer la factura es FALLA de diseño: leer cuánto se gastó jamás requiere poder gastar.
- Negative: salida cero con gasto del proyecto arriba de $0.00 visible en el propio reporte es la peor falla posible de este slice y se reporta como tal.

If no command presents itself as the month-close reader, or the deploy has not happened so there is no current-month usage to report, the verdict is INDETERMINATE with that observation written down. Never a PASS by absence.

Deferred, not this slice: activating the tag key (Billing console, human, pre-requisite 8), the Lambda quota and account-plan reads that gate the first deploy (pre-requisites 6 and 7), and any claim about month 13: the command reports the DynamoDB line's type when DynamoDB has usage, and the perpetuity question resolves itself from that field, not from this exam.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
