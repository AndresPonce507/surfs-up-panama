# Tres taps y la etiqueta queda guardada en el teléfono antes de ver un solo número nuestro
ID: EXP-f-tell-us-what-you-saw-cold-1 · Spec rows: slice-01 · Persona: Surfista saliendo del agua en Playa Venao con quince segundos de paciencia

## Intent
A surfer walking off Playa Venao opens the report screen, answers how big, how the wind was and
how it was, taps Mandar, and the screen changes to a saved confirmation that carries no score, no
forecast and no way back to the form. The label is on the phone for good before anything else
happens. This slice needs no server: the whole walk runs against the built site with the network
cut if you want, and the behavior must be identical.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. Every command runs
from the tree under test; give anything else an absolute path.

1. `cd` into the checkout under test.
2. `npm ci` (first time on this machine only).
3. `npm run build`, then `npm run preview`, note the local URL.
4. Open the site on a phone-width viewport, 390 px. Walk in like the surfer would: spot page for
   Playa Venao, then the button `¿ESTUVISTE? CUÉNTANOS`.
5. Repeat the core walk once with the browser offline (device airplane mode or DevTools offline)
   to prove the label commits with no network at all.

Gate carried from the feature file, stated honestly: this slice cannot enter DELIVER until the
canonical wind and quality tokens are settled (feature-delta Pre-requisite 1). If the form still
carries placeholder tokens under the hood, that is invisible from this surface; the charter's
observations stand either way, and the token check lives in the acceptance tests, not here.

## Charter
Explore the two-screen report flow as someone who just surfed and has fifteen seconds of patience.
The heart of the walk is the order of events: your answer locks first, our numbers never appear.
Answer the three questions, tap Mandar, read the confirmation. Then attack the ordering: press
Back from the confirmation, reopen the report screen, reload mid-flow, kill the network before
Mandar. Nothing you do should ever surface a forecast before a label is saved, and nothing should
ever return you to an editable form for a report already saved.

## U8 restraint observation (verbatim from the roadmap quality contract, step 01-03)

En la pantalla del reporte de Playa Venao respondo las tres preguntas con una mano, toco Mandar y la pantalla cambia a la confirmación guardada: sin puntaje, sin pronóstico, sin camino de vuelta al formulario. Se ve terminada a 390 px en tema claro y oscuro, y con movimiento reducido activado nada se anima.

## Expected observations (oracle)
- La pantalla uno muestra exactamente tres preguntas en español de a pie: ¿Qué tan grande? con
  siete opciones de Plano a Doble o más, ¿El viento? con Limpio, Picado y Destrozado, y ¿Cómo
  estuvo? con Malo, Normal, Bueno y Épico. Ningún cuarto control, ningún selector de hora.
- Al tocar Mandar la pantalla cambia a una confirmación de guardado. Sin señal dice, palabra por
  palabra, "Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue." La
  confirmación no muestra puntaje, ni banda de tamaño de hoy, ni palabra de viento de hoy, ni
  comparación alguna.
- Volver atrás desde la confirmación cae en la página del spot, nunca en un formulario editable.
  Abrir el reporte otra vez es un reporte nuevo, en blanco.
- Con el teléfono sin señal el flujo entero se comporta igual: las tres preguntas, Mandar, la
  confirmación de guardado. La espera nunca se lee como error.
- Si el almacenamiento local falla (modo privado, sin espacio), la pantalla lo dice claro antes de
  dejarte contestar, en vez de aceptar un reporte que se perdería en silencio.
- Los botones y radios se tocan con el pulgar: objetivos de al menos 44 px, sin desplazamiento
  horizontal a 390 px, texto legible contra el fondo real en tema claro y oscuro (AA como piso).
  Con movimiento reducido activado, nada se anima.
- U8: la pantalla se ve terminada. Tres preguntas claras que se contestan con una mano, nada
  cortado ni desalineado, la confirmación se lee tranquila y nada en la pantalla se mueve solo ni
  parece relleno de plantilla.
- Negative, la fuga de anclaje: en ningún momento antes de que la etiqueta quede guardada aparece
  un puntaje, una banda de tamaño de hoy, una palabra de viento de hoy ni ninguna pista del
  pronóstico. Ni en la pantalla uno, ni volviendo atrás, ni recargando a mitad del flujo, ni en la
  confirmación. Si algo del pronóstico se asoma antes del guardado, es FALLA aunque todo lo demás
  funcione.
- Negative: la confirmación no ofrece ningún camino de vuelta al formulario ni forma alguna de
  editar lo ya guardado. Si existe, es FALLA.
- Negative: nada de errores crudos en ninguna pantalla: ni stack trace, ni "undefined", ni "NaN",
  ni JSON pelado.

Deferred, not this slice: the report leaving the phone (slice-03), the reveal with the comparison
(slice-04), the clock refusal (slice-05), the flush on reconnect (F-WORKS-WITH-NO-SIGNAL). Their
absence here is not a failure. The reveal CANNOT appear in this slice; if a comparison shows up
anywhere, that is a leak, not progress.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera (nw-user-examiner) | FAIL | At 390px, light/dark/reduced-motion all rendered clean: three questions, no forecast leak, storage-fail message before Mandar enables, offline flow identical, 48px targets, no horizontal scroll. Submit stores durably (IndexedDB `entries` row confirmed: waist_chest/clean/good) then navigates to `/spots/playa-venao/reportado/` showing "Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue." verbatim. BUT: reloading that confirmation address (explicitly instructed check) renders a near-blank page - no heading, no "Guardado" text, no error, only a "Playa Venao" link - reproducible on reload and on a fresh direct navigation to the same URL. Root cause visible from the public surface: `curl` of `/spots/playa-venao/reportado/` shows zero `<script>` tags in the served document, so the confirmation only ever renders when arrived at via the in-app transition; any cold load of the URL the product itself navigated to is permanently blank. Breaks "la confirmación se lee tranquila" / "se ve terminada" for any user whose reload, tab restore, or share of that link lands cold. |
| 2026-08-10 | Vera (nw-user-examiner) | PASS | At 390px viewport, light theme, dark theme (--bg: #10141a), reduced-motion: all render identical. Three questions visible (¿Qué tan grande?, ¿El viento?, ¿Cómo estuvo?) with 7, 3, and 4 options respectively. No forecast, no score, no size-band, no wind-reading visible before Mandar. Radio targets 44px minimum; no horizontal scroll. Form fills cleanly (waist-chest, choppy, good selected). Mandar navigates to /spots/playa-venao/reportado/ showing "Reporte guardado" heading and "Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue." verbatim (matches charter requirement word-for-word). Back button from confirmation lands on /spots/playa-venao/ (spot page, not form). Reopening report via spot-page button shows blank form (zero checked radios) with all original options intact; form is reusable and independent. Confirmation page now renders on reload—/reportado/ URL shows script tag and content renders after reload, unlike previous session when blank. Spanish copy is natural, no technical text, no em-dashes, no raw JSON/timestamps. U8: screen appears finished, no placeholder blocks, no moving elements with reduced-motion enabled. The 01-04 scenario (back lands on spot page, new visits start blank) is fully satisfied. |
