# La surfista elige claro u oscuro sin perder la lectura

ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-7 · Spec rows: slice-07 / 07-01 · Persona: Surfista que abre el pronóstico al amanecer, con el teléfono en oscuro, y necesita leer de inmediato sin que el sitio adivine por ella.

## Preconditions

1. Desde el checkout bajo examen, ejecutar `npm run build` y servir la publicación local.
2. Examinar a 390 px y 320 px, y también en un escritorio; repetir en Chromium y Safari/WebKit cuando estén disponibles.
3. Empezar una vez con el teléfono en claro y otra con el teléfono en oscuro, sin una elección anterior; después elegir ambos modos y recargar.
4. Repetir la lectura con JavaScript apagado y visitar rutas españolas e inglesas.

## Charter

Sin mirar código, abrí el sitio con el teléfono en oscuro pero sin haber elegido nada. La primera
lectura debe ser claramente clara y sentirse estable, no oscurecerse o aclararse delante de tus
ojos. El botón arriba a la izquierda debe ser fácil de tocar, decir qué modo va a activar y no
interrumpir el título. Elegí oscuro, recorré la portada, mañana y una playa, pasá a su ruta en
inglés y recargá: la elección debe acompañarte. Volvé a claro y repetí.

Apagá JavaScript y abrí otra vez la portada y una playa con el teléfono en oscuro. La lectura debe
seguir siendo clara, completa y legible. No juzgues por el código, sino por si cada página se
siente terminada, con el mismo orden, contraste y calma de siempre.

## Expected observations (oracle)

- **U8:** En teléfono y escritorio, la primera visita se siente deliberadamente clara aun con el teléfono oscuro; el control arriba a la izquierda se siente parte de la navegación, no un parche, y elegir un modo nunca produce un destello de la otra paleta.
- El objetivo mide al menos 44 px. En español anuncia “Activar modo oscuro” o “Activar modo claro”; en inglés anuncia “Switch to dark mode” o “Switch to light mode”.
- La elección persiste tras recargar y al cruzar toda ruta española e inglesa. El borde del navegador acompaña el fondo de lectura elegido.
- Con JavaScript apagado no hay control funcional, pero la lectura llega clara, completa y con contraste suficiente aunque el teléfono prefiera oscuro.
- Negative: tema inicial oscuro sin elección, un destello visible de la paleta contraria, un control pequeño o sin nombre, una elección que se pierde, o una ruta que recupera el tema del teléfono es FALLA.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | INDETERMINATE | Chromium con preferencia oscura y movimiento reducido: la primera página visible a 390 px fue clara; el control arriba a la izquierda anunció Activar modo oscuro y, tras elegir oscuro, Activar modo claro. Oscuro y claro persistieron en /, /manana/, /spots/playa-cambutal/ y /en/tomorrow tras recarga; inglés anunció Switch to light/dark mode. A 320 px con JavaScript apagado, portada y Playa Cambutal siguieron claras, legibles y sin desborde horizontal. No se pudo abrir un contexto WebKit aislado ni observar cuadros de la primera pintura del documento para descartar un destello, ni asegurar almacenamiento vacío en el contexto Chromium disponible. |
| 2026-08-11 | Vera | FAIL | En Chromium a 390 px, con preferencia oscura y movimiento reducido, el control superior izquierdo midió 44 × 48 px y anunció Activar modo claro/oscuro y Switch to light/dark mode según la ruta. Las selecciones clara y oscura sobrevivieron /, /manana/, /spots/playa-cambutal/ y /en/tomorrow y la recarga; no hubo desborde a 320, 390 ni 1440 px. Sin JavaScript, portada y Playa Cambutal a 320 px permanecieron claras y legibles. Pero el borde del navegador no puede acompañar la lectura clara: ambas reglas públicas de theme-color, incluso la de prefers-color-scheme: light, anuncian rgb(6, 26, 33), el color oscuro, mientras la página clara se ve casi blanca. No fue posible crear un perfil Chromium verificablemente vacío ni abrir WebKit en esta sesión, pero ese fallo observable basta para incumplir el charter. |
| 2026-08-11 | Vera | FAIL | En Chrome a 390 px, /en/tomorrow/ mostró el control en inglés, pero al abrir la ruta inglesa de playa enlazada desde allí, /en/spots/playa-cambutal/, el control pasó a anunciar “Activar modo claro” en vez de “Switch to light mode”. Claro y oscuro sí persistieron en las rutas españolas, /en/tomorrow/ y recargas; el botón midió 44 × 48 px y no hubo desborde a 320, 390 ni 1440 px. Las dos declaraciones públicas theme-color cambiaron al color de la lectura elegida. Solo había perfiles Chrome existentes, sin WebKit disponible, y la superficie no ofreció apagar JavaScript ni capturar la primera pintura del documento; esas observaciones quedan sin determinar. |
| 2026-08-11 | Vera | PASS | En contextos nuevos y vacíos de Chromium y WebKit, con preferencia oscura y movimiento reducido, la portada comenzó clara; diez muestras consecutivas del primer documento Chromium ya visible fueron claras, no se contó el cuadro en blanco previo a navegar. El control superior izquierdo midió 44 × 48 px, anunció Activar modo oscuro/claro y Switch to dark/light mode en /en/tomorrow y /en/spots/playa-cambutal/. Oscuro y claro sobrevivieron recargas y las rutas /, /manana/, /spots/playa-cambutal/, /en/tomorrow y /en/spots/playa-cambutal/; ambas etiquetas públicas theme-color siguieron #061a21 o #f2f8fa según la lectura. A 320, 390 y 1440 px no hubo desborde. Sin JavaScript, la portada y Playa Cambutal siguieron claras, completas y legibles con el teléfono oscuro, y el control visible no cambió el tema al pulsarlo. |
| 2026-08-11 | Vera | PASS | En contextos nuevos y vacíos de Chromium y WebKit, con preferencia oscura y movimiento reducido, la primera portada ya legible se mantuvo clara durante 30 muestras de cuadros del documento, sin contar la pantalla blanca previa a navegar. A 390 px el control arriba a la izquierda midió 44 × 48 px y anunció Activar modo oscuro/claro en español y Switch to dark/light mode en /en/tomorrow y /en/spots/playa-cambutal/. Las selecciones oscuro y claro sobrevivieron recargas y /, /manana/, /spots/playa-cambutal/, /en/tomorrow y /en/spots/playa-cambutal/; las dos etiquetas públicas theme-color acompañaron #061a21 o #f2f8fa. A 320, 390 y 1440 px no hubo desborde. Con JavaScript apagado, portada y Playa Cambutal fueron claras, completas y legibles en teléfono oscuro, y pulsar el control visible no cambió el tema. |
