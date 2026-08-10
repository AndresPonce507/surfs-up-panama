# En cualquier playa que abro, debajo del pronóstico leo un aviso tranquilo: todavía no saben si aciertan aquí, van 0 reportes de los 30 que hacen falta, y no hay un solo porcentaje inventado en toda la página

ID: EXP-f-show-our-track-record-1 · Spec rows: slice-01 · Persona: Surfista decidiendo si puede confiar en este sitio para SU playa, antes de manejar

## Intent
A surfer wants to know, right on their own beach's page, whether this site's calls have actually
held up there lately, not just whether today's number looks good. The honest answer, this early,
is "we cannot tell you yet" plus a plain count of how far along the site is toward being able to
say. This charter checks that the site keeps that promise on every spot page, in light and dark,
with motion reduced, and that nobody can find a hit rate, a margin, or a "how many meters off"
figure anywhere before it has actually been earned.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser, nothing else. Every
command runs from the tree under test: `cd /Users/andres/psb-record` first, and give anything else
an absolute path.

1. `cd /Users/andres/psb-record`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build
   again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home page, then tap into several different spot pages, one at a time, in a
   phone-width window (about 390 px wide). Try at least three different beaches, not just one.
6. Repeat the same pages once with the phone in light theme, once in dark theme, and once more
   with reduced motion turned on in the operating system.

## Charter
Explore the box that sits right under tomorrow's forecast, above the button for filing a report,
on every spot page you can reach. Read it the way a surfer deciding whether to trust the site
would: what does it actually say about how well this site has called THIS beach?

The sharpest probe is the honesty one, and it is the whole point of this charter. Search the
entire page, not only the box, for anything that looks like a hit rate, a percentage, a
plus-or-minus margin, or a number of meters the site says it was off by. There should be none,
anywhere, at this stage. Finding only a plain count is not a hole to report, it is the feature
working: the site is refusing to claim an accuracy figure for this beach until it has gathered
enough paired observations, from enough distinct reporters, with a difference big enough to be
real. Right now nobody has filed a single report anywhere, so every beach should show the same
honest "not yet" with a count of zero. Do not mark that as a bug, a missing feature, or a broken
page. It is the correct thing to see on every spot page you open today.

Tour several beaches back to back and compare what the box says on each: it should read the exact
same honest sentence, with the same shape of numbers, everywhere, never varying, never going
blank, and never starting to invent something on one page while staying honest on another. Then
read the box for tone: does it look like a calm "we don't know yet" note, something that belongs
on a finished page, or does it look like an error, a stuck loading state, or empty space where
something should be?

Finally, hold onto this test even though you should not need it today: a trustworthy claim states
a number quietly, ties it to how many people and how many observations it is based on, and does
not oversell. Marketing language sounds confident with no humility and never mentions the evidence
behind it. If the box, or anywhere else on the page, ever shows you more than the plain count
while you are touring these pages, treat that as a failure on its own, whether or not the number
looks reasonable. Nothing has earned a claim yet, so the count-only box is the only honest thing
this site can show right now.

## Expected observations (oracle)
- U8 (lectura normal, 390 px): "Abro la página de mi playa a 390 px y, justo debajo del pronóstico de mañana y antes del botón para reportar, leo un recuadro tranquilo que dice que todavía no pueden decirme si aciertan aquí y que van 0 reportes de los 30 que hacen falta. No hay ningún porcentaje, ningún margen y ninguna cifra de acierto en ninguna parte de la página."
- U8 (temas y movimiento reducido): "Con el teléfono en tema claro y en tema oscuro, el recuadro
  se lee cómodo a 390 px: nada se sale de la pantalla, ningún texto queda cortado, los números se
  alinean parejos y el recuadro se ve como un todavía no, no como un error. Con el movimiento
  reducido activado, nada dentro del recuadro se mueve."
- U8 (recorrido por varias playas): "Recorro el sitio en el teléfono: en cualquier playa que abra,
  el recuadro dice siempre lo mismo, que todavía no pueden decirme si aciertan ahí y que van 0
  reportes de los 30 que hacen falta, y en ninguna parte aparece un porcentaje ni una cifra de
  acierto."
- El recuadro se lee cómodo con el brazo estirado: el número del contador y la palabra "reportes"
  se distinguen de un vistazo, sin acercar la pantalla.
- El recuadro se ve terminado, como parte normal de la página: nada de relleno, nada desalineado,
  nada que parezca un error o una carga que se quedó pegada.
- El resto de la página sigue intacta alrededor del recuadro: el puntaje de hoy, el tamaño, la
  mejor ventana y el botón de reportar siguen ahí, sin que el recuadro empuje ni tape nada.
- Negative: en ninguna playa, en ningún tema, con o sin movimiento reducido, aparece un
  porcentaje, un signo de más-menos, una cifra de metros de error o cualquier palabra que suene a
  puntería comprobada ("acertamos", "de exactitud", cifras con "%"). Si aparece cualquiera de
  esas cosas, es FALLA aunque el número parezca razonable, porque nada lo respalda todavía.
- Negative: el recuadro nunca cambia de historia entre playas. Si una playa muestra el aviso
  honesto y otra muestra otra cosa (vacío, un error, un número distinto de cero, o cualquier
  cifra de acierto), es FALLA.
- Negative: el recuadro nunca usa un color o un estilo de error para el aviso de "todavía no". Si
  se ve como una advertencia o una falla del sitio en vez de una nota tranquila, es FALLA.
- Negative: con movimiento reducido activado, nada dentro del recuadro se anima, parpadea o se
  desplaza solo.
- Negative: ningún texto ni número del recuadro queda cortado, superpuesto o se sale de la
  pantalla a 390 px, en ningún tema.
- Negative: si en algún momento de este recorrido llega a aparecer una cifra de acierto real (algo
  más que el conteo llano), y suena a promesa de venta, segura de sí misma y sin mencionar cuántas
  observaciones la respaldan, en vez de una afirmación medida que dice quieta su número y su
  respaldo, márquese como sospechosa incluso si técnicamente es correcta.

Deferred, not this slice: the counter actually moving because real reports exist (slice-03), the
gated claim headline replacing the counter once a beach earns it, and its Spanish wording
(slice-04), and the monthly self-grading report (slice-05). None of those can exist honestly yet
because no surf report has ever been filed anywhere on this site; this charter's job is only to
confirm the honest zero-state, not to anticipate what a future claim will look like.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
