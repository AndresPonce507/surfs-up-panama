# La barra del navegador y la app instalada siguen el agua tropical que la surfista está leyendo

ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-6 · Spec rows: slice-06 / 06-01 · Persona: Surfista que abre la portada temprano desde el navegador o desde el icono instalado y espera que el teléfono se sienta como la misma costa, no como dos productos pegados.

## Preconditions

1. Desde el checkout bajo examen, instalar dependencias si hace falta y ejecutar `npm run build`.
2. Servir la publicación local con `npm run preview`.
3. Abrir la portada a 390 px con el teléfono en tema claro y después en tema oscuro.
4. Si el teléfono permite instalar el sitio, abrirlo desde el icono. Si no permite instalarlo, observar la portada en el navegador y marcar esa parte INDETERMINADA, nunca PASA por no haber podido verla.

## Charter

Sin mirar código, compará el borde superior e inferior que pinta el teléfono con la página que está
abierta. En claro, el borde debe sentirse como la misma agua clara y tranquila que rodea la lista;
no debe volver al blanco puro del diseño anterior. En oscuro, el borde debe entrar en el mismo azul
profundo de la página, sin una franja negra ajena entre el teléfono y el contenido.

Después abrí el sitio desde el icono si está disponible. Mirá el instante inicial y la página ya
lista: la entrada debe sentirse continua con la lectura clara de la portada, no como una pantalla
verde o blanca distinta que aparece antes del contenido. Recorré el ranking, abrí una playa y
volvé. No debe cambiar ningún número, palabra, destino ni acción por el arreglo del borde.

## Expected observations (oracle)

- **U8:** A 390 px, en claro y oscuro, el borde del navegador parece continuación natural del agua tropical de la página. No se siente como el blanco o negro genérico de otro producto.
- Al abrir desde el icono, la entrada clara no muestra un destello verde ni un blanco ajeno antes de la portada. Si el dispositivo no deja instalar, esta observación queda INDETERMINADA.
- La lista, los puntajes, las palabras, los enlaces y las acciones se ven y se comportan igual que antes; este arreglo solo hace coherente el marco del teléfono.
- Negative: una barra blanca junto a la portada clara tropical, una barra casi negra junto a la portada oscura, o una entrada instalada de otro color es FALLA aunque el contenido siga correcto.
- Negative: si el arreglo altera una palabra, un puntaje, una ruta, un enlace, el ancho del teléfono o el tiempo de llegada, es FALLA y está fuera de su alcance.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | PASS | A 390 px en Chromium, la superficie clara renderizó #F2F8FA (rgb(242, 248, 250)) y la oscura #061A21 (rgb(6, 26, 33)), sin marco genérico blanco/negro visible en la página. El viaje ranking → VE A Playa Cambutal → /spots/playa-cambutal/ → volver a / conservó exactamente palabras, puntajes, enlaces, acciones y ancho de 390 px en ambos temas. INDETERMINATE solo para el lanzamiento desde icono instalado y el color de la barra exterior de Chromium: esta superficie de preview no expuso ni icono/arranque instalado ni la barra externa. |
