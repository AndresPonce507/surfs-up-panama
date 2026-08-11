# Un teléfono con el reloj mal puesto recibe el motivo en claro y la etiqueta no se pierde sin aviso
ID: EXP-f-tell-us-what-you-saw-cold-5 · Spec rows: slice-05 · Persona: Surfista con el reloj del teléfono descuadrado sin saberlo

## Intent
A phone with a badly wrong clock is told plainly why its report was refused and keeps the label on
screen, instead of the report vanishing without a word. This is the honest-failure half of the
capture: the server refuses a report whose observed time falls outside its plausibility window,
and the one thing that must never happen is a label silently destroyed.

## Preconditions
Same honest gate as the slice-03 charter: a reachable REAL report endpoint, recipe pinned at this
slice's JIT DISTILL. The examiner forces the refusal by skewing the device clock well outside the
window (more than 15 minutes into the future, or more than about 12 hours into the past) before
filing, per the pinned recipe. If the refusal cannot be provoked against the real surface, the
verdict is INDETERMINATE, never a PASS by absence.

1. Build and serve the site; confirm the endpoint per the pinned recipe.
2. Skew the device clock as the recipe names, then walk the flow: three answers, Mandar.
3. Read what the screen says, and check the label is still there.
4. Fix the clock and confirm a fresh report goes through normally.

## JIT DISTILL recipe (2026-08-10)
Set `REPORT_ACCEPTANCE_ORIGIN` to the real Slice-03 report journey. Skew only the browser device
clock to provoke the settled refusal against the real handler, then restore it for the fresh
report. No fixture may stand in for the handler's received time, refusal bounds or plain-language
reply. The report handler and its guarded deployment prerequisites are therefore hard external
preconditions, not work this charter can fake.

The tester applies the skew before opening the real report page, so the page itself stamps the
browser-created report with the shifted time. For recovery it closes that browser context, opens a
fresh context with the normal clock, and files a new report. The handler's received time and
refusal remain wholly production-owned.

## Charter
Explore the refusal as a surfer whose phone clock is wrong through no fault of their own. The
heart of the walk is dignity in failure: the screen explains in plain Spanish why the report was
not accepted, the answers just given are still visible, and nothing retries in a loop pretending
it might work. Probe the edges: does the message read like a human sentence or an error code? Does
waiting change anything (it must not)? Does the label survive a reload?

## Expected observations (oracle)
- Con el reloj descuadrado, tras Mandar, la pantalla explica en español de a pie que el reporte no
  se aceptó por la hora del teléfono, sin jerga: se entiende qué pasó y qué se puede hacer.
- La etiqueta sigue en pantalla: las tres respuestas que el surfista dio no se pierden ni se
  borran. No hay reintento mecánico: el sistema no insiste solo, porque esperar no vuelve válido
  el reporte.
- No existe ningún control para elegir la hora de la sesión: el flujo sigue siendo tres preguntas
  y Mandar, nada más.
- Con el reloj corregido, un reporte nuevo pasa normal.
- El mensaje de rechazo se ve a 390 px sin recorte, legible contra el fondo real en los dos temas,
  y no es una alarma roja a gritos: es una explicación, no un regaño.
- U8: el estado de rechazo se ve terminado: una explicación en frases completas, la etiqueta
  intacta a la vista, nada desalineado ni con pinta de pantalla de error genérica.
- Negative, la fuga de anclaje: el rechazo no revela nada del pronóstico. Un reporte rechazado
  jamás recibe comparación, puntaje ni pista alguna de lo que habíamos dicho.
- Negative: el reporte jamás desaparece sin una palabra. Si la etiqueta se pierde o la pantalla
  queda como si nada hubiera pasado, es FALLA, que es exactamente el defecto que este slice
  existe para impedir.
- Negative: la espera por señal y el rechazo por reloj son estados distintos y se leen distinto:
  lo pendiente se lee tranquilo y se manda solo después; lo rechazado se explica y no se manda
  solo jamás.
- Negative: nada de errores crudos: ni stack trace, ni códigos pelados como "400" como único
  contenido, ni JSON en pantalla.

Deferred, not this slice: any control to back-date a session (feature-delta Pre-requisite 9,
recommendation is always-now at launch; the server window stays open so nothing is foreclosed).

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
