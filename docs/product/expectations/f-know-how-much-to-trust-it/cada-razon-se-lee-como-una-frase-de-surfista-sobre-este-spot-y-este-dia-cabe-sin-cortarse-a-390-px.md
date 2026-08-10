# La razón de cada spot suena a un surfista explicando por qué confiar en el número hoy, nunca más de lo que los datos ganaron

ID: EXP-f-know-how-much-to-trust-it-1 · Spec rows: slice-01 · Persona: Surfista que toca la palabra de confianza antes de creerle al número y decidir si vale manejar hasta la playa

## Intent
Cada fila y cada spot cuentan su propia razón, a un toque de distancia, en una sola frase en español que suena a un surfista explicando por qué confiar (o no) en el número de ese spot para ese día: que los modelos se pelean por el período, que solo respondió un modelo, o que falta un dato como la marea y por eso el nivel no puede pasar de medio. La frase nunca reclama más certeza de la que los datos ganaron: si nadie ha reportado desde esa playa, lo dice; si ese spot no tiene historial verificado, también lo dice.

## Preconditions
Este es un proyecto Node 22; todo corre por scripts de npm y un navegador. No hace falta ninguna credencial ni servicio de nube. Toda observación empieza desde el árbol real indicado abajo. Si el navegador abre otra copia, descartar esa sesión y empezar de nuevo.

1. `cd /Users/andres/psb-trust`
2. `npm ci` (solo la primera vez en esta máquina)
3. `npm run build` (el paso de publicación: toma los datos reales de esta mañana, compone la razón de cada spot y renderiza las páginas estáticas en `dist/`)
4. `npm run preview` y anotar la dirección local que muestra (normalmente `http://localhost:4321`)
5. Abrir esa dirección en una ventana de unos 390 px de ancho: la home (Hoy), la pestaña Mañana, y la página propia de dos o tres spots distintos.
6. Recorrer todo lo de arriba dos veces: una con el tema claro y el movimiento normal del sistema, y otra con el tema oscuro y "reducir movimiento" activado en el sistema operativo.

## Charter
Explorá la razón de confianza en todos lados donde aparece: filas de Hoy, filas de Mañana, y las dos secciones de día (hoy y mañana) dentro de la página de cada spot. Abrí la razón en varias filas, no en una sola, y si aparecen niveles distintos ("Confianza baja", "media" o si alguna llega a "alta") leélas todas. La prueba más filosa es la honestidad: hoy no hay ni un reporte real desde ninguna playa y ningún spot tiene historial verificado todavía, así que en cada razón que abrís preguntate "¿esto dice o insinúa que alguien confirmó desde la arena, o que este spot ya tiene puntería comprobada?". Leé cada frase como la leería un surfista: ¿suena a una persona explicando, o a jerga de repuesto? Fijate también si la palabra de nivel sigue ahí en filas donde no hay nada para abrir, y si podés distinguir un nivel de otro sin fijarte solo en el color (la palabra completa siempre tiene que estar; una forma o icono junto a ella es un plus que puede o no estar en esta versión). Por último, comparate el mismo spot en Hoy y en Mañana: cada mitad tiene que leerse como el relato de su propio día.

## Expected observations (oracle)
- U8: Cada razón se lee como una frase de surfista sobre este spot y este día, cabe sin cortarse a 390 px, y nunca reclama que alguien confirmó desde la playa.
- Toda fila, en Hoy, en Mañana y en las dos secciones de la página del spot, muestra su palabra de confianza. Lo normal del día es que tocarla abra una sola frase propia de ese spot para ese día, no una frase genérica repetida en todas partes; solo alguna fila suelta puede no traer nada para abrir, como excepción, nunca la mayoría ni todas.
- La frase se lee como algo que diría un surfista: nombra en criollo qué pasó (por ejemplo, que los modelos no coinciden en el período, que solo habló un modelo, o que falta la marea), nunca en la jerga de una hoja de cálculo.
- En un spot sin ningún reporte real todavía, la frase lo admite con claridad: dice que nadie ha reportado desde esa playa. En un spot sin historial verificado, la frase también lo admite. Ninguna de las dos cosas queda implícita ni se da por hecha en silencio.
- Cada frase cabe entera en la pantalla de 390 px sin cortarse, sin puntos suspensivos y sin desbordar el ancho; nada de la frase queda oculto por el borde de la tarjeta.
- Ninguna frase trae texto en inglés, nombres de modelos o de proveedores, códigos, fechas u horas crudas de máquina, ni guion largo.
- Una fila publicada sin razón sigue mostrando su palabra de confianza igual que sus vecinas; no desaparece el nivel solo porque falte la razón de ese día.
- La razón de Mañana en un spot se lee como el relato del propio día de mañana, no como la de Hoy con la fecha cambiada.
- Todo lo de arriba se ve terminado a 390 px, en tema claro y en tema oscuro: se lee con el brazo estirado contra el fondo real (no solo contra blanco), el objetivo para tocar es cómodo con el dedo, nada queda desalineado, cortado ni con pinta de relleno, y con movimiento reducido activado nada se mueve solo.
- Negative: si alguna razón dice o da a entender que alguien confirmó las condiciones desde la playa, es FALLA, sin importar cuán razonable suene el resto de la frase.
- Negative: si alguna razón dice o da a entender que ese spot ya tiene puntería comprobada o historial verificado, es FALLA: hoy ningún spot lo tiene.
- Negative: si ninguna fila del recorrido abre una razón, o si una razón se abre vacía, con un guion, un espacio en blanco o un "sin razón" inventado, es FALLA. La falta de razón se muestra no ofreciendo nada para abrir en esa fila puntual, nunca como una caja vacía.
- Negative: si alguna razón se corta, se trunca con puntos suspensivos o se desborda horizontalmente a 390 px, es FALLA.
- Negative: si alguna fila queda sin su palabra de confianza, aunque sea porque le falta la razón, es FALLA.
- Negative: si el nivel aparece solo como color o icono, sin la palabra completa al lado ("Confianza baja", "media" o "alta"), es FALLA.
- Negative: si aparece texto crudo (nombre de modelo, JSON, stack trace, "undefined", "NaN") en cualquier razón, es FALLA.

Si todas las filas visibles hoy leen "baja" o "media" y ninguna llega a "alta", eso es lo esperado: la marea todavía falta en la producción real y "alta" no es alcanzable hasta un slice posterior. No falles esta observación por la ausencia de "alta".

Diferido, fuera de este slice: que "alta" se vuelva alcanzable con datos reales de marea (slice-02); que la razón compare el día contra lo normal de ese spot en vez de contra un umbral fijo (slice-05); la posibilidad de apagar el factor de desacuerdo entre modelos si falla una revisión de calidad (slice-03, no tiene superficie visible propia); una segunda fuente de modelos (slice-04, no tiene superficie visible propia); cualquier porcentaje de acierto o "7 de 30" más allá de la propia mención de reportes dentro de la frase (F-SHOW-OUR-TRACK-RECORD); la mitad en inglés de la razón (F-READ-IT-IN-YOUR-LANGUAGE); la forma o icono junto a la palabra de nivel, que puede quedar fuera de esta versión sin que eso sea falla. Su ausencia no hace fallar esta observación.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
