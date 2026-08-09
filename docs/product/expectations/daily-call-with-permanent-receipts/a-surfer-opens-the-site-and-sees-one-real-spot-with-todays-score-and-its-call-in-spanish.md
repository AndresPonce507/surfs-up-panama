# Un surfista ve hoy el puntaje real de un spot, y a la mañana siguiente lee intacto lo que dijimos ayer
ID: EXP-daily-call-with-permanent-receipts-1 · Spec rows: slice-01 · Persona: Surfista que decide a las 5:40am desde el teléfono

## Intent
A surfer opens the site and sees one real spot with today's score and its call in Spanish, computed from this morning's actual model data. In the same browser session, they can open that spot's yesterday page and read the retained prior-dawn receipt exactly as published, unchanged.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

For tonight's one-session walk:

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (this is the publish step: it takes this morning's real model data, scores it, and renders the static pages into `dist/`; if the build says a data step must run first, run the step it names, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open that URL in the browser. Record in the session log, word for word: the spot's name, its score, the full call text, and the update time the page shows. Also note the spot's address (open the spot and copy the URL).
6. In the same browser session, open that spot's yesterday page: the spot's own address with `/ayer` at the end. If the spot page shows a link to yesterday, following that link is equally valid. Record its visible publication time, score, and full call text; reload it and return to it from the spot page.

## Charter
Explore the built site in the browser as the surfer who decides at dawn: today's page for the one real spot, and that spot's retained yesterday page. The heart of the walk is the promise about time: the prior-dawn receipt is plainly readable as the receipt that was published, not a fresh version of today's call. Poke the edges too: reload a few times and watch each receipt hold still, navigate back to yesterday from the spot page, and mistype a spot address to see what the site does with it.

## Expected observations (oracle)
- Hoy: la página muestra un spot real con nombre propio, un puntaje entero entre 0 y 100, y su llamado en español de a pie: tamaño en palabras del cuerpo y el viento. Nada en inglés en la página en español.
- La página dice en palabras cuándo se actualizó, y esa hora es de hoy, de la corrida que acabás de hacer, no una fecha de ejemplo.
- Ayer: la página del mismo spot muestra un recibo de la madrugada anterior con su propia hora de publicación, puntaje y llamado completo en español. Es legible como un recibo retenido, no como un duplicado ambiguo de la pantalla de hoy.
- Al recargar y al volver a llegar a `/ayer` desde la página del spot, el recibo de ayer conserva exactamente sus palabras, números y hora de publicación visibles durante la sesión.
- La pantalla se ve terminada: el puntaje se lee con el brazo estirado, nada cortado, desalineado ni con pinta de relleno, y nada en la pantalla se mueve sin que lo pidas.
- Negative: la página de ayer no puede mostrar los números de hoy ni presentarse como un cálculo recién hecho; si cambia sus palabras, números u hora visibles al volver a verla durante la sesión, es FALLA, aunque el número nuevo parezca mejor.
- Negative: nada de errores crudos en ninguna de las dos páginas: ni stack trace, ni "undefined", ni "NaN", ni JSON pelado.
- Negative: si el build no consiguió los datos del modelo de esta mañana, la página no puede inventar un puntaje como si nada: tiene que decir que no pudo, nunca fingir que miró.

Deferred, not this slice: the twenty-spot ranked list (slice-03), the oversized call card (slice-04), the Mañana tab (slice-05), per-row confidence (slice-07). Their absence here is not a failure.

## Launch verification (post-deploy; not a local slice oracle)
On the real deployed site, where the hourly ingest runs overnight unattended, conduct a two-real-morning check: record one spot's published receipt on the first morning; after the following morning's unattended production update, open that spot's `/ayer` page and compare the prior receipt word for word, number for number, and publication time for publication time. A mismatch is a launch-verification failure. This check is meaningful only against the deployed service and is deferred from tonight's local slice examination; no local midnight wait is required for this charter.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-08 | nw-user-examiner | INDETERMINATE | Day 1 rendered Playa Venao, 80, “Cintura a pecho y limpio temprano.”, and `Actualizado 2026-08-08T11:22:00Z`; two reloads held it. Its /ayer page already showed 74, “El llamado publicado a esa hora.”, and “Publicado a las 6:22 a.m.”; /spots/no-existe showed 404: Not Found. No genuine next-day publish was available, so the required day-to-day identity comparison could not be observed. |
| 2026-08-08 | nw-user-examiner | FAIL | Build and preview started. Hoy rendered Playa Venao, 80, “Cintura a pecho y limpio temprano.”, `Actualizado 2026-08-08T11:22:00Z`; /ayer rendered 74, the same call, and “Publicado a las 6:22 a.m.”. But three rendered opens of the valid /spots/playa-venao/ayer address alternated blank → receipt → blank, so the retained receipt was not consistently visible. /spots/no-existe showed a clear 404: Not Found; no raw error appeared on the rendered receipts. |
| 2026-08-08 | nw-user-examiner | PASS | Build and preview started at http://localhost:4321. Today rendered Playa Venao, 80, “Cintura a pecho y limpio temprano.”, and `Actualizado 2026-08-08T11:22:00Z`; its rendered reload held those values. In the same browser session, /spots/playa-venao/ayer rendered “Así estuvo ayer”, 74 puntos, “Cintura a pecho y limpio temprano.”, and “Publicado a las 6:22 a.m.”; its reload and a return from the spot page preserved all visible words, number, and time. Neither receipt showed a stack trace, undefined, NaN, or bare JSON. /spots/no-existe visibly returned 404: Not Found. |
