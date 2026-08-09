# Desde la página de cualquier spot, un toque comparte el llamado de ese spot y el enlace muestra su nombre y su puntaje
ID: EXP-f-paste-the-call-into-the-group-5 · Spec rows: slice-05 · Persona: Surfista parado en la página de su spot que le avisa al grupo de ese spot

## Intent
El texto literal de la feature: un surfista toca una vez en la página de un spot, comparte el llamado de ese spot, y el enlace pegado muestra el nombre y el puntaje de ese spot. No el mejor del día: ese spot.

## Preconditions
Usar Node 22, npm y un navegador local. No usar credenciales para la parte local. Toda observación empieza desde el árbol real indicado abajo.

1. `cd /Users/andres/panama-surf`
2. Ejecutar `npm ci` solamente si las dependencias todavía no están instaladas.
3. Ejecutar `npm run build`.
4. Ejecutar `npm run preview` y abrir la página de un spot que no sea el primero del ranking, en una ventana de unos 390 px.
5. Para la prueba de WhatsApp: `node scripts/preview/publish-preview.mjs` y la dirección `https://d1j9u9fxnap4es.cloudfront.net`. Sin publicación, registrar esa parte como no ejecutada.
6. WhatsApp con un chat de prueba.

## Charter
Elegí un spot que no sea el número uno del día, para que cualquier confusión con la home salte a la vista. En su página, tocá la acción de WhatsApp y leé el mensaje: tiene que hablar de ese spot. Tocá copiar y pegá: mismo bloque. Pegá la dirección compartida en el chat de prueba y mirá la vista previa. Repetí el toque de WhatsApp con JavaScript apagado. Mirá los botones con el pulgar en mente: ¿se alcanzan parado en la playa?

## Expected observations (oracle)
- La página del spot tiene las mismas dos acciones de la home (WhatsApp y copiar), de al menos 44 px, alcanzables con el pulgar en un teléfono.
- El mensaje nombra ese spot y su puntaje, con su tamaño, su viento y su ventana. No los del mejor spot del día.
- La dirección dentro del mensaje apunta a la página de ese spot, absoluta, con `?b=` y el sello del build.
- El enlace pegado muestra la vista previa de ese spot: su nombre y su puntaje; y su tarjeta de imagen si slice-04 ya está en producción.
- Con JavaScript apagado, la acción de WhatsApp sigue funcionando como enlace normal.
- Las acciones se ven terminadas a 390 px en ambos temas, también con un nombre de spot largo: sin recorte, sin desborde horizontal, sin brincos con movimiento reducido activado.
- Negative: nunca el mensaje o la vista previa del spot equivocado; nunca los números de la home cuando el spot es otro.
- Negative: nada técnico ni en el mensaje ni en la vista previa: sin JSON, sin nombres de modelos, sin texto de relleno.

Diferido, fuera de este slice: la superficie en inglés pertenece a F-READ-IT-IN-YOUR-LANGUAGE. Si slice-04 aún no está en producción, una vista previa de solo texto con nombre y puntaje no hace fallar esta observación.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
