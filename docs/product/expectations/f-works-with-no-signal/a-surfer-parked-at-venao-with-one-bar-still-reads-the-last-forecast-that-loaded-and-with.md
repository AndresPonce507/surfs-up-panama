# Con una barra de señal en Venao, el surfista sigue viendo lo último que cargó, y sin nada guardado la pantalla lo explica en español claro, nunca un error crudo

ID: EXP-f-works-with-no-signal-1 · Spec rows: slice-01 · Persona: Surfista estacionado en Playa Venao con una barra de señal

## Intent
A surfer parked at Playa Venao with one bar of signal keeps reading whatever the site last managed
to show; a dropped connection never blanks the screen or hands back the browser's own error page.
This charter is the honest-empty half of that promise: when there is nothing of the site's own to
fall back on, a calm Spanish screen says plainly that there is no signal and that this is the last
thing it saw, carrying a real hour rather than a frozen one. The one thing that must never happen
here is the screen promising that a report sent now would be kept safe, before that is even true.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. Every command runs
from the tree under test; give anything else an absolute path.

1. `cd` into the checkout under test.
2. `npm ci` (first time on this machine only).
3. `npm run build`, then `npm run preview`, note the local URL.
4. Open the site on a phone-width viewport, 390 px.
5. Walk in like the surfer would: open the home page once while still connected, so the site has
   something of its own behind it. Then cut the connection (device airplane mode, or the browser's
   own offline switch) and try to open a page you have not visited yet. Read what the screen shows
   in place of a raw connection error.
6. If cutting the connection there does not land you on the no-signal screen on its own, reach it
   by its own address directly instead, and examine it there; note in the log which path you used.
   If neither path ever shows anything but the browser's own error, the verdict is INDETERMINATE,
   never a PASS by absence.

## Charter
Explore the no-signal screen as a surfer who just wants to know if the trip was worth it, standing
in a parking lot with one bar. The heart of the walk is honesty under a bad connection: no white
browser error, no half-loaded skeleton, no promise that is not true yet. Read the sentence itself:
does it say plainly that there is no signal, and does it name what is showing as the last thing the
site managed to load? Then poke at the same honesty from the other side: does the screen ever slip
in a promise about saved reports before that is real? Does anything on it use a raw computer date,
a code, or a stray English word? Check both themes and reduced motion, and judge whether the screen
would pass as finished to someone who never opens the phone's settings.

## U8 restraint observation (verbatim from the roadmap quality contract, step 01-01)

Abro la página sin señal a 390 px y leo, en español sencillo, que no hay señal y que esto es lo último que vimos. No aparece ni una palabra en inglés, ni un código, ni una fecha de máquina, y en ningún momento promete que los reportes queden guardados. Se ve terminada en tema claro y oscuro, y con movimiento reducido activado nada se anima.

## Expected observations (oracle)
- La pantalla dice, en frases completas de español de a pie, que no hay señal y que lo que se ve es
  lo último que el sitio cargó, seguido de una hora real, nunca vacía ni con un texto de relleno en
  su lugar.
- En vez de la pantalla de error propia del navegador o una pantalla en blanco, siempre aparece esta
  pantalla en español, ya sea porque el sitio la mostró sola al quedarse sin nada guardado, o porque
  se llegó a ella por su propia dirección.
- La pantalla se lee sin recorte ni desplazamiento horizontal a 390 px, con texto legible contra el
  fondo real tanto en tema claro como en tema oscuro (AA como piso).
- U8: Abro la página sin señal a 390 px y leo, en español sencillo, que no hay señal y que esto es
  lo último que vimos. No aparece ni una palabra en inglés, ni un código, ni una fecha de máquina, y
  en ningún momento promete que los reportes queden guardados. Se ve terminada en tema claro y
  oscuro, y con movimiento reducido activado nada se anima.
- Negative: la pantalla nunca promete que los reportes que se manden queden guardados. Esa frase no
  existe todavía en ningún lugar de esta pantalla; si aparece, es FALLA aunque el resto se vea
  perfecto.
- Negative, la fuga de certeza: la hora que acompaña la frase se lee como un reporte honesto de lo
  último que se vio, nunca como si fuera la hora de ahora mismo disfrazada de dato fresco. Si no hay
  una hora honesta que mostrar, la frase se lee completa igual, sin inventar una y sin dejar un
  espacio en blanco o un cero en su lugar.
- Negative: si cualquier camino hacia esta pantalla termina en cambio en un error del navegador, una
  pantalla en blanco, un código como "404" u "offline" como único contenido, o cualquier palabra en
  inglés, es FALLA.

Deferred, not this slice: the second sentence about saved reports staying safe and the queued-report
count box (both wait on slice-03's queue), the amber staleness flip on a page that did have
something cached (slice-02), and the add-to-home-screen install hint (slice-05). Their absence here
is not a failure. This charter also does not re-examine whether a page already opened keeps
rendering while the connection stalls: that page looks exactly like the ones earlier charters
already certified, and nothing about its look is new in this slice; the only new thing to examine
here is the no-signal screen itself.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera (nw-user-examiner) | FAIL | Reached /sin-senal/ by its own direct address (200, identical with/without trailing slash) since offline navigation was not exercised. Rendered at 390px in Chromium, light/dark/reduced-motion: document.body.innerHTML is verbatim `<h1>Sin señal. Esto es lo último que vimos.</h1>` with nothing else — no hour, no filler, no second element, despite the shipped CSS defining an `h1 + p` rule with tabular-nums styling for a numeric line that never appears. Oracle row 1 requires the sentence be "seguido de una hora real, nunca vacía"; it is absent, not empty-with-placeholder, just absent, so the surfer has zero way to judge whether "lo último que vimos" is 20 minutes or 3 days old. No English, no code, no machine date, no premature saved-reports promise, no browser error, no horizontal scroll (scrollWidth=clientWidth=390), zero console/page errors, legible in both themes, nothing animates under reduced motion — all clean. Visually: one heading top-left, ~90% of the 390x844 viewport blank, no card, no icon, no way back — reads as an unfinished fallback, not a finished screen. |
| 2026-08-10 | Vera (nw-user-examiner) | PASS | Re-examined after the fix. `npm run build` then `npx serve dist -l 4325`, opened http://localhost:4325/sin-senal/. Raw HTML now: `<h1>Sin señal.</h1><p>Esto es lo último que vimos, de las 7:05 a.m.</p><nav><a data-field="back-to-home" href="/">Volver al inicio</a></nav>` — the h1+p CSS (ink-2 color, tabular-nums) now styles a real element. The hour is static across repeated fetches (identical on two curls 3s apart) while the system clock read 09:01-09:02 local, so it is not "now" dressed up as fresh; cross-checked against the home page's raw `Actualizado 2026-08-10T12:05:00.000Z` (UTC) which converts to 07:05 local, matching exactly — the same underlying publish stamp, just formatted in plain words on this screen instead of ISO. A surfer who knows roughly what time it is can read "de las 7:05 a.m." and correctly judge the data as about two hours old. Rendered with Playwright at 390x844 across light/dark x reduced-motion(on/off), all 4 combos: scrollWidth=clientWidth=390 (no horizontal scroll), zero console/page errors, `document.getAnimations()` returns 0 in every combo (nothing animates under reduced motion, and nothing animates by default either), the one interactive element ("Volver al inicio") measures 113.95x44px (meets the 44px tap floor). Contrast computed from the shipped CSS custom properties: light meta text (#40484f on #ffffff) 9.3:1, dark meta text (#aab4be on #10141a) 8.78:1, both far above AA. No English word, no code, no raw machine date, no em dash, no premature saved-reports promise anywhere in the three visible strings ("Sin señal.", "Esto es lo último que vimos, de las 7:05 a.m.", "Volver al inicio"). Confirmed reduced-motion actually disables the link's transition, not just that nothing was mid-animation at rest: `getComputedStyle(a).transitionDuration` is `0.12s` with reducedMotion off and `0s` with it on. Clicked "Volver al inicio" and it navigates to `http://localhost:4325/` (title "¿Dónde se surfea hoy?") — the link works, closing the prior "no way back" note. Re-confirmed the offline-navigation path with Playwright (visit home, go offline, request an unvisited page): still surfaces the browser's own `net::ERR_INTERNET_DISCONNECTED`, not the app's screen — same as last session, no service worker shipped in dist, and the charter's own step 6 names the direct-address path as an accepted fallback, so this is not scored as a new defect. Screenshots (light and dark) show a clean, deliberate minimal screen: bold heading, one styled meta line with the real hour, a hairline rule, and a working home link — reads as a finished small utility screen, not a broken fallback, though a large blank area remains below the link (not required by any oracle row, noted as beta feedback only). Two residues, neither changes the verdict: (1) the oracle's fuga-de-certeza clause about what the sentence should do when there is no honest hour to show was never exercised — every reachable state on this build has a stamp, and forcing the no-stamp state would mean editing data outside the public surface, so that half of the row is UNEXERCISED, not verified; (2) "de las 7:05 a.m." carries no day, so it reads identically whether the last load was two hours or three days old — this only distinguishes same-day staleness, the multi-day case is explicitly deferred to slice-02's amber flip, so it is in-scope-satisfied but worth naming. Out-of-scope flag for the record, not part of this verdict: the home page's raw served HTML contains `<p>Actualizado 2026-08-10T12:05:00.000Z</p>` — a bare machine ISO timestamp with no formatting, on the same page whose stamp this screen borrows. The stamp is shared as claimed; the formatter is not applied on the home page the way it is here, and a raw machine date on a Spanish surface is exactly what this charter and the project's own copy rule forbid. That belongs to a different charter's scope, not this one. |
