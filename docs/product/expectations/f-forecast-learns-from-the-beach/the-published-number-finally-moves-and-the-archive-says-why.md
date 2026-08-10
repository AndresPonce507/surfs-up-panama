# El número publicado por fin se mueve hacia lo que la gente vio, y el archivo dice por qué
ID: EXP-f-forecast-learns-from-the-beach-7 · Spec rows: slice-07 · Persona: Surfista que lleva semanas reportando, y el dueño del sitio auditando el archivo

## Intent
Once at least ten real pairs from at least five distinct trust-eligible reporters clear
significance at a spot, its published number moves toward what those people saw, the archived
call records exactly which correction was live, and every thinner-evidence spot publishes
exactly what it would have published with no learning layer at all. This slice adds ZERO new
pixels: the moved number renders on existing keystone-owned surfaces, so U1-U7 hold by
inheritance and are not re-examined here. The one visual question left is U8, and it is
public-surface only.

## Preconditions
Honesty first: this charter CANNOT be examined until real report volume exists
(feature-delta Pre-requisites 2 and 3: the observation export producer, and >= 10 real pairs
from >= 5 distinct trust-eligible reporters at >= 1 spot) and the learning stack is deployed
(Pre-requisite 4). Until then any session here is INDETERMINATE by construction and must say
so. Nothing synthetic may stand in: an examiner who is offered fixture data must refuse it
and write that down.

1. `cd` to the tree under test and confirm the resolved root before believing any output.
2. Identify the spot the operator says cleared the gates, and the build date it first applied.
3. Have at hand: the spot's page today, the prior build's archived call for the same spot
   (`log/calls/v1/dt=<date>/build=<HH>Z/...`), and one below-gate spot's archived call.

## Charter
Walk the public surface and the archive as a reader, not a builder. The question is the
epic's own: did the number move only because enough different people earned it, and does the
archive say so plainly? Probe the honest side hardest: a below-gate spot must read exactly
like the day the learning layer did not exist.

## Expected observations (oracle)
- El número publicado del spot difiere del valor archivado del build anterior, y en la
  dirección que los reportes de la gente apuntaban — no en cualquier dirección.
- La llamada archivada de ese build lleva `bias_applied` igual a la corrección que estaba
  viva, con `bias_gate` en `applied`. El archivo dice qué corrección se aplicó, no solo que
  algo cambió.
- La llamada archivada de un spot que sigue debajo de la puerta lleva `bias_applied: 0`, y su
  número publicado es exactamente el que publicaría sin capa de aprendizaje.
- La pantalla se ve terminada: nada nuevo desalineado, cortado ni de relleno, porque este
  slice no agregó ni un pixel; si algo se ve distinto fuera del número, eso es un hallazgo.
- Negative: ninguna copia, en ninguna superficie, dice "aprendió", "más preciso" ni reclama
  exactitud. El día uno solo puede reclamar orden, explicación y honestidad sobre la
  incertidumbre.
- Negative: los valores de semilla humanos en git no cambiaron: ningún job escribe semillas.

If the gates have not been cleared by real reporters, or the deploy wall still stands, the
verdict is INDETERMINATE with that stated. Never a PASS by absence, never a PASS on fixtures.

## Session log (append-only)
|------|----------|---------|--------------|
