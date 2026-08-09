# La tarjeta grande de arriba ES el llamado: nombra el spot y da una razón que se puede repetir de memoria
ID: EXP-daily-call-with-permanent-receipts-4 · Spec rows: slice-04 · Persona: Surfista que decide en cinco segundos y le avisa a un amigo

## Intent
Un surfista decide en cinco segundos adónde ir y puede repetirle a un amigo el destino y la razón sin volver a mirar la pantalla.

## Preconditions
Usar Node 22, npm y un navegador local. No usar credenciales ni servicios de nube. Toda observación empieza desde el árbol real indicado abajo. Si el navegador abre otra copia, descartar esa sesión y empezar de nuevo.

1. `cd /Users/andres/panama-surf`
2. Ejecutar `npm ci` solamente si las dependencias todavía no están instaladas.
3. Ejecutar `npm run build`.
4. Ejecutar `npm run preview` y anotar la dirección local que muestra, normalmente `http://localhost:4321`.
5. Abrir la home de esa dirección en una ventana de unos 390 px de ancho.

## Charter
Explorá la home como alguien que decide en cinco segundos dónde surfear. Leé una vez la tarjeta grande, mirá hacia otro lado y contale a un amigo, o anotá sin mirar, adónde ir, qué tamaño hay y por qué conviene a esa hora. Si necesitás una segunda mirada, registralo. Compará también la tarjeta con la lista de abajo. Ambas deben contar la misma historia.

## Expected observations (oracle)
- Arriba de todo hay una sola tarjeta claramente más grande que las filas compactas. Dice "VE A", nombra un spot y muestra su puntaje bien grande.
- La razón está en español de a pie. Nombra tamaño con palabras del cuerpo, viento y una ventana con hora inicial y final.
- Después de leer la tarjeta una sola vez podés decir, sin volver a mirar, adónde ir, qué tan grande está y por qué conviene ahora.
- La tarjeta cuenta la misma historia que la lista. El destino es el primer spot y el número coincide con su puntaje.
- La tarjeta se ve terminada: el puntaje se lee con el brazo estirado, es obvio de un vistazo cuál es EL llamado del día, nada está desalineado ni cortado y nada se mueve solo.
- Negative: la tarjeta no nombra un spot distinto del primer lugar ni muestra un puntaje diferente.
- Negative: la razón no contiene nombres de modelos, variables, JSON, texto de relleno ni un espacio vacío donde debía explicar por qué ir.

Diferido, fuera de este slice: la confianza y su razón en cada fila pertenecen a slice-07; la página propia del spot pertenece a slice-06. Su ausencia no hace fallar esta observación.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
