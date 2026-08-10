# Cada página de playa conserva el mismo agua tropical de la portada

ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-3 · Spec rows: slice-03 / 03-01 · Persona: surfista que abre una playa concreta antes de manejar, y vuelve al recibo de ayer para comparar lo que pasó

## Intent

Una persona abre Playa Venao para decidir si sale hoy, mira el llamado de mañana y después revisa
el recibo de ayer. No debería sentir que cada ruta fue hecha por un producto distinto: las tres
lecturas mantienen el azul-verde tropical de la portada y siguen siendo cómodas de leer bajo el
sol. La identidad visual no borra ni cambia el número, el tamaño, la ventana ni los enlaces que
la persona necesita para tomar esa decisión.

## Preconditions

1. Desde el árbol bajo prueba, ejecutar `npm run build` y servir `dist/` en `127.0.0.1`.
2. Abrir `http://127.0.0.1:<puerto>/spots/playa-venao.html` a aproximadamente 390 px de ancho.
3. Abrir también `http://127.0.0.1:<puerto>/spots/playa-venao/ayer.html`.
4. Repetir ambas páginas en tema claro y oscuro, con movimiento reducido activado en la última
   pasada. Si no hay un recibo de ayer, observar el mensaje honesto que ocupa su lugar.

## Charter

Recorré la página de Playa Venao como alguien que quiere decidir sin perder tiempo: leé el
llamado de hoy, el de mañana, el tamaño y la ventana, seguí el enlace para volver a la lista y
fijate si la acción de contar lo que viste sigue siendo fácil de alcanzar. Después abrí el recibo
de ayer. Compará las dos pantallas en claro y oscuro: deberían sentirse como la misma costa y el
mismo producto, no como una portada nueva pegada a páginas viejas. Probá a leer los párrafos con
el brazo estirado y reducí el movimiento antes de terminar. Mirá los bordes, los nombres y los
controles a ancho de teléfono para detectar algo que se corte, se superponga o aparezca a medio
cargar.

## Expected observations (oracle)

- Abro la página de Playa Venao y su recibo de ayer a 390 px, en los dos temas: se ven exactamente con el mismo azul-verde de agua tropical que la portada, y todos los números de hoy y de mañana siguen ahí sin cambiar.
- La página de Playa Venao muestra con claridad el llamado de hoy y mañana, el tamaño y la ventana; el recibo de ayer muestra su lectura o explica honestamente si todavía no existe.
- Los enlaces y la acción de reportar siguen siendo fáciles de encontrar y tocar. Ninguna pantalla se sale del teléfono ni llega en blanco.
- Con movimiento reducido activado, cambiar entre esas lecturas no introduce un efecto que distraiga.
- Negative: si Playa Venao o ayer vuelven al blanco/gris anterior, o se ven como una aplicación distinta de la portada, es FALLA aunque las palabras sigan presentes.
- Negative: si el repintado pierde un número, cambia el tamaño, la ventana o un enlace de salida, es FALLA. La identidad visual no autoriza cambiar la llamada.
- Negative: si una palabra se ve bien en escritorio pero se pierde con luz fuerte, si un control queda pequeño, o si algo se corta a 390 px, es FALLA.

Diferido, fuera de 03-01: el 404 y las dos pantallas de reportar son 03-02; el recorrido completo de
las seis superficies es 03-03. Su ausencia no hace fallar esta observación inicial.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | INDETERMINATE | `npm run build` completed and the locally served Playa Venao URL answered over HTTP, but the only available public browser returned `net::ERR_CONNECTION_REFUSED` for `http://127.0.0.1:4173/spots/playa-venao.html`; the in-app browser was unavailable. Therefore I could not render or interact with either required route at 390 px, in either theme, or with reduced motion. |
| 2026-08-10 | Vera | PASS | Built and served locally, then rendered `/spots/playa-venao.html` and `/spots/playa-venao/ayer.html` in Chromium at exactly 390 px in light, dark, and dark with reduced motion. Both routes shared the pale tropical-water and deep-teal palette seen on the public home page, with no horizontal overflow. Playa Venao showed Hoy 49, Rodilla a cintura ≈0.4–0.7 m, Ventana 13:00–16:00, and Mañana 68, Cintura a pecho ≈0.7–1.1 m, Ventana 13:00–16:00; its 119×44 back link reached the list and its 358×48 report action was plainly reachable. Ayer showed its honest receipt: 80 puntos, Cintura a pecho y limpio temprano, published 6:22 a.m. No running animations were exposed while reduced motion was active. |
