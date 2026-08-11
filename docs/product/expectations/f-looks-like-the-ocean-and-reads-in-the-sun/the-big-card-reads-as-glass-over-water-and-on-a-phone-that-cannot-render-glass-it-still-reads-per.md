# La bandeja para reportar se ve como vidrio esmerilado flotando sobre el agua tropical del fondo, y en un teléfono que no puede pintar vidrio se sigue leyendo igual de bien como tarjeta sólida
ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-2 · Spec rows: slice-02 · Persona: Surfista leyendo el sitio afuera, con el sol de frente, en un Android barato que a veces se niega a pintar vidrio

## Intent
Slice-01 cambió el fondo de la página a agua tropical profunda. Eso es lo que por fin le da algo
real al vidrio esmerilado para desenfocar: el efecto ya estaba en el código, pero desenfocar casi
blanco sobre casi blanco no mostraba nada. Ahora sí hay algo detrás que se ve.

Pero ese vidrio tiene un costo real de GPU en los teléfonos Android baratos que usa esta audiencia,
y algunos aparatos o configuraciones lo rechazan directamente. Por eso el diseño real no es el
vidrio: es la tarjeta sólida de abajo. El vidrio es la mejora que se agrega encima cuando el
aparato la puede pagar, nunca la capa de la que depende poder leer. Esta carta solo se cierra
cuando las dos versiones, con vidrio y sin vidrio, se leen igual de bien.

La única superficie de vidrio que llega a una página construida hoy es la bandeja con el botón de
reportar, abajo y fija en la zona del pulgar. La regla CSS `.lang-toggle` no tiene marcado todavía:
su píldora le pertenece a F-READ-IT-IN-YOUR-LANGUAGE y esta carta no la inventa. La tarjeta grande
del primer spot, la que lleva el número que se lee a pleno sol, se queda con el degradado sólido de
agua tropical a propósito y nunca se vuelve vidrio; si en algún momento se ve esmerilada, eso es
una falla de diseño, no una mejora.

## Preconditions
Proyecto Node 22; todo corre con npm y un navegador. Cada observación arranca desde el árbol real
indicado abajo.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (solo la primera vez en esta máquina)
3. `npm run build`
4. `npm run preview` y anotar la dirección local que imprime (normalmente `http://localhost:4321`)
5. Abrir la home en una ventana de ancho de teléfono (unos 390 px), y repetir el recorrido en tema
   claro y en tema oscuro. Si hay tiempo, repetir también a 320 px de ancho, el piso más angosto
   que este diseño promete sostener.
6. Hay que forzar dos estados, uno por vez, y comparar:
   - **Vidrio soportado (el estado por defecto):** abrir la página tal cual, sin tocar nada. Así
     abre hoy cualquier navegador moderno.
   - **Vidrio apagado (el estado de un teléfono que no puede o no quiere pintar vidrio):**
     forzarlo por cualquiera de estos dos caminos, el que tengas a mano:
     - En el sistema: Mac, Preferencias/Configuración del Sistema → Accesibilidad → Pantalla →
       "Reducir transparencia" en ON; Windows, Configuración → Accesibilidad → Efectos visuales →
       "Efectos de transparencia" en OFF. Después recargar la página.
     - Si tu sistema no tiene esa opción o el navegador no la respeta: abrir las herramientas de
       desarrollo (clic derecho sobre la página → Inspeccionar), buscar la pestaña "Rendering"
       (si no aparece, abrir el menú "⋮" → "More tools" → "Rendering"), y ahí poner "Emulate CSS
       media feature prefers-reduced-transparency" en "reduce". Recargar la página.
     Para volver al estado con vidrio, apagar esa misma preferencia y recargar.

Si ninguno de los dos caminos está disponible en tu equipo, el veredicto es INDETERMINADO con esa
observación anotada, nunca un PASA por no haber podido mirar.

## Charter
Explorá la bandeja de reportar en los dos estados (vidrio soportado, vidrio apagado) y en los dos
temas. Con vidrio soportado, revisá si de verdad se ve como cristal esmerilado flotando sobre lo que
se desplaza debajo, no como un color plano pintado encima; scrolleá la página con la bandeja fija en
pantalla para ver si el contenido que pasa detrás realmente se nota a través. Con vidrio apagado,
revisá si esa bandeja sigue leyéndose como tarjeta sólida hecha a propósito, nunca como algo roto o
a medio cargar.

Después mirá el resto de la home: la tarjeta grande del primer spot tiene que seguir siendo el
mismo fondo sólido de agua tropical en los dos estados, nunca vidrio. Si en algún momento se ve
esmerilada, anotalo como contradicción del diseño, no como una mejora.

Leé cada palabra de la bandeja y de su botón, en los dos estados, en los dos temas, con el brazo estirado, y
si podés, bajo luz fuerte. Probá también con el texto de mayor contenido detrás de la tira (la
parte más oscura o más cargada de lo que se desplaza) para no evaluar la lectura solo cuando el
fondo de casualidad ayuda.

## Expected observations (oracle)
- Con la transparencia reducida activada en el teléfono, la píldora de idioma y la barra de reportar se ven como tarjetas sólidas y legibles, sin ningún borde raro ni texto perdido, sobre el nuevo fondo azul-verde.
- **U8 (vidrio apagado, 02-01):** Con la transparencia reducida activada en el teléfono, la barra de reportar se ve como una tarjeta sólida y legible, sin ningún borde raro ni texto perdido, sobre el nuevo fondo azul-verde.
- **U8 (vidrio soportado, 02-02):** Con el navegador soportando vidrio, veo la barra de reportar como cristal esmerilado flotando sobre el contenido que se desplaza debajo, y el texto sigue leyéndose perfecto en los dos temas.
- **U8 (los dos estados juntos, 02-03):** Recorro el sitio con y sin vidrio soportado, en los dos temas: la barra de reportar siempre se lee, nunca desaparece ni pierde contraste, y nada más en el sitio cambió.
- La tarjeta grande del primer spot se ve exactamente igual en los dos estados de vidrio: el mismo
  degradado sólido de agua tropical, nunca esmerilada. Si alguna vez se ve traslúcida, es una
  contradicción del diseño que hay que anotar, no una mejora.
- El texto de las dos tiras se lee igual de bien cuando el contenido detrás está en su parte más
  oscura o más cargada que cuando está en su parte más clara; nunca hay un momento en que cueste
  leer y otro en que no.
- A 390 px y, si hubo tiempo, a 320 px, en los dos temas, nada se corta, nada se monta encima de
  otra cosa, y no aparece scroll horizontal.
- Con movimiento reducido activado en el sistema, nada en la píldora ni en la bandeja se anima ni
  brinca al cambiar de estado de vidrio.
- Negative: un texto que se lee bien solo porque el vidrio, de casualidad, oscureció lo que había
  detrás en ese momento, y deja de leerse bien apenas cambia el contenido que pasa debajo, es FALLA.
- Negative: el estado sin vidrio no puede parecer un error de carga, un recuadro roto ni un botón
  fantasma. Si se ve como si algo hubiera fallado, es FALLA aunque técnicamente el texto se lea.
- Negative: si la tarjeta grande del primer spot aparece esmerilada o translúcida en cualquier
  estado o tema, es FALLA: esa tarjeta es la que se lee a pleno sol y el diseño la deja sólida a
  propósito.
- Negative: ningún otro número, texto o comportamiento del sitio cambia entre esta carta y la de
  slice-01. Si algo más se movió, no forma parte de este slice y hay que anotarlo aparte.

Diferido, fuera de este slice: que el detalle del spot, ayer, el 404 y las pantallas de reporte
sigan exactamente esta misma disciplina de vidrio y respaldo sólido es slice-03; la reescritura de
la tabla de contraste del documento de diseño es slice-04. Su ausencia no hace fallar esta carta.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | FAIL | En la home construida a 390 px y 320 px, claro y oscuro, la CTA fija “Ver el llamado” siguió completa, legible y sin scroll horizontal con transparencia reducida; el modo reducido confirmó fondo sólido y `filter`/`backdrop-filter` en `none`. Pero en el modo normal también se observó la misma bandeja sólida, sin efecto de vidrio esmerilado ni contenido visible a través al desplazarse; el estado soportado incumple U8 02-02. La tarjeta grande del primer spot se mantuvo sólida. |
| 2026-08-11 | Vera | FAIL | En http://127.0.0.1:43933/ a 390 px y 320 px, claro y oscuro, con vidrio normal y con transparencia/movimiento reducidos, la bandeja “Ver el llamado” y su texto fueron legibles y el respaldo reducido se vio como tarjeta verde sólida intencional; la tarjeta grande del primer spot siguió sólida y no vi corte ni scroll horizontal en las vistas iniciales. Pero en modo normal la bandeja se vio verde opaca, sin contenido reconocible pasando a través ni apariencia de cristal esmerilado. Además, al desplazar la lista, la bandeja salió de pantalla: a 390 px desapareció y a 320 px quedó apenas una franja verde. Eso incumple U8 02-02 y 02-03: no permanece fija ni siempre visible/legible. |
| 2026-08-11 | Vera | FAIL | En http://127.0.0.1:43933/ a 390 px y 320 px, con esquema claro y oscuro, recorrí la home en modo normal y también con transparencia y movimiento reducidos. En cada recorrido el enlace de bandeja “Ver el llamado” dejó de estar visible al desplazar el contenido (a 390 px queda como mucho una línea tenue en el borde; a 320 px no queda texto ni botón); por lo tanto no permanece fijo ni se puede leer sobre contenido cargado. Tampoco se pudo observar una bandeja de cristal esmerilado en el estado normal, ni un respaldo sólido legible durante el desplazamiento con transparencia reducida. La tarjeta grande inicial sí se mantuvo sólida, y no apareció desplazamiento horizontal. |
| 2026-08-11 | Vera | FAIL | En http://127.0.0.1:43933/ a 390 px y 320 px, claro y oscuro, con vidrio normal y con `prefers-reduced-transparency: reduce`, “Ver el llamado” se leyó completo al inicio; en modo normal la banda azul se leyó como vidrio sobre el agua y el respaldo reducido se vio intencional y legible. La tarjeta grande de Playa Cambutal se mantuvo sólida y no observé desborde horizontal. Pero después de desplazar la lista hasta las filas 6–10, la bandeja dejó de mostrar texto y botón en cada estado, quedando solo una franja en el borde inferior o desapareciendo. Incumple U8 02-02 y 02-03: no permanece fija ni legible sobre el contenido que pasa. |
| 2026-08-11 | Vera | PASS | En `http://127.0.0.1:43933/`, a 390 px y 320 px, claro y oscuro, la bandeja “Ver el llamado” permaneció fija durante el scroll. Con vidrio soportado se vio un marco azul-verde de agua y vidrio alrededor de la acción sólida; con transparencia reducida se vio una bandeja opaca distinta del fondo de la página, sólida y legible. No hubo desborde horizontal, la tarjeta grande del primer spot siguió sólida y el movimiento reducido se mantuvo calmo. |
