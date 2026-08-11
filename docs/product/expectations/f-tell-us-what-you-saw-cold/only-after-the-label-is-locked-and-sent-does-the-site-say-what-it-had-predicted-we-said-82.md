# Solo con tu etiqueta ya guardada y enviada el sitio dice qué había pronosticado y por cuánto falló
ID: EXP-f-tell-us-what-you-saw-cold-4 · Spec rows: slice-04 · Persona: Surfista saliendo del agua en Playa Venao con quince segundos de paciencia

## Intent
Only after the label is locked and sent does the site say what it had predicted: we said 82, chest
to head, clean, you saw waist to chest, choppy, we were 14 too high. On the rare morning the
builder was down and there is nothing to compare against, it says that plainly instead of
inventing a number. The reveal exists only as the response to the submission: it has no address of
its own, and that is part of what this charter checks.

## Preconditions
Same honest gate as the slice-03 charter: a reachable REAL report endpoint is required, and the
exact recipe gets pinned at this slice's JIT DISTILL. Additionally the reveal needs real published
calls to compare against: the keystone's build writes `log/calls/v1` hourly, so a normal walk on a
deployed or locally-run stack has a call for the current hour. For the no-comparison branch, the
recipe will name the honest way to reach an hour with no logged call. If either surface cannot be
reached, INDETERMINATE, never a PASS by absence.

1. Build and serve the site; confirm the endpoint per the pinned recipe.
2. Walk the full flow online: three answers, Mandar, read the reveal.
3. Record word for word what the reveal says: what we said, what you saw, the signed difference,
   and the counter line.
4. Attack the reveal's independence: try to reach a comparison without filing a report (direct
   navigation to the reported screen, back and forward, reload). There must be no address that
   hands out a reveal.

## JIT DISTILL recipe (2026-08-10)
Set `REPORT_ACCEPTANCE_ORIGIN` to the real Slice-03 report journey, never a mock or intercepted
request. The compared walk uses a genuinely published call; the no-comparison walk uses a real
hour without a matching published call. The prerequisite is intentionally external: the test must
not forge either response. Slice-03 must be green first, and the guarded write deployment
prerequisites in feature-delta rows 2, 5 and 6 remain explicit before any deployed observation.

The call and no-call examples need separately prepared real published artifacts. Until their
owners supply those environments, their verdict is INDETERMINATE, never a forged response and
never a substitute endpoint.

## Charter
Explore the reveal as the surfer who wants to know how the site did. The heart of the walk is the
order and the honesty: your answer first, our number after, and when there is nothing to compare,
the site says exactly that. Read the delta like a surfer would: does "nos pasamos" match the
direction of the numbers shown? Then poke the edges: reload the reveal, walk back to the spot page
and return, open the reported screen directly without filing anything.

## Expected observations (oracle)
- La revelación aparece solo después de Mandar, y dice en español de a pie: qué dijimos (puntaje,
  banda de tamaño, viento), qué viste tú (tu banda, tu viento), y por cuánto nos pasamos o nos
  quedamos cortos, en puntos, con la dirección correcta. Las palabras de tamaño y viento son las
  mismas del formulario: una sola familia de palabras en las dos mitades de la tarjeta.
- La línea del contador acompaña la revelación: "Reporte {n} de {threshold} en este spot.
  Gracias." con números enteros que no bajan al recargar.
- En la mañana rara sin pronóstico registrado para esa hora, la pantalla dice palabra por palabra
  "Gracias. Esa hora no la teníamos pronosticada, así que no hay comparación." y no muestra ningún
  número inventado, ninguna comparación parcial.
- Abrir la pantalla de reportado directamente, sin haber mandado nada, muestra un agradecimiento
  genérico sin revelación. No existe dirección alguna que entregue una comparación sin un envío.
- La tarjeta se ve a 390 px sin recorte ni desplazamiento horizontal, legible contra el fondo real
  en los dos temas (AA como piso), objetivos de al menos 44 px, nada animado con movimiento
  reducido.
- U8: la tarjeta de revelación se ve terminada: se lee con el brazo estirado, el "dijimos" y el
  "tú viste" se distinguen de un vistazo, nada desalineado, nada de relleno, nada que se mueva
  solo.
- Negative, la fuga de anclaje: el pronóstico jamás aparece antes del guardado y envío de tu
  etiqueta. La pantalla uno sigue sin un solo número nuestro, y ningún camino (atrás, recarga,
  navegación directa) muestra una comparación para un reporte que no se mandó. Si el pronóstico se
  asoma antes de la etiqueta, es FALLA aunque la comparación sea correcta.
- Negative: la revelación no ofrece ningún camino de vuelta a editar la etiqueta. Lo contestado,
  contestado está.
- Negative: si no hay comparación, la pantalla no puede fingir una: un puntaje inventado, un
  guion, un "0" o un espacio en blanco donde iría el número son todos FALLA. La frase honesta es
  la única salida.
- Negative: nada de errores crudos: ni stack trace, ni "undefined", ni "NaN", ni JSON pelado.

Deferred, not this slice: the clock refusal (slice-05), the reveal after an offline flush
(F-WORKS-WITH-NO-SIGNAL slice-03), the identical repeated reveal on retry (F-WORKS-WITH-NO-SIGNAL
slice-04), the scorecard headline (F-SHOW-OUR-TRACK-RECORD).

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
