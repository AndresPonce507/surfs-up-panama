# Un reporte mandado sin señal se envía solo cuando el surfista vuelve a tener cobertura, y la página sin señal cuenta lo que está esperando
ID: EXP-f-works-with-no-signal-3 · Spec rows: slice-03 · Persona: un surfista que reportó desde la arena, guardó el teléfono y manejó de vuelta

## Intent
A report filed with no signal sends itself when the surfer walks back into coverage: the queue flushes when the signal returns and when the offline helper first arrives, backs off politely when the door is throttled, and keeps a refusal without retrying it. The refusal is explained only on the sin señal queue surface, reached by an explicit offline navigation after the refusal; it never appears as a home-page bridge, toast or Base-level message. That same surface makes its second settled promise while counting the reports waiting to go. Nothing the surfer sees during the wait ever reads as a failure, because a surfer who sees failure re-taps, and re-taps are the duplicates the next slice exists to prevent.

## Preconditions
1. The built site at 390 px, served with the signal under the harness's control (`npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-03"` drives this same surface).
2. A report already committed to the phone's queue (the capture journey belongs to F-TELL-US-WHAT-YOU-SAW-COLD; if it is not shipped, the harness plants the committed record at the seam and the examiner says so in the log).
3. The examiner never opens source files.

## Charter
Live the wait like the surfer: file with nothing, pocket the phone, come back into coverage. Did the report leave without you touching anything? While it waited, did any screen ever make you feel it had failed, or was waiting always calm? For the refusal branch, let the site reject one queued report, confirm it remains waiting without another send, cut the signal again, and open a spot that was never opened so the sin señal page appears. Read the reason there, beside the real waiting count. Do not look for it on the home page: that is not an owned surface. Does the sin señal page also promise, in the settled words, that reports are kept, and does the count match what is actually waiting, no more, no less?

## U8 restraint observation (verbatim from the roadmap quality contract, step 03-05)

Hago que el sitio rechace un reporte, vuelvo a quedarme sin señal y abro una ruta nueva hasta llegar a la página sin señal. Leo las dos frases completas y, debajo, la caja con 1 reporte guardado, la razón en español que mandó el sitio y que se manda al volver la señal. La razón no aparece en inicio. Nada se lee como error ni como promesa vacía; se ve terminada en ambos temas a 390 px y nada se anima con movimiento reducido activado.

## Expected observations (oracle)
- Con la señal de vuelta, el reporte sale solo, sin ningún toque, y deja de estar esperando en el teléfono.
- La página sin señal ahora dice, palabra por palabra, "Los reportes que mandes quedan guardados.", y la caja cuenta lo que de verdad espera: "1 reporte guardado. Se manda al volver la señal."
- Mientras un reporte espera por una puerta ocupada, la pantalla lo muestra como pendiente, con la misma calma que sin señal. Nunca rojo, nunca la palabra error.
- Si el sitio rechaza un reporte con una razón, después de navegar sin señal la razón se lee en español sencillo dentro de la página sin señal, el reporte se queda en el teléfono, y el teléfono no lo reintenta solo. La razón no sale en inicio.
- Negative: una caja que cuenta reportes que no existen, o que no cuenta uno que sí espera, es FALLA: el conteo es de entradas reales, jamás un adorno.
- Negative: cualquier estado de espera vestido de fallo (un error, un rojo, un reintento visible tipo martilleo) es FALLA.

## Deferred, not this slice
La respuesta idéntica a un reenvío que ya había llegado (slice-04); el render del reveal comparado (F-TELL slice-04); el envío en vivo contra AWS mientras el stack de escritura siga bloqueado.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
