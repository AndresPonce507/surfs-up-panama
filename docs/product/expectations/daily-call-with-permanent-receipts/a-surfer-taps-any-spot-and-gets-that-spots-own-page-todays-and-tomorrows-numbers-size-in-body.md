# Cada spot tiene su propia página: números de hoy y de mañana, tamaño en palabras del cuerpo con metros al lado, y la mejor ventana
ID: EXP-daily-call-with-permanent-receipts-6 · Spec rows: slice-06 · Persona: Surfista eligiendo SU playa, no la mejor del país

## Intent
A surfer taps any spot and gets that spot's own page: today's and tomorrow's numbers, size in body-height words with metre ranges beside them, and the best window to go.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home and tap into spots from the list. Each spot lives at `/spots/` plus its own name in the address.

## Charter
Explore several spot pages, not one: the best spot, the worst of the list, and a couple from the middle. A surfer does not go to the best beach in the country, they go to theirs, so the page has to hold up for a mediocre spot too. Check each page carries its own numbers and not a neighbour's, flip between today and tomorrow on the page, walk back to the list and into another spot, and try a misspelled spot address to see what the site does with it.

## Expected observations (oracle)
- Al tocar un spot se abre su propia página con su nombre, y trae los números de hoy Y los de mañana.
- El tamaño viene primero en palabras del cuerpo ("Al pecho", "A la cintura") y al lado el rango en metros con "≈", del estilo "≈1.0–1.4 m". Palabra primero, metros al lado, siempre rango.
- La mejor ventana para ir está dicha con horas, del estilo "Ventana 6:00–9:30".
- Cada spot trae SUS números: el puntaje de la página cuadra con el de su fila en la lista, y dos spots distintos no repiten sospechosamente los mismos datos.
- La página se ve terminada: se lee de un vistazo, se vuelve a la lista sin perderse, y en ancho de teléfono nada se corta ni se encima.
- Negative: los metros nunca pueden aparecer como número exacto y pelado (un "1.2 m" a secas): siempre rango y con "≈". Un número puntual promete una precisión que no existe, y es FALLA.
- Negative: ninguna página de spot puede mostrar un error crudo ni quedar en blanco, ni siquiera el spot más flojo: si algo falta, la página lo dice en palabras.

Deferred, not this slice: the breakdown bars, the weakest-link callout and the static break map (F-SEE-WHAT-KILLED-IT); the accuracy scorecard (F-SHOW-OUR-TRACK-RECORD); per-row confidence (slice-07). Their absence is not a failure here.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
