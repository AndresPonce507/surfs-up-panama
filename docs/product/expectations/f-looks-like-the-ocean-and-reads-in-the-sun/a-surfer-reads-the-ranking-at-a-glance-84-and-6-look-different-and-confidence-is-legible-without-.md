# Cada fila se lee de un vistazo: 70 y 0 se distinguen por el largo de la barra y la confianza se lee por forma y palabra, nunca por color

ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-5 · Spec rows: slice-05 · Persona: Surfista recorriendo la lista completa de playas con el pulgar, sol de mediodía pegándole a la pantalla

## Intent
A surfer scanning the whole ranked list can tell, without reading a single number, which spots are worth the drive and which are not, and can gauge how much to trust each score without depending on colour vision. Today every score renders in identical black type, so twenty rows read as one undifferentiated column and rank is carried only by position. On a real morning the top score might be 70 and the bottom 0; today's live data makes that concrete, Playa Guánico at 70 down to Hawaiisito at 0, with twelve spots bunched between 0 and 5. If this slice works, that shape is obvious at arm's length before reading a single row.

The rule this slice ships against: nothing on the ranked list is carried by colour alone. The score gets a bar sized to its own length. Confidence gets a shape and the full word next to it, never a coloured dot. A colour-blind surfer and a washed-out phone screen in direct sun read exactly the same information as a good monitor.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. An observation from any other root gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home page and the Mañana page, in a phone-width window (about 390 px wide), in light and dark theme.
6. Turn on a colour-vision-deficiency simulation for at least one pass (Chrome DevTools → More tools → Rendering → Emulate vision deficiencies → Protanopia and Deuteranopia are enough; any equivalent OS-level or browser filter is fine) and repeat the walk with it on.

## Charter
Explore the full twenty-row list as the surfer scanning the whole coast before coffee, not just the top three. Compare every row's bar against its neighbours, top to bottom, and ask whether the shape of the list (strong at the top, weak at the bottom, the bunching in the middle) is visible without reading any number. Then open several confidence badges across the list, high, medium and low if all three show up, and read them as a colour-blind surfer would: cover one eye to a colour filter, or trust the simulation, and check whether alta, media and baja are still three different things. Try the page at 390 px and narrower, and reload a few times to see the bars and badges hold steady against the same scores from the earlier ranking charter.

## Expected observations (oracle)
- U8 (paso 05-01): "Miro la lista de veinte playas: cada fila tiene, junto a su número, una barra corta o larga que deja ver de un vistazo cuál está mejor, sin que ningún número, orden o color de fondo haya cambiado."
- U8 (paso 05-02): "Junto a cada puntaje veo puntos llenos o vacíos y la palabra de confianza completa, todo en el mismo tono gris, sin ningún color que distinga alta de baja, y la fila se lee igual de bien con la pantalla lavada por el sol."
- U8 (paso 05-03): "Recorro la lista completa con un simulador de daltonismo activado: cada fila se sigue leyendo igual de bien, la barra y los puntos de confianza siguen contando la misma historia que en color normal."
- La barra de cada fila crece y encoge con el puntaje: la fila publicada de 70 se ve claramente más larga que la de 0, y dos filas cercanas en puntaje (por ejemplo dos filas entre 0 y 5) se ven parecidas entre sí, no idénticas a una fila de 70.
- Los puntajes siguen cayendo en columna alineada, de arriba a abajo, exactamente como antes de esta barra: la barra se suma a la fila, no la desordena ni le quita la alineación numérica.
- La confianza siempre trae la palabra completa ("Confianza alta", "media" o "baja") al lado de su forma; ninguna fila queda con solo la forma o solo la palabra.
- El puntaje, el orden de las filas y la razón de cada nivel de confianza son exactamente los mismos que antes de esta barra y esta forma: lo único que cambió es cómo se presentan.
- La decisión que entra en este slice es largo solamente: la barra no abre un segundo significado de color. Si en el futuro se propone un acento de color, requiere una decisión de producto nueva y una carta nueva; este recorrido no lo infiere ni lo acepta por accidente.
- Negative: si dos filas con puntajes bien distintos, como el 70 y el 0 publicados, se ven del mismo tamaño de barra o son indistinguibles a simple vista, es FALLA.
- Negative: si la única manera de distinguir confianza alta de baja es el color (sin la forma, sin la palabra), es FALLA.
- Negative: si la barra es puramente decorativa y no proporcional, de modo que un 70 y un 40 se ven con barras iguales o casi iguales, es FALLA.
- Negative: si los puntajes dejan de caer en columna alineada y se vuelve más difícil escanearlos que antes de esta barra, es FALLA.
- Negative: con el simulador de daltonismo activado, cualquier fila que pierda información que tenía en color normal (el orden ya no se distingue, la confianza ya no se distingue) es FALLA.
- Negative: ninguna fila puede quedar sin su barra, sin su forma de confianza, o con un valor crudo de datos (undefined, NaN, un número sin formato) donde debía ir la barra.

Deferred, not this slice: whether the weakest-link callout gets its own visual treatment beyond what already ships in `recipes.css`, per feature-delta.md's DoD row 6 language about confidence "and the weakest-link callout"; this charter only examines the score bar and the confidence badge that slice-05's own steps (05-01, 05-02, 05-03) actually build. Their absence is not a failure here.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
