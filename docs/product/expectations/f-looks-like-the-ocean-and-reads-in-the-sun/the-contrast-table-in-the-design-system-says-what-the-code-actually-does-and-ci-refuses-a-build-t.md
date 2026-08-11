# La tabla de contraste del sistema de diseño dice lo que el código realmente hace, y la revisión local rechaza una publicación que se aparte
ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-4 · Spec rows: slice-04 · Persona: Surfista que necesita leer la portada bajo el sol, y mantenedor que no puede descubrir una pérdida de lectura después de publicar

## Intent
La persona que abre Surfs Up Panama no ve una tabla de ratios. Ve la portada, con la llamada del
día encima del agua tropical, y necesita leerla con el sol de frente. La tabla existe para que esa
lectura no dependa de que alguien recuerde los colores correctos dentro de seis meses. Tiene que
decir lo mismo que la página construida, en tema claro y oscuro, y la revisión local tiene que
llevar ese acuerdo junto con la construcción que se publica.

Este paso no cambia una palabra, un número, una ruta ni un color que el surfista recibe. Arregla la
promesa escrita que protege esos píxeles. La tarjeta grande sigue siendo agua sólida, no vidrio; el
vidrio de la bandeja de reportar y las otras pantallas pertenecen a los pasos que los miden.

## Preconditions

1. Desde el checkout bajo examen, instalar dependencias con `npm ci` si hace falta.
2. Construir la superficie con `npm run build` y servir `dist/` con `npm run preview`.
3. Abrir la portada a 390 px, primero en tema claro y luego en oscuro.
4. Tener abierto `docs/product/architecture/09-design-system.md`, sección 3. La persona que
   examina compara lo que lee y ve, no necesita tocar CSS ni buscar colores en el código.

## Charter

Abrí la portada como la abrirías al salir del agua: a 390 px, con el teléfono en tema claro y en
tema oscuro, y bajo luz fuerte si es posible. Leé el título, el número y la frase de la tarjeta
grande, y también los nombres y líneas pequeñas de la lista. Nada puede verse lavado, perderse
contra el agua ni requerir esfuerzo para leerse.

Después abrí la sección de contraste del sistema de diseño. La tabla debe hablar de esa misma
portada azul-verde, no de la lista gris que existía antes: debe explicar qué texto se mide contra
el agua más clara, qué texto se mide contra el fondo de la página, y cuál es el margen que deja.
No hace falta que adivines los números: lo importante es que no haya dos historias distintas entre
la página que acabás de leer y la promesa escrita que la protege.

Por último imaginá que alguien aclara el agua o cambia una tinta por accidente. La revisión local
debe detener la publicación antes de que ese cambio llegue a la playa. Si no podés hacer que la
revisión corra, el veredicto es INDETERMINADO, nunca PASA por falta de observación.

## Expected observations (oracle)

- **U8 (tabla y revisión, 04-01):** Abro la página de inicio en el teléfono, en las dos maneras
  del tema, bajo la luz simulada del mediodía: cada palabra se lee cómoda y ningún color se ve
  lavado ni borroso contra su fondo. La tabla que la protege cuenta la misma historia.
- La tarjeta grande sigue siendo agua tropical sólida y la lista debajo se mantiene clara; ninguna
  de las dos se convierte en un efecto de vidrio para aparentar contraste.
- La tabla no conserva pares de la paleta gris anterior ni inventa pares para superficies que este
  paso todavía no midió.
- A 390 px no aparece scroll horizontal, los controles que se pueden tocar siguen siendo fáciles
  de alcanzar y al pedir movimiento reducido la página se queda quieta.
- La lectura llega lista, sin una pantalla vacía o una espera maquillada; este paso no agrega un
  estado nuevo al recorrido del surfista.
- Negative: si la página se lee bien pero la tabla todavía habla de una tinta, un fondo o un
  degradado gris anterior, es FALLA. Una promesa escrita que no describe la página deja escapar la
  próxima regresión aunque la página de hoy se vea bien.
- Negative: si cambiar un color para volver ilegible una pareja no detiene la revisión local antes
  de publicar, es FALLA. Una comprobación que nadie puede ver fallar no protege a quien lee bajo el
  sol.

Deferred, out of this step: the browser-wide contrast walk and the deliberately drifted build
proof belong to 04-02 and 04-03. The glass and spot-page table rows wait for the surfaces that
own those measurements; this step only makes the already shipped home-page record honest.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | PASS | Se construyó y abrió la portada publicada en Chromium a 390 px, en tema claro, oscuro y movimiento reducido. El título, número, frase de la tarjeta y las líneas de la lista siguieron legibles; no apareció scroll horizontal ni movimiento con la preferencia reducida. La sección 3 del sistema de diseño mostró los mismos valores renderizados de fondo, tinta, título, texto de llamada y punto más claro del degradado en los dos temas. Esta observación califica la superficie y el registro visible; no sustituye el siguiente paso, que recorre las demás rutas y prueba una deriva de construcción. |
| 2026-08-10 | Vera | INDETERMINATE | `npm run build` completed and the prescribed preview endpoint was available at `http://127.0.0.1:45455/`, but this session exposes no browser surface. I could not render the home page at 390 px in light/dark themes, request reduced motion, or compare its visible result with the design-system table. |
| 2026-08-10 | Vera | PASS | At 390 px in Chromium, light and dark home pages rendered the full ranked list without a blank or loading state and without horizontal overflow (390 px scroll width/client width). The hero stayed a solid teal-water gradient, not glass: light ended at `#0D5866`, dark at `#0C5866`; its heading was white and its summary `#E8F7FA`. The page backgrounds and body text matched section 3 (`#F2F8FA`/`#08252E` light; `#061A21`/`#E4F2F5` dark). Visible links were at least 44 px high. In reduced-motion mode there were no running animations. `npm run build` completed under the prescribed local recipe; the deliberately drifted-build proof is deferred to 04-03. |
