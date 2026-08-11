# El enlace pegado en el grupo muestra una vista previa con el nombre del spot y su puntaje, no una URL pelada
ID: EXP-f-paste-the-call-into-the-group-3 · Spec rows: slice-03 · Persona: Miembro del grupo que decide si abre el enlace por lo que ve en la vista previa

## Intent
Cuando alguien pega el enlace del llamado en WhatsApp, el grupo ve una vista previa que nombra el spot y su puntaje. El enlace deja de ser una URL pelada y se vuelve el pitch del producto dentro del grupo.

## Preconditions
Usar Node 22, npm y un navegador local. No usar credenciales para la parte local. Toda observación empieza desde el árbol real indicado abajo.

1. `cd /Users/andres/psb-paste`
2. Ejecutar `npm ci` solamente si las dependencias todavía no están instaladas.
3. Ejecutar `npm run build`.
4. Para la parte de documento: abrir `dist/index.html` con "ver código fuente" del navegador, o `npm run preview` y ver el código fuente de la home.
5. Para la prueba real de WhatsApp hace falta la vista previa publicada: `node scripts/preview/publish-preview.mjs` y la dirección `https://d1j9u9fxnap4es.cloudfront.net`. El rastreador de WhatsApp no puede leer localhost. Si no se puede publicar, registrar la parte de WhatsApp como no ejecutada, nunca adivinar el veredicto.
6. WhatsApp con un chat de prueba, por ejemplo "Mensaje a ti mismo".

## Charter
Leé la cabecera del documento de la home como quien revisa lo que WhatsApp va a leer: buscá el título y la descripción de la vista previa y compará sus valores con lo que la página muestra. Después pegá la dirección compartida (la que termina en `?b=`) en el chat de prueba y esperá la tarjeta de vista previa. Leela como un miembro del grupo que no conoce el sitio: ¿te dice adónde y cuánto, sin abrir nada?

## Expected observations (oracle)
- La cabecera del documento de la home lleva un título y una descripción para la vista previa que nombran el mejor spot del día y su puntaje, en español, con la dirección absoluta del sitio y el idioma `es_PA`.
- Pegado en WhatsApp, el enlace muestra una tarjeta de vista previa cuyo texto visible nombra el spot y su puntaje, en vez de una URL pelada.
- El spot y el puntaje de la vista previa son los del build que generó esa dirección. Misma historia que la página.
- La dirección canónica de la página no carga el parámetro `?b=`; ese parámetro vive solo en la dirección que se comparte.
- La vista previa se ve terminada: título legible, descripción completa sin cortes raros, nada de texto de relleno ni marcadores.
- Negative: la vista previa nunca nombra un spot distinto ni un puntaje distinto de los que la página de ese build muestra.
- Negative: nada técnico en el texto de la vista previa: sin JSON, sin nombres de modelos, sin campos vacíos visibles, sin inglés en la superficie en español.

Diferido, fuera de este slice: la imagen real de la tarjeta pertenece a slice-04; si la vista previa sale sin imagen, o con una imagen genérica del sitio, esta observación no falla. Compartir desde la página del spot pertenece a slice-05.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | INDETERMINATE | At 390px, light/normal and dark/reduced-motion home rendered Playa Guánico 70 with the 48px Copiar el llamado and 47px Mandar el llamado por WhatsApp actions, no horizontal clipping, and no visible overlap while scrolling. Public document metadata read Playa Guánico: 70 puntos and Playa Guánico tiene 70 puntos para hoy. with es_PA and canonical https://d1j9u9fxnap4es.cloudfront.net/; the share action carried the matching clean b= URL. WhatsApp opened its public Share on WhatsApp handoff with the matching Spanish text and URL, but no authenticated test chat or preview card was safely reachable. WhatsApp-card observation: NOT_EXECUTED; no inference. |
| 2026-08-10 | Vera, scope correction | PASS | Owned 03-03 handoff passed: the 390 px built home has no horizontal overflow; its 48px/47px actions are intact; and its Spanish `og:title`, `og:description`, absolute `og:url`, `og:locale=es_PA`, and clean canonical address name the same Playa Guánico 70 call. The authenticated WhatsApp-card observation remains `NOT_EXECUTED`, with no inference, under [the external-verification boundary](../../../feature/f-paste-the-call-into-the-group/deliver/03-03-whatsapp-preview-external-verification.md). |
