# Cada fila dice cuánta confianza le tenemos y por qué, sin reclamar una certeza que los datos no ganaron
ID: EXP-daily-call-with-permanent-receipts-7 · Spec rows: slice-07 · Persona: Surfista decidiendo cuánto apostarle al número antes de manejar dos horas

## Intent
Every ranked row carries a confidence level with the reason one tap away, in plain Spanish: how far the models agree, and whether anyone has confirmed conditions from the beach. The level never claims more certainty than the data earns.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home, the Mañana page, and a couple of spot pages, in a phone-width window (about 390 px wide).

## Charter
Explore the confidence signal everywhere it appears: home rows, tomorrow's rows, spot pages. Open the reason on many rows, not one: high, medium and low if all three show up. The sharpest probe is the honesty one: the site has no beach reports yet, so read each reason asking "is this claiming someone checked from the beach, or is it honest that this is only models agreeing with each other?" Also read the reasons as a surfer: would these words mean anything to you, or is it dressed-up jargon?

## Expected observations (oracle)
- Cada fila de la lista, en Hoy y en Mañana, trae su nivel de confianza con la palabra al lado ("confianza alta", "media" o "baja"). Ninguna fila sin nivel.
- La razón está a un toque: se abre ahí mismo y explica en español de a pie qué tanto acuerdan los modelos y si alguien confirmó desde la playa.
- Recién arrancando, sin reportes de gente, la razón dice claro que todavía nadie reportó desde la playa: el nivel se presenta como acuerdo entre modelos, no como puntería comprobada.
- Con la confianza sumada, las filas siguen limpias: tres líneas por fila, nada cortado ni amontonado en ancho de teléfono, y las dos señales (puntaje y confianza) se leen sin esfuerzo.

  > Enmienda de producto, 2026-08-09, decidida por Andres. Esta fila decía "dos
  > líneas por fila". La confianza se probó primero compartiendo la segunda línea
  > y el llamado quedaba recortado en las filas 10 y 12 con los textos reales.
  > La salida barata era acortar la etiqueta a "Baja" sola, pero al lado de un
  > puntaje de olas "Baja" se lee como olas chicas, no como poca confianza. El
  > llamado es el producto y la etiqueta tiene que decir "Confianza baja"
  > completa, así que la confianza ocupa su propia tercera línea. No se cambió
  > la carta para que pasara el código: se cambió porque el dueño del producto
  > decidió la forma de la fila.
- Negative: la razón nunca puede reclamar más certeza de la que hay: si ese spot no tiene ni un reporte, la razón no puede decir ni sugerir que alguien confirmó las condiciones desde la playa.
- Negative: el nivel no puede venir solo como color o puntitos sin la palabra al lado: sin la palabra, es FALLA.
- Negative: ninguna fila puede quedar sin su nivel de confianza, y ninguna razón puede abrirse vacía o con texto crudo de datos.

Deferred, not this slice: confidence that folds in real spread semantics and the track record (F-KNOW-HOW-MUCH-TO-TRUST-IT). Here the honest claim is model agreement plus the truth about missing beach reports; do not fail the slice for not knowing more than that.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
