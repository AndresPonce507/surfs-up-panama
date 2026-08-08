# La tarjeta grande de arriba ES el llamado: nombra el spot y da una razón que se puede repetir de memoria
ID: EXP-daily-call-with-permanent-receipts-4 · Spec rows: slice-04 · Persona: Surfista que decide en cinco segundos y le avisa a un amigo

## Intent
The top spot is unmistakably the call: an oversized card names it and gives a plain-language reason in Spanish a surfer can repeat to a friend without looking back at the screen.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home at that URL, in a phone-width window (about 390 px wide).

## Charter
Explore the home page as someone deciding in five seconds where to paddle out. The test that matters is memory: read the big card once, look away from the screen, and tell a friend (or write in the log, without peeking) where to go and why. If you need a second look to finish the reason, that is a real observation. Also check the card against the list below it: they must be telling the same story.

## Expected observations (oracle)
- Arriba de todo hay UNA tarjeta claramente más grande que el resto: nombra el spot con un verbo de ir (del estilo "VE A ...") y trae su puntaje bien grande.
- La razón está en español de a pie: tamaño en palabras del cuerpo, viento, y cuándo conviene (una ventana con horas). Algo que un surfista le repite a un amigo tal cual.
- Prueba de memoria: después de leer la tarjeta una sola vez podés decir, sin volver a mirar, a dónde ir, qué tan grande está y por qué ahora.
- La tarjeta cuenta la misma historia que la lista: el spot de la tarjeta es el de mejor puntaje, y su número cuadra con su propia fila.
- La tarjeta se ve terminada: el puntaje se lee con el brazo estirado, es obvio de un vistazo cuál es EL llamado del día, nada desalineado ni cortado, y nada se mueve solo.
- Negative: la tarjeta no puede nombrar un spot distinto del mejor puntaje de la lista, ni traer un número que no cuadre con la lista de abajo.
- Negative: la razón no puede ser jerga técnica ni datos crudos (nombres de modelos, variables, JSON), y no puede venir vacía mientras la tarjeta igual grita a dónde ir.

Deferred, not this slice: per-row confidence and its reason (slice-07); the spot's own page (slice-06). Their absence is not a failure here.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
