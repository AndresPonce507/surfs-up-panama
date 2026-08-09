# El mismo llamado queda en el portapapeles con un toque, para pegarlo en el grupo, un privado o donde sea
ID: EXP-f-paste-the-call-into-the-group-2 · Spec rows: slice-02 · Persona: Surfista que prefiere pegar el llamado donde él quiera, no solo por el selector de WhatsApp

## Intent
Un toque copia el llamado completo al portapapeles, con confirmación clara, y el surfista lo pega donde quiera. Si el portapapeles falla o no hay JavaScript, la acción de WhatsApp de slice-01 sigue ahí: la feature nunca desaparece.

## Preconditions
Usar Node 22, npm y un navegador local. No usar credenciales ni servicios de nube. Toda observación empieza desde el árbol real indicado abajo. Si el navegador abre otra copia, descartar esa sesión y empezar de nuevo.

1. `cd /Users/andres/panama-surf`
2. Ejecutar `npm ci` solamente si las dependencias todavía no están instaladas.
3. Ejecutar `npm run build`.
4. Ejecutar `npm run preview` y anotar la dirección local que muestra, normalmente `http://localhost:4321`.
5. Abrir la home en una ventana de unos 390 px de ancho. Tener a mano un campo de texto cualquiera para pegar.

## Charter
Explorá la home como alguien que quiere mandar el llamado por donde él elija. Tocá "Copiar el llamado" una vez y mirá qué te dice la página. Pegá en un campo de texto y leé lo que salió. Compará con el mensaje del botón de WhatsApp: deben ser el mismo bloque. Después negá el permiso de portapapeles en el navegador y volvé a tocar: la página tiene que decirte en español qué pasó. Por último apagá JavaScript y recargá: el botón de copiar puede no estar, pero el enlace de WhatsApp tiene que seguir.

## Expected observations (oracle)
- En la tarjeta grande hay un botón de copiar de al menos 44 px que copia con un solo toque.
- Después del toque aparece una confirmación en español, clara y sin brincos; con movimiento reducido activado no hay animación que la reemplace por nada ilegible.
- Lo pegado es el bloque completo del llamado: SURF y la fecha, "Mejor:" con el spot y su puntaje, tamaño y viento, la ventana, "Confianza" con el nivel, y la dirección completa con `?b=`. Idéntico al mensaje del botón de WhatsApp.
- Con el permiso de portapapeles negado, la página dice en español que no pudo copiar y la acción de WhatsApp sigue disponible. Nunca un fallo silencioso.
- Con JavaScript apagado, el enlace de WhatsApp de slice-01 sigue funcionando. La feature no desaparece.
- La página no se siente más lenta: el primer render no espera a ningún script del botón.
- Los dos botones juntos se ven terminados a 390 px en ambos temas: alineados, sin recorte, legibles contra el fondo real.
- Negative: nunca se copia un texto distinto del que la página muestra, ni una dirección relativa o de localhost.
- Negative: la confirmación nunca aparece antes de que el texto esté de verdad en el portapapeles. Nada de verde falso.

Diferido, fuera de este slice: la vista previa del enlace pertenece a slice-03 y slice-04; compartir desde la página del spot pertenece a slice-05.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
