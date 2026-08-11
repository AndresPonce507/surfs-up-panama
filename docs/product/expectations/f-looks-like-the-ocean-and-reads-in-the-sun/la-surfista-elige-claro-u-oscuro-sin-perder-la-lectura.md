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
