# Un pronóstico servido desde el teléfono es honesto con su edad: muestra su propia hora de publicación, pasa a la línea ámbar Viejo después de tres horas, y nunca viste un puntaje viejo como un llamado nuevo
ID: EXP-f-works-with-no-signal-2 · Spec rows: slice-02 · Persona: un surfista que abre el pronóstico a media mañana sin saber que lo que mira es de las 6:04

## Intent
A forecast served from cache is honest about its age. Every reading page carries its own publish moment; under three hours the settled stamp is honest on its own; past three hours the amber line flips to the verbatim words "Viejo. Lo último que vimos fue a las {hora}. No pudimos sacar datos nuevos esta mañana." The original machine-readable publish moment is never rewritten. This is the most-read honesty surface the feature produces: a stale forecast must LOOK stale, and it must never pass for fresh.

## Preconditions
1. The built site at 390 px, both themes. A fresh pass (forecast under three hours old) and a stale pass (the phone believing more than three hours have passed; the acceptance harness moves the phone's clock, an examiner may simply return to a tab hours later).
2. One pass with JavaScript disabled.
3. The examiner never opens source files.

## Charter
Look at the page as someone deciding whether to drive. Can you tell, in one glance and in plain Spanish, WHEN this forecast was last true? When it is old, does the page admit it loudly enough that you would not plan a morning on it? Does the amber line read as a warning without reading as an error or a broken page? With JavaScript off, is the plain hour still there and still true?

## U8 restraint observation (verbatim from the roadmap quality contract, step 02-02)

Abro el pronóstico cuando ya pasaron más de tres horas y la línea ámbar me lo dice de frente: Viejo, la hora en que lo vimos, y que no pudimos sacar datos nuevos. Se lee como un aviso honesto, no como un error, a 390 px, en tema claro y oscuro, sin que nada se mueva con movimiento reducido activado. Un pronóstico fresco nunca lleva esa línea.

## Expected observations (oracle)
- Fresco: la estampa "Actualizado {hora}" se lee a la primera, y en ninguna parte dice Viejo. Un pronóstico fresco jamás se viste de viejo.
- Viejo (más de tres horas): aparece la línea ámbar completa, "Viejo. Lo último que vimos fue a las {hora}. No pudimos sacar datos nuevos esta mañana.", palabra por palabra, con una hora de reloj de verdad en {hora}.
- La línea ámbar se distingue del resto sin gritar: es un aviso de honestidad, no un estado de error. Contraste legible en tema claro y oscuro, sin scroll horizontal a 390 px, nada se anima con movimiento reducido activado.
- Sin JavaScript: la hora absoluta sigue en pantalla y sigue siendo verdad.
- Negative: una fecha ISO cruda, un token de plantilla o una palabra en inglés en cualquier estado es FALLA.
- Negative: un puntaje viejo presentado con cara de nuevo (sin Viejo, sin hora, o con una hora refrescada) es la peor falla posible de este slice.

## Deferred, not this slice
La edad relativa en palabras ("hace 20 minutos"): su texto en español no está acordado en ningún documento y no se inventa aquí; va por el canal del primo con las otras cadenas pendientes.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
