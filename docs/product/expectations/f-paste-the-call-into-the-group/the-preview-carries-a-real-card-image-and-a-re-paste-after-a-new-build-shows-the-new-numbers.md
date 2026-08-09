# La vista previa trae una tarjeta real con el spot, el puntaje, el tamaño y la confianza, y al repegar después de un build nuevo se ven los números nuevos
ID: EXP-f-paste-the-call-into-the-group-4 · Spec rows: slice-04 · Persona: Miembro del grupo que ya vio el llamado de ayer y decide por lo que ve hoy

## Intent
La vista previa deja de ser solo texto: trae una imagen de tarjeta con el spot, el puntaje, el tamaño en palabras del cuerpo y la confianza. Y es honesta en el tiempo: pegar la dirección de un build nuevo muestra los números nuevos, nunca una tarjeta vieja vestida de fresca.

## Preconditions
Usar Node 22, npm y un navegador local. No usar credenciales para la parte local. Toda observación empieza desde el árbol real indicado abajo.

1. `cd /Users/andres/panama-surf`
2. Ejecutar `npm ci` solamente si las dependencias todavía no están instaladas.
3. Ejecutar `npm run build`.
4. Publicar la vista previa: `node scripts/preview/publish-preview.mjs` y usar `https://d1j9u9fxnap4es.cloudfront.net`. El rastreador de WhatsApp no puede leer localhost. Sin publicación, registrar la parte de WhatsApp como no ejecutada.
5. Para la prueba de frescura hacen falta dos publicaciones con sellos de build distintos (dos direcciones compartidas cuyo `?b=` difiere). Anotar los dos sellos antes de pegar.
6. WhatsApp con un chat de prueba.

## Charter
Pegá la dirección compartida en el chat de prueba y mirá la tarjeta como la vería el grupo: chiquita, en un teléfono. ¿Se lee el spot, el puntaje, el tamaño y la confianza sin ampliar? Compará los valores con la página de ese build. Después publicá un build nuevo y pegá la dirección nueva: la tarjeta tiene que contar los números nuevos. Si hay un spot al que le faltan campos, pegá su dirección también y mirá qué tarjeta sale.

## Expected observations (oracle)
- La vista previa muestra una imagen de tarjeta con el nombre del spot, su puntaje, el tamaño en palabras del cuerpo y el nivel de confianza, y todo se lee en el tamaño chico del chat.
- Los valores de la tarjeta son los del build cuya dirección se pegó. Misma historia que la página de ese build.
- Después de publicar un build nuevo, pegar la dirección nueva (su `?b=` cambió) muestra la tarjeta con los números nuevos, no la anterior.
- Si a un spot le faltan los campos de la tarjeta, la vista previa muestra la tarjeta genérica del sitio, entera y sin números inventados, y el hueco queda registrado del lado del builder, no en la cara del grupo.
- La tarjeta parece hecha a propósito: el puntaje domina, la jerarquía es clara, nada recortado ni amontonado, sin texto de relleno.
- Negative: nunca una imagen rota ni un hueco donde iba la imagen.
- Negative: nunca números viejos presentados como el llamado de hoy, ni una tarjeta con campos vacíos visibles.

Diferido, fuera de este slice: compartir desde la página del spot pertenece a slice-05; la tarjeta en inglés pertenece a F-READ-IT-IN-YOUR-LANGUAGE. La cadencia de regeneración de la tarjeta (cada build, solo el build del alba, o solo genérica) es la pre-requisite 3 del plan y se decide antes del DISTILL de este slice.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
