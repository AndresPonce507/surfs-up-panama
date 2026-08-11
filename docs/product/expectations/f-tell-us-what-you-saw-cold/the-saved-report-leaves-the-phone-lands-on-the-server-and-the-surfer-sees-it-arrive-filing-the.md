# El reporte guardado sale del teléfono, llega al servidor, y mandarlo dos veces guarda uno solo
ID: EXP-f-tell-us-what-you-saw-cold-3 · Spec rows: slice-03 · Persona: Surfista saliendo del agua en Playa Venao con quince segundos de paciencia

## Intent
The saved report leaves the phone, lands on the server, and the surfer sees it arrive. Filing the
same report twice stores it once. The screen the surfer sees here is an arrival state that makes
no claim at all about forecast availability, which is why it cannot be false. The comparison is
the next slice's job.

## Preconditions
Stated honestly: this charter examines a write path that does not exist yet, and its deploy is
gated on two open items in the feature delta: the account Lambda concurrency quota check
(Pre-requisite 2, HANDOFF §6 item 6) and write-stack ownership (Pre-requisite 5). The examiner
needs a reachable report endpoint: the deployed Function URL, or a local run of the REAL handler
wired to a local store, whichever DELIVER produces for this slice. The exact commands and URL get
pinned into this section when the slice enters its JIT DISTILL; observations against a mock that
is not the real handler are not valid evidence. If no such surface presents itself, the verdict is
INDETERMINATE, never a PASS by absence.

1. Build and serve the site as in the slice-01 charter.
2. Confirm the report endpoint the site is pointed at, from the recipe pinned at JIT DISTILL.
3. Walk the flow online: three answers, Mandar, and watch screen two.
4. For the twice-filed check: repeat the submission of the same saved report (re-send, or reload
   and let the page-open flush re-send it). The recipe will name the concrete way to force it.

## JIT DISTILL recipe (2026-08-10)
Set `REPORT_ACCEPTANCE_ORIGIN` to an origin where the production report page is connected to the
real report handler. A deployed guarded write stack is preferred; a locally run production handler
wired to its real local store is valid before deployment. There is no default and no test-owned
endpoint. The run is RED until this prerequisite exists. Before a deploy, Pre-requisites 2, 5 and
6 in the feature delta must be recorded as resolved by their owners; DISTILL does not deploy or
invent an answer for any of them.

For the duplicate and page-open checks, the examiner first creates the report through the real
offline browser flow, reads its durable identity from that browser's own queue, and resends that
same record to the real public handler. For the quota check, `REPORT_ACCEPTANCE_QUOTA_CREDENTIAL`
names a real pre-provisioned device already at its allowance. For the unknown-beach check, the
same real public handler receives the browser-created record with only its beach name changed.
Those two cases cannot originate in the page because the product correctly offers neither control.

## JIT repair: the page owns the journey (2026-08-11)

The browser proof has two deliberately separate parts. Locally, the built production page runs in
real Chromium with its real IndexedDB queue beside the reviewed production-local Report/Mint HTTP
composition at the page's own paths. That composition has a disposable real filesystem store,
fresh HMAC secret, actual clock and launch spot index. The test only observes the page's own
requests and responses; it never sends a request for the surfer, intercepts a response, or
provides a substitute endpoint. Its useful RED is therefore plain: after Mandar, the page did not
send the saved label.

Function-URL CORS and `Cache-Control: no-store`, quota/device inputs and the deployed generated
spot-index refusal remain external checks. Until those values exist, record INDETERMINATE. Older
direct handler calls remain narrow handler-boundary checks only; they cannot be cited as proof
that a surfer's page sent or rendered anything. The deployed walk must observe the page's own
credential, byte-identical saved-label replay, Spanish refusal or quiet arrival/reveal.

## Charter
Explore the arrival of a report as the surfer who just filed it. The heart of the walk is two
promises: the report actually arrives (the screen tells you so), and filing the same report twice
never becomes two reports. Probe the seams: submit, then force a second send of the identical
report and watch nothing double. Watch the quiet parts too: at no point does any credential or
sign-up step appear, and at no point does the wait read as an error.

## Expected observations (oracle)
- Con señal, tras Mandar, la pantalla dos muestra un estado de llegada: el reporte salió del
  teléfono y el servidor lo tiene. El estado no afirma nada sobre el pronóstico: ni comparación,
  ni puntaje, ni promesa de que exista una.
- Mandar el mismo reporte dos veces guarda uno: la segunda entrega se reconoce sin duplicar, la
  pantalla no muestra dos reportes ni cuenta dos veces, y nada se lee como error.
- En ningún momento aparece un paso visible de credencial, registro o espera de identidad: tres
  taps y ya, como promete la decisión 11.
- El estado de llegada se ve a 390 px sin desplazamiento horizontal, legible contra el fondo real
  en los dos temas, objetivos táctiles de al menos 44 px, y sin animaciones con movimiento
  reducido activado.
- U8: el estado de llegada se ve terminado, una frase tranquila que se lee de un vistazo, sin
  relleno, sin espacios reservados vacíos, sin nada que se mueva solo.
- Negative, la fuga de anclaje: nada del pronóstico aparece antes de que la etiqueta esté guardada
  y enviada. La pantalla uno sigue fría de punta a punta. Si un puntaje o una comparación se asoma
  en este slice, es FALLA: la revelación pertenece al slice siguiente y solo puede nacer de la
  respuesta del servidor.
- Negative: el reporte nunca desaparece en silencio. Toda espera se lee como pendiente, jamás como
  error rojo, y la etiqueta sigue en el teléfono hasta que el servidor la reconoce.
- Negative: nada de errores crudos: ni stack trace, ni "undefined", ni JSON pelado en pantalla.

Deferred, not this slice: the comparison and the counter line (slice-04), the clock refusal
(slice-05), the flush on the `online` event and the backoff ladder (F-WORKS-WITH-NO-SIGNAL
slice-03), the byte-equivalent duplicate reveal on re-sync (F-WORKS-WITH-NO-SIGNAL slice-04).

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
