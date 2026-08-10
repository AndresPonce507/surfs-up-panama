# Un toque en la home y WhatsApp se abre con el llamado del día ya escrito, listo para mandar al grupo
ID: EXP-f-paste-the-call-into-the-group-1 · Spec rows: slice-01 · Persona: Surfista que quiere avisarle al grupo antes de salir de casa

## Intent
Un surfista en la home toca una sola vez, WhatsApp se abre con el llamado del día ya escrito en español (fecha, spot ganador, puntaje, tamaño, viento, ventana, confianza y enlace), elige el chat y manda. Funciona igual con JavaScript apagado.

## Preconditions
Usar Node 22, npm y un navegador local. No usar credenciales ni servicios de nube. Toda observación empieza desde el árbol real indicado abajo. Si el navegador abre otra copia, descartar esa sesión y empezar de nuevo.

1. `cd /Users/andres/panama-surf`
2. Ejecutar `npm ci` solamente si las dependencias todavía no están instaladas.
3. Ejecutar `npm run build`.
4. Ejecutar `npm run preview` y anotar la dirección local que muestra, normalmente `http://localhost:4321`.
5. Abrir la home de esa dirección en una ventana de unos 390 px de ancho.
6. Para el toque real hace falta un WhatsApp con un chat de prueba, por ejemplo "Mensaje a ti mismo". Si no hay WhatsApp disponible, observar el texto del enlace igual y registrar esa parte como no ejecutada.

## Charter
Explorá la home como alguien que quiere avisarle al grupo antes de manejar. Encontrá la acción de WhatsApp en la tarjeta grande. Tocala una vez y leé lo que aparece ya escrito en el chat. Compará ese mensaje con lo que dice la tarjeta. Después apagá JavaScript en el navegador, recargá, y repetí el toque: tiene que seguir funcionando como enlace normal. Probá también en tema oscuro y con movimiento reducido activado en el sistema.

## Expected observations (oracle)
- En la tarjeta grande de arriba hay una acción de WhatsApp que se toca una sola vez, sin pasos intermedios, y mide al menos 44 px de alto y ancho.
- Al tocarla, WhatsApp se abre con el mensaje completo ya escrito: SURF y la fecha, "Mejor:" con el spot y su puntaje, el tamaño y el viento, la ventana con hora inicial y final, "Confianza" con el nivel, y una dirección completa que empieza con `https://` y termina en `?b=` con el sello del build.
- El destino y el puntaje del mensaje son exactamente los de la tarjeta grande. El mensaje y la página cuentan la misma historia.
- El mensaje está en español de a pie: sin nombres de modelos, sin campos técnicos, sin corchetes, sin texto de relleno.
- Con JavaScript apagado el botón sigue funcionando como enlace normal y el mensaje es el mismo.
- La tarjeta con la acción se ve terminada a 390 px en tema claro y en tema oscuro: nada cortado, nada desalineado, el botón se lee contra el fondo real sin depender solo del color, y nada se mueve solo con movimiento reducido activado.
- Negative: la dirección dentro del mensaje nunca es relativa ni apunta a localhost; es la dirección pública configurada del sitio.
- Negative: el mensaje nunca muestra un spot o un puntaje distintos de los que la página muestra en ese momento.

Diferido, fuera de este slice: copiar al portapapeles pertenece a slice-02; que el enlace pegado muestre una vista previa pertenece a slice-03 y slice-04; compartir desde la página del spot pertenece a slice-05. Que el enlace pegado se vea como URL cruda sin vista previa no hace fallar esta observación.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | FAIL | WhatsApp action correct: 1 share-whatsapp anchor in the top card, wa.me text decodes to "SURF 10 de agosto / Mejor: Playa Guánico, 70 / Cintura a pecho y limpio. Mejor de 13:00 a 16:00. / Confianza baja. / https://d1j9u9fxnap4es.cloudfront.net/?b=b_2026-08-10T12Z", matches card's spot/score/confidence exactly, public https address ending in ?b=<build stamp>, no brackets/model names. Page has 0 <script> tags; href byte-identical with javaScriptEnabled:false. 390px light+dark: scrollWidth==clientWidth==390, target 324x46.9px (>=44px). Reduced-motion CSS disables all animation/transition. FAIL cause: home page header renders a raw machine timestamp "Actualizado 2026-08-10T12:05:00.000Z" directly above the big card in the same 390px view explored per the charter's own Charter step, a defect on the Spanish surface (task brief: any raw timestamp is a defect). |
