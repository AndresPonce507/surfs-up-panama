# Cuatro razones claras explican la mejor ventana sin fingir un dato ausente

ID: EXP-f-see-what-killed-it-4 · Spec rows: Slice-04 steps 04-05, 04-06 · Persona: Surfista que ya lee la llamada y quiere saber qué sostiene o limita su mejor ventana.

## Charter

En un teléfono de 390 px abre una playa con datos para hoy y mañana. En cada
día, encuentra cuatro filas: dirección, tamaño, viento y marea. Lee la flecha
y las palabras, no el color, para saber qué fue lo más débil. Si una fila dice
que falta el viento, debe decirlo en palabras, sin cifra ni barra que parezca
buena o mala. Si el día no tiene ventana, no debe quedar una caja vacía.

Repite en tema claro y oscuro, con movimiento reducido. Comprueba que el texto
contrasta con su fondo real, nada se corta lateralmente, la llamada para
reportar sigue alcanzable y no aparece un cargador ni una explicación técnica.

## Expected observations

- Cada día muestra sus propias cuatro razones de la hora que explica su ventana.
- La flecha nombra el punto débil publicado aunque otra barra sea menor.
- Un dato ausente se entiende como ausencia, nunca como cero ni buen estado.
- La lectura se conserva a 390 px en ambos temas, con movimiento reducido.

## U8 observation

En mi teléfono veo hoy y mañana como dos explicaciones separadas. Las cuatro filas me dejan entender la mejor ventana y la flecha me dice cuál fue el problema real. Si falta el viento, la página lo dice en vez de fingir una barra buena o mala.

## Session log

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | DISTILL | NOT_RUN | Armed as a source-blind charter; implementation is intentionally absent. |
