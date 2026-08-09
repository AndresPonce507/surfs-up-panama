# La home muestra los veinte spots del Pacífico ordenados del mejor al peor, en español, y el orden sigue al mar
ID: EXP-daily-call-with-permanent-receipts-3 · Spec rows: slice-03 · Persona: Surfista recorriendo la costa con el pulgar en medio minuto

## Intent
A surfer sees today's twenty Pacific spots ranked best first on the home page, in Spanish, and the order actually changes when the swell does. The spot list is a seed data file: adding a spot is a data edit, not code.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step: real model data in, static pages out into `dist/`; if it names a data step to run first, run it, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home at that URL, in a phone-width window (about 390 px wide).

## Charter
Explore the home page in the browser as the surfer scanning the whole coast before coffee. Walk the full list, not just the top: compare every score with the one below it, all the way down. Then run the publish again later in the session (`npm run build`, then reload) and look again: if the numbers moved, did the rows move with them? Also try the page wide and narrow, and reload a few times to see the list hold steady.

## Expected observations (oracle)
- La home lista exactamente los veinte spots del Pacífico del lanzamiento, cada fila con su nombre real, su puntaje entero y su línea de tamaño y viento en español.
- El orden es el de los puntajes: el mejor arriba, y bajando la lista nunca aparece un puntaje mayor debajo de uno menor. Hay que recorrerla entera, fila por fila, no confiar en las tres primeras.
- En ancho de teléfono cada fila entra completa: sin scroll horizontal, nada cortado, y los puntajes caen en columna alineada que se lee de un vistazo de arriba a abajo.
- Negative: el orden no puede contradecir los puntajes a la vista: un 61 arriba de un 74 es FALLA.
- Negative: ninguna fila puede venir sin puntaje, ni con "undefined", ni "NaN", ni un texto de error crudo.
- Negative: la página en español no puede traer textos en inglés ni nombres de spots de relleno (test, demo, lorem).
- Negative: las veinte filas no pueden traer todas exactamente el mismo puntaje: eso es relleno, no mar.

Note on the seed claim: that adding a spot is a data edit and not code is proven by the repo's own tests. Do not edit repo files to verify it yourself.

Deferred, not this slice: the oversized call card (slice-04) and per-row confidence (slice-07). Their absence is not a failure here.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-09 | /root/slice03_vera_examination | PASS | Rendered at 390px and 1280px: 20 named rows, integer scores 88→39 strictly descending, Spanish size/wind calls, no horizontal cut-off, raw errors, English, or filler; same pixels after rebuild and two reloads. |
