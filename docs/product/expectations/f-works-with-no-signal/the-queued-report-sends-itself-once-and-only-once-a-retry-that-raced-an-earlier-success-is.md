# El reporte guardado se manda una vez, y solo una: un reintento que se cruzó con un éxito anterior recibe la respuesta original, igualita, y nada se cuenta dos veces
ID: EXP-f-works-with-no-signal-4 · Spec rows: slice-04 · Persona: un surfista cuyo teléfono perdió la señal justo cuando el sitio respondía

## Intent
The queued report sends itself once, and only once. The phone never trusts itself to know what already went: it replays every waiting record, byte for byte, and lets the site's memory of the report's name decide. A retry that raced an earlier success is answered with the original reveal and counted nowhere a second time. The nastiest branch is in scope on purpose: the site heard the report, the answer died on the way back, the entry stayed queued, the next flush replayed it, and the surfer sees one report counted, ever.

## Preconditions
1. The built site at 390 px, the harness playing the site's settled dedup contract (`npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-04"` drives this surface; the storage idempotence itself is F-TELL slice-03's, server side).
2. A queued report whose earlier send already reached the site, and one whose answer was lost mid-air; the harness stages both.
3. The examiner never opens source files.

## Charter
Hunt for the double. Force the ugly timing: the site heard, the phone never learned. When the replay lands, can you find ANY trace of a second report: a second counter tick, a second confirmation, a different answer than the first time? The pass condition is boring sameness: what you are shown after the replay is indistinguishable from what the first success showed, and the count moved exactly once.

## U8 restraint observation (verbatim from the roadmap quality contract, step 04-02)

Veo llegar la respuesta de un reporte que ya había llegado antes y no distingo nada raro: la misma respuesta de la primera vez, un solo conteo, ningún duplicado y ninguna palabra de error. La pantalla se ve terminada a 390 px en tema claro y oscuro y nada se anima con movimiento reducido activado.

## Expected observations (oracle)
- Tras el reenvío de un reporte que ya había llegado, lo que se muestra es lo mismo que mostró la primera llegada. Sin banda nueva de confirmación, sin conteo extra, sin palabras distintas.
- El contador del spot se movió exactamente una vez por ese reporte, aunque el envío haya viajado dos veces.
- Después del reenvío aceptado, el reporte ya no está esperando en el teléfono.
- Negative: un segundo conteo, una segunda confirmación o cualquier rastro de "reporte nuevo" en el reenvío es la peor falla posible de este slice.
- Negative: un reenvío tratado como error (rojo, palabra error, pedir al surfista que decida) es FALLA: el teléfono pregunta, el sitio decide, el surfista no se entera.

## Deferred, not this slice
La igualdad palabra por palabra del reveal comparado en pantalla dos: se vuelve verificable cuando F-TELL slice-04 entregue el render del reveal; hasta entonces el observable equivalente es el estado de llegada y el conteo único, y el fortalecimiento queda anotado en el paso 04-02 del roadmap.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
