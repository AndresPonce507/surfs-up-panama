# Cada página de playa conserva el mismo agua tropical de la portada

ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-3 · Spec rows: slice-03 / 03-01, 03-02, 03-03 · Persona: surfista que abre una playa concreta antes de manejar, vuelve al recibo de ayer para comparar lo que pasó, y necesita una salida clara si escribió mal la dirección o quiere contar lo que vio

## Intent

Una persona abre Playa Venao para decidir si sale hoy, mira el llamado de mañana y después revisa
el recibo de ayer. También puede escribir mal una dirección o abrir la pantalla para contar lo que
vio. No debería sentir que cada ruta fue hecha por un producto distinto: todas mantienen el
azul-verde tropical de la portada y siguen siendo cómodas de leer bajo el sol. La identidad visual
no borra ni cambia el número, el tamaño, la ventana ni los enlaces que la persona necesita para
tomar esa decisión, y contar lo visto no adelanta la llamada antes de que la persona dé su propia
lectura.

## Preconditions

1. Desde el árbol bajo prueba, ejecutar `npm run build` y servir `dist/` en `127.0.0.1`.
2. Abrir `http://127.0.0.1:<puerto>/spots/playa-venao.html` a aproximadamente 390 px de ancho.
3. Abrir también `http://127.0.0.1:<puerto>/spots/playa-venao/ayer.html`.
4. Abrir una dirección de playa inexistente, y las pantallas para reportar y para ver el resultado
   de un reporte de Playa Venao.
5. Repetir todas las páginas en tema claro y oscuro, con movimiento reducido activado en la última
   pasada. Si no hay un recibo de ayer, observar el mensaje honesto que ocupa su lugar.
6. Para el cierre, recorrer cada documento publicado de playa, ayer, mañana, reportar, reportado y
   dirección desconocida. Anotar la cantidad realmente abierta; cero pantallas no es una pasada.

## Charter

Recorré la página de Playa Venao como alguien que quiere decidir sin perder tiempo: leé el
llamado de hoy, el de mañana, el tamaño y la ventana, seguí el enlace para volver a la lista y
fijate si la acción de contar lo que viste sigue siendo fácil de alcanzar. Después abrí el recibo
de ayer. Compará las dos pantallas en claro y oscuro: deberían sentirse como la misma costa y el
mismo producto, no como una portada nueva pegada a páginas viejas. Probá a leer los párrafos con
el brazo estirado y reducí el movimiento antes de terminar. Mirá los bordes, los nombres y los
controles a ancho de teléfono para detectar algo que se corte, se superponga o aparezca a medio
cargar. Ahora escribí mal el nombre de una playa y abrí las dos pantallas para reportar. Las tres
deben explicar dónde estás o qué podés hacer, conservar la misma costa visual y no mostrar ningún
número, tamaño, viento o llamado antes de que hayas contado lo tuyo. En el formulario, elegí una
opción: la marca de selección debe ser clara incluso si el color no te ayuda, y la acción que aún
no se puede usar debe seguir siendo legible.

## Expected observations (oracle)

- Abro la página de Playa Venao y su recibo de ayer a 390 px, en los dos temas: se ven exactamente con el mismo azul-verde de agua tropical que la portada, y todos los números de hoy y de mañana siguen ahí sin cambiar.
- La página de Playa Venao muestra con claridad el llamado de hoy y mañana, el tamaño y la ventana; el recibo de ayer muestra su lectura o explica honestamente si todavía no existe.
- Los enlaces y la acción de reportar siguen siendo fáciles de encontrar y tocar. Ninguna pantalla se sale del teléfono ni llega en blanco.
- Con movimiento reducido activado, cambiar entre esas lecturas no introduce un efecto que distraiga.
- Negative: si Playa Venao o ayer vuelven al blanco/gris anterior, o se ven como una aplicación distinta de la portada, es FALLA aunque las palabras sigan presentes.
- Negative: si el repintado pierde un número, cambia el tamaño, la ventana o un enlace de salida, es FALLA. La identidad visual no autoriza cambiar la llamada.
- Negative: si una palabra se ve bien en escritorio pero se pierde con luz fuerte, si un control queda pequeño, o si algo se corta a 390 px, es FALLA.
- Escribo mal el nombre de una playa y abro la pantalla de reportar de otra: las tres se ven con el mismo azul-verde tropical, el formulario de reportar no muestra ningún número del pronóstico, y nada se ve roto ni en blanco.
- La página de una playa inexistente explica en español qué pasó y ofrece volver a la lista; no llega una página de error cruda ni vacía.
- Al elegir una respuesta para reportar, la selección se entiende por su marca y su tarjeta, no solo por color; la acción todavía inactiva sigue siendo visible y legible.
- Negative: si una pantalla para reportar adelanta un número, tamaño, viento o llamado antes de recibir la lectura de la persona, es FALLA.
- Negative: si la dirección inexistente muestra palabras técnicas, un error crudo o una página en blanco, es FALLA.
- El recorrido final nombra cuántas pantallas de playa, ayer, mañana, reportar, reportado y dirección desconocida abrió. Cada familia de playa tiene sus cuatro pantallas, y una sola pantalla sin revisar es FALLA.
- Negative: si el recorrido dice que todo está bien después de abrir cero pantallas, es FALLA. Si una pantalla publicada pierde la paleta, llega vacía, se sale del teléfono o deja texto sin contraste, es FALLA con el nombre de esa pantalla.

El recorrido completo de las seis superficies es el cierre 03-03. Se hace sobre documentos
publicados y se deja que el sitio nombre su propia población, no una muestra elegida de playas.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | INDETERMINATE | `npm run build` completed and the locally served Playa Venao URL answered over HTTP, but the only available public browser returned `net::ERR_CONNECTION_REFUSED` for `http://127.0.0.1:4173/spots/playa-venao.html`; the in-app browser was unavailable. Therefore I could not render or interact with either required route at 390 px, in either theme, or with reduced motion. |
| 2026-08-10 | Vera | PASS | Built and served locally, then rendered `/spots/playa-venao.html` and `/spots/playa-venao/ayer.html` in Chromium at exactly 390 px in light, dark, and dark with reduced motion. Both routes shared the pale tropical-water and deep-teal palette seen on the public home page, with no horizontal overflow. Playa Venao showed Hoy 49, Rodilla a cintura ≈0.4–0.7 m, Ventana 13:00–16:00, and Mañana 68, Cintura a pecho ≈0.7–1.1 m, Ventana 13:00–16:00; its 119×44 back link reached the list and its 358×48 report action was plainly reachable. Ayer showed its honest receipt: 80 puntos, Cintura a pecho y limpio temprano, published 6:22 a.m. No running animations were exposed while reduced motion was active. |
| 2026-08-10 | Vera | PASS | At 390 px, I opened the public directory plus all 82 charter documents: 20 beach pages, 20 ayer, 20 reportar, 20 reportado, mañana, and an unknown beach address. The dark and light sweeps, then a dark reduced-motion sweep, loaded all 83 pages with visible Spanish content, one continuous tropical-water palette, and no horizontal escape. Playa Venao kept Hoy 49 and Mañana 68 with size, window, list link, and report action; ayer gave its honest receipt. The report form exposed no forecast, made the selected radio/card obvious, and left Mandar visible but disabled after only one answer. The unknown address explained the problem in Spanish and offered the list. With reduced motion, Playa Venao's final rendered frame did not change over 750 ms. It feels like one calm, readable coastal product rather than separate screens. |
