# El mapa de mi playa me dice dónde queda el break y hacia dónde mira

ID: EXP-f-see-what-killed-it-5 · Spec rows: slice-05 steps 05-04, 05-05, 05-06 · Persona: Surfista que ya está leyendo su playa y quiere ubicar la rompiente y su orientación sin salir de la página

Authored 2026-08-11 at JIT DISTILL entry for slice-05, together with the
feature scenarios, steps and fixture that step 05-06 owns. The three visible
steps of this slice declare this file as their `charter_path` and it did not
exist; the content below is the roadmap's own `u8_observation` per step,
expanded into an executable charter.

## Intent

Al abrir su playa, el surfista ve un diagrama pequeño y quieto: un punto que
marca el break y una flecha que sale de ese punto hacia donde la playa mira,
con el norte arriba. Es parte de la ficha de la playa, no una página cargando
encima. No hay un mapa que se arrastre, no hay que arrastrarlo con el dedo, no
aparece un mosaico que tarda, y no hace falta una leyenda para entenderlo.

Debajo del diagrama hay una línea corta que dice de dónde salió la ubicación y
de dónde salió la orientación. Se lee como el crédito normal de una imagen, no
como una nota técnica.

X11 aceptó este camino a propósito: el diagrama es de orientación solamente. No
dibuja ni insinúa una costa, una foto de satélite, una calle ni una precisión
mayor que la que la semilla citada respalda. Dos playas de lanzamiento no
tienen ninguna fuente que diga hacia dónde miran, y por eso no reciben ningún
mapa. Una flecha inventada sería peor que ningún mapa.

Sin señal, el espacio del mapa no se cae: queda un cuadro tranquilo del mismo
tamaño con una frase en español que explica qué debía verse ahí.

## Preconditions

1. Desde el árbol bajo prueba, ejecutar `npm run build`.
2. Servir la carpeta `dist/` emitida y abrir la dirección local.
3. Usar una ventana de teléfono de unos 390 px de ancho.

## Charter

Entra a Playa Venao. Busca el diagrama dentro de la ficha de la playa. Sin leer
ninguna leyenda, di en voz alta dónde está el break y hacia dónde mira. Si
tienes que adivinar o buscar una explicación, es una falla.

Lee la línea de crédito debajo. Debe sonar como el crédito de una foto. Si
parece un registro de programador, una dirección web cruda o una lista de
grados, es una falla.

Corta la descarga de la imagen (bloquea las peticiones a `/maps/` o abre la
página sin señal) y vuelve a cargar. El cuadro debe quedarse donde estaba, del
mismo tamaño, con texto legible que explique qué debía verse. Nada de rueda
girando, nada de salto, nada de icono roto solo.

Repite en tema claro y en tema oscuro, con movimiento reducido. Termina en
Santa Catalina - La Punta, el nombre más largo, a 390 px.

Entra por último a Playa La Barqueta, que no tiene mapa. La página no debe
mostrar un recuadro vacío, un crédito huérfano ni un hueco donde iría el mapa.

## Expected observations (oracle)

- El diagrama aparece una sola vez y se siente parte de la ficha de la playa.
- Se entiende dónde está el break y hacia dónde mira sin leyenda.
- El crédito se lee como el crédito de una imagen, en español.
- El mapa llega tarde: no retrasa la lectura de la página.
- Sin la imagen, queda un cuadro del mismo tamaño con texto legible que explica
  qué debía verse ahí, y el crédito sigue debajo.
- Nada desborda a 390 px, tampoco con el nombre de playa más largo.
- El botón para contar si estuviste sigue a la mano y del mismo tamaño.
- En tema claro y oscuro el crédito y el texto del cuadro se leen cómodos.
- Con movimiento reducido nada se anima.
- La playa sin fuente de orientación no muestra ningún mapa, y su página no
  parece rota por eso.
- Negative: jamás aparece una dirección web, un nombre de archivo, grados
  crudos, `null`, `undefined`, palabras en inglés ni un guión largo cerca del
  mapa. Jamás se pide un mosaico, una biblioteca de mapas ni nada fuera del
  sitio.

Deferred, not this slice: la política de caché del trabajador sin señal (X12,
propiedad de F-WORKS-WITH-NO-SIGNAL). La ausencia de caché no es una falla
aquí; la degradación nativa del cuadro reservado sí se comprueba.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | PASS | Fresh source-blind examination of the emitted `dist/` over HTTP at 390 px. Playa Venao: the diagram sits inside the beach card with the compass N, the dot marking the break and the arrow showing its facing; the caption reads "Diagrama de orientación. Ubicación: colaboradores de OpenStreetMap. Orientación: surf-forecast.com." With images blocked, a calm grey-blue box holds the same 320x180 shape and shows the Spanish alt sentence "Diagrama de orientación de Playa Venao. El punto marca el break y la flecha señala hacia dónde mira, con el norte arriba.", with the caption still below it. Dark theme readable. Santa Catalina - La Punta wraps with no horizontal overflow. Playa La Barqueta shows no map figure, no orphaned caption and no gap. No raw coordinates, degree symbols, URLs or English near the map. Her summary: "A surfer on a phone gets a finished, polished experience." |
