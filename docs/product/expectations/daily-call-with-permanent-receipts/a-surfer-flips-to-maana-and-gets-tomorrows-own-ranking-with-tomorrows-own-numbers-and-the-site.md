# Mañana tiene su propia lista con sus propios números, y más allá de mañana el sitio no finge saber
ID: EXP-daily-call-with-permanent-receipts-5 · Spec rows: slice-05 · Persona: Surfista planeando si vale la pena el viaje de mañana

## Intent
A surfer flips to Mañana and gets tomorrow's own ranking with tomorrow's own numbers, and the site says plainly that past tomorrow it will not pretend to know.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home, then flip to Mañana from the tab. The direct address `/manana` on that same URL must land on the same page.

## Charter
Explore the flip between Hoy and Mañana as the surfer deciding whether tomorrow is worth the drive. Compare the two lists spot by spot for a handful of spots: are tomorrow's numbers tomorrow's own? Then go hunting for a third day: look for any tab, link, footer, or address that promises further than tomorrow. Finding none is the point.

## Expected observations (oracle)
- La pestaña Mañana lleva a su propia página: su propia lista ordenada, con los puntajes y tamaños de mañana, no un refrito visual de hoy.
- Comparando algunos spots entre Hoy y Mañana, los números son propios de cada día: lo normal es que al menos algunos difieran.
- El sitio dice en palabras, a la vista, que más allá de mañana no finge: la frase del pie del estilo "Solo hoy y mañana. Más allá nadie sabe de verdad, y no vamos a inventar." está presente.
- Se nota de un vistazo en qué día estás parado: la pestaña activa se distingue sin adivinar, y en ancho de teléfono nada se corta ni se encima.
- Negative: mañana no puede ser una fotocopia total de hoy: si las veinte filas repiten exactamente los mismos puntajes de hoy, algo está copiando un día en el otro, y es FALLA.
- Negative: no puede existir ningún camino a un tercer día: ni pestaña, ni link, ni ruta de pasado mañana, ni pronóstico a siete días por ningún rincón. Si aparece uno, es FALLA.
- Negative: nada de errores crudos ni filas sin puntaje en la página de mañana.

Deferred, not this slice: per-row confidence (slice-07) and the spot's own page with both days (slice-06). Their absence is not a failure here.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
