# Desde el primer reporte de verdad, el contador de cada playa dice cuántos van de los 30, contados del registro real, y una fuente ilegible detiene la publicación en voz alta en vez de fingir un cero

ID: EXP-f-show-our-track-record-3 · Spec rows: slice-03 · Persona: Surfista que ya mandó un reporte y vuelve a ver si el sitio lo contó

## Intent
From the first real report onward, the spot-page counter must tell the truth about how many have
arrived: the hourly updater pairs each new report exactly once against the prediction log, the
site builder reads the real aggregates, and "Van 3 reportes de los 30" renders because three
reports actually exist. From that day the slice-01 zero-from-absence emission is illegal: a zero
must come from reading the store and counting nothing, and an unreadable store must fail the
publish LOUD with the prior page left standing, never degrade to a fabricated zero over real
reports.

## Preconditions
**HARD BLOCKED TODAY, and the block is real: zero surf reports have ever been filed and no write
store is deployed.** This examination CANNOT run until F-TELL-US-WHAT-YOU-SAW-COLD ships its
write path and real surfers have used it. Nothing may be seeded, demo-filled or fabricated to
unblock it — a counter that says three because someone manufactured three would be the exact lie
this product exists to never tell. Until then every verdict is INDETERMINATE by construction.

When the block clears:

1. `cd /Users/andres/psb-record`
2. `npm ci` (first time on this machine only)
3. `npm run build`, then `npm run preview`, note the local URL (normally `http://localhost:4321`)
4. Know, from the operator's records (never from this site's pages), which spots hold real
   reports and roughly how many. You need at least one spot with reports and one without.
5. Open both spots' pages in a phone-width window (about 390 px), light theme and dark theme,
   and once with reduced motion on.

## Charter
Read the counter the way the surfer who filed a report reads it: did they count mine? The box on
a spot with N real reports must say exactly N of 30, in the same calm settled sentence as day
one, and the box on a spot with no reports must still say 0 of 30 — a zero that was counted, not
assumed. Compare the spot-page counter with what the report screen's thank-you message said about
the same spot: the two sentences must tell the same story, never contradict each other about how
many reports that beach has. Then read for tone and honesty exactly as in the day-one charter:
no percentage, no plus-minus, no metres-off figure anywhere on any page, because counting is not
claiming.

## Expected observations (oracle)
- U8: "Abro la página de una playa que ya tiene reportes de verdad y el recuadro dice cuántos van, por ejemplo que van 3 reportes de los 30 que hacen falta, con el mismo tono tranquilo de siempre; en las playas donde todavía no hay nada sigue el cero honesto, y en ninguna parte aparece un porcentaje ni una cifra de acierto."
- U8: "Recorro varias playas en el teléfono: cada recuadro cuenta exactamente los reportes que esa playa lleva, el número nunca se inventa ni se queda pegado, y si mando un reporte y vuelvo más tarde el contador de la playa y el mensaje de gracias del reporte cuentan la misma historia."
- El número del recuadro coincide con la cuenta real de reportes de esa playa que consta en los
  registros del operador, playa por playa.
- El recuadro conserva el mismo tono, la misma posición bajo el pronóstico y la misma frase
  asentada del día uno, con el número de verdad en lugar del cero.
- Negative: un contador que diga un número que los registros no respaldan, más alto o más bajo,
  es FALLA aunque se vea razonable.
- Negative: si el historial de una playa no se puede leer, un cero tranquilo encima de reportes
  reales es la peor falla de este slice; lo correcto es que esa publicación no salga y la página
  anterior siga en pie, visiblemente con su fecha.
- Negative: en ninguna playa, en ningún tema, aparece porcentaje, más-menos ni metros de error.
  Contar no es afirmar, y nada ha pasado la reja todavía.
- Negative: nada dentro del recuadro se anima con el movimiento reducido activado, ningún texto
  se corta a 390 px, y el recuadro nunca usa color ni estilo de error para un estado honesto.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
