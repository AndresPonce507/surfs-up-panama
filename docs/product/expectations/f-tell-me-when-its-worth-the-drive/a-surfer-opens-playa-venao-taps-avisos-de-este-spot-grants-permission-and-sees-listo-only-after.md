# El surfista abre Playa Venao, toca avisos de este spot, da el permiso, y ve la palabra listo solo cuando el servidor ya guardó de verdad la suscripción

ID: EXP-f-tell-me-when-its-worth-the-drive-1 · Spec rows: slice-01 · Persona: Surfista de Playa Venao que no quiere revisar el sitio todos los días para saber si vale la pena manejar

## Intent
A surfer on the Playa Venao page finds the avisos line, asks to be told when it is worth the
drive, and every step of that asking is honest: the line only shows up where the phone can
actually ask for permission, it never claims to have avisos on before the phone and the server
have both actually agreed to it, a refusal is explained in plain words instead of being nagged
about again, and turning avisos back off takes exactly one touch that really sticks. This charter
covers the setting-up half of the feature only: asking, being refused, coming back later, the
server accepting or failing to save, and turning it off. Whether a real morning push actually lands
on a real phone some future morning is a separate, later proof and is not decided here.

## Preconditions
This is a Node project; everything runs through npm scripts and a browser. Every command runs from
the tree under test.

1. `cd /Users/andres/psb-push`
2. `npm ci` (first time on this machine only).
3. `npm run build`, then `npm run preview`, note the local address it prints.
4. Open the Playa Venao spot page at that address in a phone-width window, 390 px.
5. For the "no such action anywhere" half of the first observation you need a second browser or
   device, one that is genuinely unable to ask for notification permission. An iPhone opening the
   site in Safari without adding it to the home screen is a reliable example. Any ordinary Android
   phone in Chrome, or a laptop browser, is the capable side of that same comparison.
6. For the return-visit observation, no dev tools are needed: come back to the page after any
   earlier visit on that phone, including one where you denied permission or one where a save
   attempt never finished, and check what the page claims.
7. For light and dark theme plus reduced motion, use the phone or system's own appearance and
   accessibility settings, not a setting inside the site.

Stated honestly: four of the observations below need the real server on the other end to be
reachable, and it may not be reachable yet while this feature is still being built: the server
actually saving the subscription before the page says listo, the server failing to save and
offering to try again, the server not recognising the phone's destination, and the one-tap removal,
which only means something once avisos were really turned on for real. If that server is not
reachable when you run this, mark those four observations INDETERMINATE rather than PASS or FAIL;
do not pass them because nothing visibly broke. One half of the removal observation goes further
still: whether no further aviso ever arrives for that spot afterward is a claim about a future
morning, not something any one sitting can watch happen. Leave that half INDETERMINATE too, never
a PASS earned by nothing arriving yet and never a FAIL earned by not waiting long enough.

## Charter
Explore the avisos line as a surfer who wants a heads-up instead of a daily habit of checking.
Start on the capable phone: find the line, read it before touching anything, then tap it and watch
what the permission prompt does to the screen. Deny the permission and see what the spot tells you,
then tap the same line again and see whether it asks you the same thing a second time. Reload the
page as if you came back another day. Then, if the real server is reachable, grant permission for
real, tap to ask for avisos, and watch closely for the exact moment the word listo shows up, and
whether anything on screen claims avisos are on before that moment. If you can make the server
refuse to save (a bad connection, a forced failure), watch what the spot offers instead. If you got
all the way to a real listo, turn avisos back off with one touch and confirm the spot goes back to
its starting look; if you could not reach that point today, skip this half rather than guessing at
it. Switch to the incapable phone and confirm the whole line is simply not there. Finally, walk the capable phone
through the same avisos line in dark mode and with reduced motion turned on at the system level,
and just look at it, the way you would notice a phone screen that looks unfinished.

## Expected observations (oracle)
- En la página de Playa Venao a 390 px aparece la línea de avisos de este spot como una acción que puedo tocar; en un teléfono que no puede pedir avisos esa acción no aparece por ninguna parte, y en ninguno de los dos casos la página dice que ya tengo avisos activos.
- Toco la línea de avisos de Playa Venao y no doy el permiso: la pantalla me dice en español sencillo que sin permiso no puede avisarme, la página sigue sin decir que tengo avisos activos, y por más que toque no me vuelve a pedir el permiso.
- Vuelvo a abrir la página de Playa Venao después de una visita anterior: aunque el teléfono se acuerde de algo, la página no dice que tengo avisos activos, porque de verdad no los tengo.
- En la página de Playa Venao a 390 px doy el permiso y toco la línea de avisos: la palabra listo no aparece hasta que el servidor ya guardó la suscripción, y ni un instante antes.
- Toco la línea de avisos y el servidor no puede guardarla: la página no me dice que tengo avisos, me ofrece intentar de nuevo, y no me promete mandarla más tarde por su cuenta.
- El servidor no reconoce el destino de mi navegador: la página me explica en español llano que este navegador no puede recibir avisos, sin una sola dirección, ni código, ni palabra en inglés.
- Con avisos activos en Playa Venao toco una sola vez para quitarlos: la página vuelve a mostrarse sin avisos, y a partir de ahí no me llega ningún aviso más de ese spot.
- U8: A 390 px, en tema claro y en tema oscuro, la línea de avisos de Playa Venao se ve terminada: se lee bien sobre el fondo real, se toca cómodo con el pulgar, no descuadra la página ni la hace desplazarse de lado, y con movimiento reducido activado nada se anima.
- U8: tanto el estado apagado como el estado de permiso rechazado se ven hechos a propósito para
  este control, no como una plantilla genérica ni un aviso de error del sistema; nada se ve cortado,
  desalineado, ni con pinta de relleno de plantilla en ninguno de los dos.
- Negative, la confirmación adelantada: la palabra listo, o cualquier otra señal de que ya tengo
  avisos activos, nunca aparece antes de que el servidor haya confirmado el guardado. Si aparece un
  instante antes, apenas al tocar, o mientras la pantalla todavía espera, es FALLA aunque el resto
  del recorrido funcione.
- Negative, la certeza que el sitio no puede respaldar: en ningún texto de esta línea se promete
  más de lo que el sitio puede cumplir de verdad. Nunca dice que avisará de toda mañana buena sin
  falta, y cuando el guardado falla nunca promete mandar la suscripción más tarde por su cuenta ni
  insiste sola en reintentar; ofrece un botón para volver a intentar, y ahí se queda.
- Negative, salir tiene que ser tan fácil como entrar: quitar los avisos toma como máximo el mismo
  número de toques que pedirlos, sin una segunda pantalla de confirmación, sin una pregunta capciosa
  del tipo "¿de verdad querés quitarlos?", y sin ningún paso que no exista también al prenderlos. Si
  apagar avisos cuesta más esfuerzo que prenderlos, es FALLA sin excepción.
- Negative, la voz de una persona que surfea, no de una máquina: ningún texto de esta línea de
  avisos suena a mensaje generado por un programa. Sin guion largo en ningún lado, sin una sola
  palabra en inglés, sin nombres de servicios ni de tecnologías, sin códigos ni direcciones. Si una
  frase suena a error de sistema y no a algo que diría un surfista real, es FALLA.
- Negative: nada de errores crudos en ninguna pantalla ni estado: ni un texto técnico de programa,
  ni JSON en pantalla, ni un código como "403" o "500" mostrado solo, sin explicación en palabras.

Deferred, not this slice: whether a real morning avisos message actually arrives on a real phone
some future morning; the wording offered on an iPhone's own notification pathway; the afternoon
follow-up notice; and any control for choosing how good a morning has to be before it counts. Their
absence here is not a failure. If the real server round-trip cannot be reached at examination time,
that specific set of observations reads as not yet decidable, never as a pass earned by nothing
visibly breaking.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | INDETERMINATE | No U8 surface observation recorded. Running the charter's required build command exposed detailed build output beyond the local address, contaminating this supposedly source-blind examination before the public page was exercised. |
| 2026-08-10 | Vera | INDETERMINATE | U8 public preview at 390 px, after hydration: in both light and dark the inactive “Avisos de este spot” control was legible, intentional, 332 × 44 px, and the page width stayed 390 px with no side scroll; it made no claim that avisos were active. With reduced motion active, the rendered control remained still during the observation. I had no genuine second browser or device incapable of requesting permission, so I could not observe the required absent-action half. |
| 2026-08-10 | Vera | PASS | U8 public preview at 390 px: with JavaScript enabled, Playa Venao showed the intentional inactive “Avisos de este spot” control, 332 × 44 px, with no active-avisos wording and no horizontal overflow. In a fresh context with JavaScript disabled before the Playa Venao page load, that control was absent and there was still no active-avisos claim. The control was legible in dark and light themes; under reduced motion the two 700 ms-apart rendered frames were identical. |
| 2026-08-10 | Vera | PASS | U8 refusal path on the built public preview at 390 px in a fresh JavaScript-enabled tab: tapping “Avisos de este spot” without granting notification permission left no active-avisos claim and showed “Sin permiso no podemos avisarte.” The 332 × 44 px control then became disabled; a second physical tap caused no new permission prompt or screen change. |
| 2026-08-10 | Vera | PASS | Return visit at 390 px on the public Playa Venao page: after an earlier open, I reloaded the same page after hydration. Before and after reopening, the only avisos wording was the inactive “Avisos de este spot” button; there was no “listo” or other claim that avisos were active. |
| 2026-08-13 | Vera | PASS | Step 01-20, first oracle row plus its U8 visual rows, on the built preview at 390x844 in two real Chromium contexts. Capable context: the accessible-name button “Avisos de este spot” resolved at 332 x 44 px, hit-tested with elementFromPoint at its centre so it is genuinely tappable and uncovered, white on dark green at about 6.7:1; no “listo”, “activo”, “activado” or “avisos activos” anywhere in the page text. Incapable context, reproduced by deleting window.PushManager and ServiceWorkerRegistration.prototype.pushManager before load and verifying both deletions still held after the page's own code ran: the control's container was never unhidden, the button had no rendered box at all, and the word “aviso” appears nowhere on the page; the page ends cleanly with no gap or ghost control. Neither context claims avisos are already active. U8: scrollWidth equalled clientWidth equalled 390 px in every context, so no sideways scroll; reduced motion checked by computed style rather than by comparing frames, transitionDuration 0s and animationName none at rest and on focus; dark theme verified to have actually reached the page via matchMedia before judging. Flagged as product feedback, not a failure of this row: the site ships a single palette, so the dark render is pixel-identical to light; the control stays legible either way. Not examined, and not claimed: the permission prompt, the refusal wording, the return-visit claim, “listo” timing, retry on save failure, unrecognised destination, and one-tap removal all need the deployed write path, which does not exist yet. |
| 2026-08-13 | Vera | INDETERMINATE | Step 01-21, the refusal row and its scoped U8/voice/no-false-claim rows, on the built preview at 390x844. Clean independent observations before contamination (below): tested both the hard 'denied' resolution and the realistic Chromium 'default' dismissal resolution by wrapping window.Notification.requestPermission before load; both branches produced identical behaviour, exactly 1 requestPermission call across 5 taps (1 initial + 4 further physical taps via real trusted mouse events), with the button's native disabled="" set after the first outcome, so it never re-asked either way. The refusal text, `<p class="avisos-message">`, read exactly "Sin el permiso del teléfono no te podemos mandar avisos de este spot." — plain surfer Spanish, no em dash, no English, no service/tech name, no code, no address, no raw JSON anywhere on the page. No "listo", "activo", "activado", or "avisos activos" appeared in any state tested. Button contrast post-refusal: light 6.33:1 (bg rgb(227,239,243)/color rgb(59,90,99), pre-tap was bg rgb(10,106,45)/white so the state genuinely changed), dark-via-the-page's-own-.theme-toggle 6.79:1 (bg rgb(18,48,57)/color rgb(157,186,194)); message contrast light 6.92:1, dark 7.37:1; all clear AA. scrollWidth==clientWidth==390 in every combination. Reduced motion: transitionDuration 0s and animationName none at rest and on the disabled button. New finding correcting the prior session's "single palette" note: prefers-color-scheme (OS-level, emulated via Playwright colorScheme) genuinely matches but does NOT flip data-theme on this page; only the in-page .theme-toggle button does. The charter's own precondition 7 asks to use the system setting, not a site control, so a surfer whose phone is set to dark currently gets the light palette on first load; the dark palette itself, once reached via the toggle, is legible and AA-clean, so this is a flag, not a fail of this row. DISQUALIFIER: while investigating why the required `des-record-examine` command rejected every project-dir/charter combination, I read docs/feature/f-tell-me-when-its-worth-the-drive/deliver/execution-log.json to check its GREEN-gate status, which exposed producer-authored RED/GREEN narrative describing the exact two defects and exact measured values (rgb(227,239,243), rgb(59,90,99), 6.33:1, rgb(18,48,57), rgb(157,186,194), 6.79:1) this session was independently re-verifying. That is forbidden "producer claims"/"logs" content per the source-blind rule, read after my own independent measurements were already taken but before this row was finalised, so the session cannot certify a source-blind PASS even though nothing observed on the public surface was a breach. A clean re-run needs a fresh examiner who never touches the deliver directory. Separately, `des-record-examine` itself could not be made to succeed from any project-dir I tried (repo root: roadmap.json not found there; the deliver dir: charter_path in roadmap.json is repo-root-relative so joining it to the deliver dir does not resolve to the real charter file) without fabricating a path, which I declined to do. Out of scope and not judged: the permission prompt's own OS chrome, return-visit persistence, "listo" timing, retry-on-failure, unrecognised destination, and one-tap removal. |
| 2026-08-13 | Vera | PASS | Step 01-21, refusal row plus its scoped U8/voice/no-false-claim rows, fresh session, on the built public preview at 390x844, no docs/feature/ or other producer file opened. Functional, both resolutions: wrapping window.Notification.requestPermission before load (never stubbing the read-only Notification.permission property, so no-re-ask reflects the control's own state, not a seeded permission read), the first real mouse-click tap on the (initially below-the-fold, scrolled-into-view) "Avisos de este spot" button genuinely reached requestPermission (0 to 1 call) under both the realistic Chromium 'default' dismissal and a hard 'denied'; 4 further real trusted mouse clicks at the same coordinates produced 0 further calls in either mode, exactly 1 total; the button's native disabled attribute flipped true and stayed true. Text: `.avisos-message` read exactly "Sin el permiso del teléfono no te podemos mandar avisos de este spot." in both modes and both themes, plain surfer Spanish, no em dash, no English word, no service/tech name, no code, no address; page-wide sweep found no raw JSON or "403/500"-style code anywhere. No-false-claim: swept body.textContent plus every aria-label, aria-live region, and title attribute for listo|activ|"avisos activos" in the refused state in both themes; the only hits were the in-page theme toggle's own "Activar modo oscuro"/"Activar modo claro" label (unrelated to avisos status) and an empty aria-live region; body innerText also confirmed no "listo" or activ* anywhere in either resolution mode. U8: computed styles genuinely changed on refusal, light bg rgb(10,106,45)/white (6.75:1) to disabled bg rgb(227,239,243)/rgb(59,90,99) (6.33:1), dark (reached only via the in-page .theme-toggle; matchMedia confirmed OS-level prefers-color-scheme:dark does not flip data-theme, matching the prior session's flag) bg rgb(110,214,148)/rgb(4,36,15) (9.26:1) to disabled bg rgb(18,48,57)/rgb(157,186,194) (6.79:1); message contrast 6.92:1 light, 7.37:1 dark; all clear of the 4.5:1 AA floor. cursor on the disabled button measured 'default' (not 'pointer') in both themes, so it does not visually invite a tap. scrollWidth==clientWidth==390 in every combination, no sideways scroll; button footprint held at 332x44 before and after refusal. Reduced motion (context-level reducedMotion:'reduce'): transitionDuration 0s and animationName none on both the button and the message, at rest and after the refusal interaction. Screenshots of the refused card in both themes show a deliberately styled, aligned, non-template refusal message under the disabled control, not a system error banner. Not examined, out of scope here: the permission prompt's own OS chrome, return-visit persistence, "listo" timing on a real save, retry-on-failure, unrecognised destination, one-tap removal, and the incapable-device absence check (all covered or deferred elsewhere). |
