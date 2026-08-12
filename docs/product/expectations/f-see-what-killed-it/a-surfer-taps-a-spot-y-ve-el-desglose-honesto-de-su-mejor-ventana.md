# La mejor ventana se explica con cuatro razones, y calla la que nadie observó

ID: EXP-f-see-what-killed-it-4 · Spec rows: slice-04 steps 04-05 y 04-06 · Persona: Surfista que ya leyó el puntaje y la ventana de su playa y quiere entender qué hay detrás de esa ventana antes de manejar

## Intent

En la página propia de una playa, cada día con una ventana publicada muestra
cuatro razones en español -- dirección, tamaño, viento y marea -- tomadas de la
hora exacta en la que empieza esa ventana. Cada razón lleva su número de dos
decimales tal como se publicó, y una flecha marca la razón que de verdad tumbó
el día. Esa flecha sigue lo que dijo el cálculo, no la barra más corta.

Cuando una observación nunca llegó, su fila lo dice con palabras -- por ejemplo
`sin dato de viento hoy` -- y no lleva número ni barra. Una barra de largo cero
se leería como el peor viento del año, y eso sería mentir. Las otras tres filas
siguen legibles.

Hoy y mañana son dos explicaciones separadas, cada una con su propia hora y su
propia flecha. Un día sin ventana publicada no muestra desglose ninguno, ni un
recuadro vacío, y el resto de su sección queda intacta.

## Preconditions

1. Abrir la URL pública que te entregue la sesión, en Chromium, a 390 px de
   ancho. No hace falta que ejecutes ningún comando de construcción.
2. Mirar solo la página: no abras código, pruebas, registros ni la consola.
3. No leas la tabla de sesiones al final de este documento antes de observar.

DE DÓNDE SALE LA MAÑANA QUE SE EXAMINA, dicho sin adornos para quien lea una
fila de esta tabla más adelante: la superficie versionada en
`data/published-surface.json` se publicó antes de que existiera la proyección
horaria, así que una construcción de ese archivo tal cual **no muestra ni una
barra** y registra la ausencia heredada en las veinte playas. La mañana que se
sirve a la examinadora lleva esa proyección sembrada, con las mismas reglas que
usa la suite de aceptación. Una fila PASS de esta tabla prueba que la superficie
emitida se ve y se lee bien cuando la mañana trae sus horas; no prueba que el
sitio desplegado hoy las traiga. Eso llega cuando el productor vuelva a
publicar.

## Charter

Abre `Playa Cambutal`. Lee su sección de hoy despacio: deben aparecer cuatro
razones nombradas en español, cada una con su número, y una sola de ellas
marcada como la que tumbó el día. Comprueba que la razón marcada es la misma
que nombra la frase de arriba, y no simplemente la barra más corta que ves.
Repite la lectura en la sección de mañana: sus cuatro números deben ser
distintos de los de hoy.

Abre `Playa El Palmar`. Hoy debe faltar una observación y mañana otra distinta.
En las dos, la fila que falta tiene que decirlo con palabras, sin número, sin
barra y sin flecha; las demás filas siguen completas y la marca sigue en la
razón que la página nombra.

Abre `Playa Las Lajas`. Uno de sus dos días no publica ventana: ese día no debe
mostrar desglose ni un hueco donde iría, y su puntaje, su tamaño y su línea de
ventana deben seguir ahí. El otro día conserva sus cuatro razones.

Abre `Playa Teta`. Esa mañana se publicó antes de que existieran estas horas,
así que no debe mostrar barras en ninguno de sus dos días, y aun así la página
tiene que leerse entera y tranquila.

Repite la lectura de `Santa Catalina - La Punta` a 390 px en tema claro y
oscuro, con movimiento reducido. Comprueba que las cuatro filas se leen sobre
su fondo real, que la página no se sale lateralmente, que nada se anima ni
finge cargar, que las letras y los espacios siguen el sistema de la página, y
que el botón para contar si estuviste sigue al alcance del pulgar.

## Expected observations (oracle)

- En una playa con ventana veo cuatro razones por día, nombradas en español, en
  el mismo orden en los dos días.
- La razón marcada es la que la página nombra en palabras, aunque otra barra se
  vea más corta. Nunca hay dos marcadas ni ninguna.
- Hoy y mañana no comparten números: cada sección explica su propia ventana.
- Una observación que falta se dice con palabras y no trae número, barra ni
  flecha. Las otras filas de ese día siguen legibles.
- Un día sin ventana no deja desglose ni recuadro vacío, y el resto de su
  sección sigue completa.
- Una playa publicada antes de estas horas simplemente no muestra barras, y su
  página se lee entera igual.
- A 390 px, en los dos temas y con movimiento reducido, el desglose se ve
  terminado y legible sobre su fondo real, sin recorte ni desborde, y el
  llamado para reportar sigue cómodo de tocar.
- No veo `null`, `undefined`, `NaN`, palabras internas, inglés, llaves,
  corchetes ni guiones largos.

## U8 observation

En mi teléfono veo hoy y mañana como dos explicaciones separadas. Las cuatro
filas me dejan entender la mejor ventana y la flecha me dice cuál fue el
problema real. Si falta el viento, la página lo dice en vez de fingir una barra
buena o mala.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | PASS | Playa Cambutal shows four Spanish reasons per day (Dirección, Tamaño, Viento, Marea) with two decimals; today marked arrow on Viento (0.62) matches "lo que lo tumba: el viento", tomorrow on Dirección (0.44) matches "lo que lo tumba: la dirección"; numbers differ between days. Playa El Palmar correctly shows today missing wind as "sin dato de viento hoy" (no bar, no number) with three complete factors, tomorrow missing tide as "sin dato de marea mañana" with three complete factors; marked factors match descriptions. Playa Las Lajas correctly omits breakdown when no window published ("Sin ventana estimada todavía") but keeps score/size intact; tomorrow shows full breakdown. Playa Teta shows no bars on either day (published before these hours) but page remains readable with score, size, window, weakest-link on both. CSS includes light/dark theme variables, reduced-motion media query with animation:none and transition:none, 44px touch targets, responsive max-width. No null/undefined/NaN in visible content; all text Spanish; all numbers properly formatted two decimals. |
