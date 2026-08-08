# Un surfista ve hoy el puntaje real de un spot, y a la mañana siguiente lee intacto lo que dijimos ayer
ID: EXP-daily-call-with-permanent-receipts-1 · Spec rows: slice-01 · Persona: Surfista que decide a las 5:40am desde el teléfono

## Intent
A surfer opens the site and sees one real spot with today's score and its call in Spanish, computed from this morning's actual model data. The next morning, they open that spot's yesterday page in the browser and read exactly what the site said the day before, unchanged.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

This charter spans two mornings on purpose. The second half is the reason the whole feature exists.

Day 1, today:

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (this is the publish step: it takes this morning's real model data, scores it, and renders the static pages into `dist/`; if the build says a data step must run first, run the step it names, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open that URL in the browser. Record in the session log, word for word: the spot's name, its score, the full call text, and the update time the page shows. Also note the spot's address (open the spot and copy the URL).

Day 2, the next morning:

6. Same folder. Run the publish again (`npm run build`, so the site now carries the new morning) and `npm run preview` again.
7. Open the spot's yesterday page: the spot's own address with `/ayer` at the end (planned route: the spot page address plus `/ayer`). If the spot page shows a link to yesterday, following that link is equally valid.
8. Compare against what you recorded on day 1: number by number, word by word.

If the session cannot span a real night: do the day 1 half, then ask the flow that dispatched you to trigger the next day's publish build, and only then do the day 2 half. Never fake the second morning by re-reading the same build.

## Charter
Explore the built site in the browser as the surfer who decides at dawn: today's page for the one real spot, and the next morning that spot's yesterday page. The heart of the walk is the promise about time: what the site says today must be readable tomorrow, identical. Poke the edges too: reload a few times and watch the number hold still, open the yesterday page on day 1 before a yesterday exists, and mistype a spot address to see what the site does with it.

## Expected observations (oracle)
- Hoy: la página muestra un spot real con nombre propio, un puntaje entero entre 0 y 100, y su llamado en español de a pie: tamaño en palabras del cuerpo y el viento. Nada en inglés en la página en español.
- La página dice en palabras cuándo se actualizó, y esa hora es de hoy, de la corrida que acabás de hacer, no una fecha de ejemplo.
- Día 2: la página de ayer muestra exactamente lo que anotaste el día 1: mismo puntaje, mismo texto del llamado, misma fecha. Idéntico, ni un número movido, ni una palabra cambiada.
- Día 1, antes de que exista un ayer: la página de ayer se explica en palabras (todavía no hay día anterior que mostrar), no un error ni una página en blanco.
- La pantalla se ve terminada: el puntaje se lee con el brazo estirado, nada cortado, desalineado ni con pinta de relleno, y nada en la pantalla se mueve sin que lo pidas.
- Negative: la página de ayer no puede mostrar los números de hoy ni recalcular nada: si lo que dice de ayer cambió entre el día 1 y el día 2, es FALLA, aunque el número nuevo parezca mejor.
- Negative: nada de errores crudos en ninguna de las dos páginas: ni stack trace, ni "undefined", ni "NaN", ni JSON pelado.
- Negative: si el build no consiguió los datos del modelo de esta mañana, la página no puede inventar un puntaje como si nada: tiene que decir que no pudo, nunca fingir que miró.

Deferred, not this slice: the twenty-spot ranked list (slice-03), the oversized call card (slice-04), the Mañana tab (slice-05), per-row confidence (slice-07). Their absence here is not a failure.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
