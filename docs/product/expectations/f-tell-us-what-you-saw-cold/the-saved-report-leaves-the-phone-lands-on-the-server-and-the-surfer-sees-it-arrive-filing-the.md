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
4. Observe the one settled arrival state. Do not attempt a re-send through the charter: the page
   has no public re-send control, and this U8 walk does not prescribe reload or page-open behavior.

## JIT DISTILL recipe (2026-08-10)
Set `REPORT_ACCEPTANCE_ORIGIN` to an origin where the production report page is connected to the
real report handler. A deployed guarded write stack is preferred; a locally run production handler
wired to its real local store is valid before deployment. There is no default and no test-owned
endpoint. The run is RED until this prerequisite exists. Before a deploy, Pre-requisites 2, 5 and
6 in the feature delta must be recorded as resolved by their owners; DISTILL does not deploy or
invent an answer for any of them.

The duplicate/idempotency and page-open cases are mandatory real-handler acceptance evidence, not
source-blind charter actions. `report-arrives-once.feature`'s `@covers-R20` scenario replays the
browser-created durable record byte-for-byte to the real handler and requires its duplicate
receipt; that evidence is nonvisual because storage cardinality is not a public page observation.
R26's separate page-open acceptance scenario stays in Slice-03, but it is not a source-blind U8
action. The `online` event, service-worker activation and backoff ladder remain deferred to
F-WORKS-WITH-NO-SIGNAL. For the quota check, `REPORT_ACCEPTANCE_QUOTA_CREDENTIAL` names a real
pre-provisioned device already at its allowance. For the unknown-beach check, the same real public
handler receives the browser-created record with only its beach name changed. Those cases cannot
originate in the page because the product correctly offers neither control.

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

## Evidence boundary

U8 is source-blind and public-surface only. It may pass when the surfer can see one calm, readable
arrival state after Mandar, with no duplicate-looking UI, raw error, account step or premature
forecast. It cannot prove that the store contains one record: the product provides no public
re-send control, and prescribing a reload or page-open action would change this visual charter
into a functional replay test. The Signal-owned online-trigger behavior remains deferred.

R20 remains mandatory real-I/O acceptance evidence. Its real-handler replay must keep the saved
identity and bytes unchanged and receive the idempotent receipt. That check is not weakened or
reclassified as U8. Its deployed/environmental form stays INDETERMINATE until the required origin
and replay environment exist.

## Charter
Explore the arrival of a report as the surfer who just filed it. The heart of the source-blind walk
is the public promise: the report arrives and the screen tells you so without looking duplicated or
broken. Watch the quiet parts too: at no point does any credential or sign-up step appear, and at
no point does the wait read as an error. The duplicate-storage promise is separately covered by
the mandatory R20 real-handler acceptance evidence above.

## Expected observations (oracle)
- Con señal, tras Mandar, la pantalla dos muestra un estado de llegada: el reporte salió del
  teléfono y el servidor lo tiene. El estado no afirma nada sobre el pronóstico: ni comparación,
  ni puntaje, ni promesa de que exista una.
- U8 no pretende contar registros guardados. En esta pantalla pública solo se observa una llegada
  terminada, no dos confirmaciones competidoras ni un error; R20 mantiene la prueba obligatoria de
  repetición idéntica contra el handler real.
- En ningún momento aparece un paso visible de credencial, registro o espera de identidad: tres
  taps y ya, como promete la decisión 11.
- El estado de llegada se ve a 390 px sin desplazamiento horizontal, legible contra el fondo real
  en los dos temas, objetivos táctiles de al menos 44 px, y sin animaciones con movimiento
  reducido activado.
- U8: La llegada muestra una sola confirmación tranquila, sin dos estados competidores ni un error. El mensaje sigue limpio, alineado y sereno. El estado se ve terminado, una frase tranquila que se lee de un vistazo, sin relleno, sin espacios reservados vacíos, sin nada que se mueva solo.
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
| 2026-08-11 | Vera / U8 | INDETERMINATE | The prescribed local-real-io run completed, but this examiner was given no reachable browser page or rendered human-visible observations. I could not verify at 390 px that the cold page makes no pre-receipt arrival claim, then reveals a readable arrival state after receipt without overflow or deployed/external claims. |
| 2026-08-11 | Vera / U8 | INDETERMINATE | At http://127.0.0.1:53539/spots/playa-venao/reportar/ in real Chrome at 390 px, the cold form showed only three answer groups and Mandar, with no forecast, account, credential, production/deploy claim, or horizontal overflow. A valid three-answer submission then showed “Reporte recibido” and “Gracias. Recibimos tu reporte.” with no raw error, forecast, or count; the completed state was legible with 390 px no-overflow in dark and emulated light themes, its only link was 44 px high, and with reduced motion enabled it had no animation or transition and did not move over one second. I could not truthfully exercise the charter’s duplicate requirement: it supplies no public re-send control or concrete page-open replay recipe, and its described durable-queue identity procedure is not a public-surface observation. |
| 2026-08-11 | Vera / U8 | PASS | Fresh source-blind local examination at 390 px in light, dark and reduced-motion modes: cold screen showed only the three answer groups and disabled Mandar, with no credential/account step, forecast, comparison, counter, raw error or horizontal overflow. After the page’s valid submission and matching receipt, it showed one calm `Reporte recibido` / `Gracias. Recibimos tu reporte.` arrival state and a 44 px return action. This visual local proof does not decide deployed Function-URL CORS/no-store, external quota/device or deployed spot-index gates; those remain INDETERMINATE. |
