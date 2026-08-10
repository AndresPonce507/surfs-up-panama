# La portada se ve como agua tropical profunda, no como una lista gris, y cada palabra sigue leyéndose bajo el sol
ID: EXP-f-looks-like-the-ocean-and-reads-in-the-sun-1 · Spec rows: slice-01 · Persona: Surfista que abre el sitio en la playa, de madrugada o al mediodía, en el tema claro u oscuro que traiga el teléfono

## Intent
A surfer opens the home page — at dawn with the phone dimmed, or at midday in full glare — in
whatever theme their phone happens to be in, and the top of the page, behind the day's featured
spot, reads as deep tropical water instead of the old flat grey panel. The ranked list further
down keeps its own light, crisp, easy-to-scan feel, just tinted toward that same blue-green world
instead of neutral grey. Nothing about the repaint costs a single word its readability: the
featured call and the full twenty-spot ranking stay exactly as easy to read as they always were,
in direct sun.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. Every command runs
from the checkout under test; give anything else an absolute path.

1. `cd` into the checkout under test.
2. `npm ci` (first time on this machine only).
3. `npm run build`, then `npm run preview`, and note the local URL it prints.
4. Open the home page on a phone-width viewport, first at about 390 px wide, later at about
   320 px wide.
5. You need both themes: whichever setting your phone or browser uses for light/dark appearance
   (or your browser's rendering emulation for that setting, if you're on a desktop). Open the home
   page once in each.
6. You need two light conditions for the reading check: bright, direct light (outdoors at midday,
   or a bright lamp held close to the screen) and dim early-morning light (around 6am, or the
   screen brightness turned low). Read the page's body text under both.
7. Turn on your device's reduced-motion setting before the last pass.

## Charter
Explore the home page the way a surfer actually opens it: half asleep at dawn, or squinting in
full midday glare, phone in whatever theme it happens to be in. First take in the whole page at a
glance — the top of the page, behind the day's featured spot, should read as real deep water, not
a flat colored panel and not the old grey list; the ranked list further down should stay light,
clean and easy to scan, just carrying the same blue-green mood instead of neutral grey. Then read
every line of body text, in the featured card and all the way down the list, under the brightest
and dimmest light you can manage, in both themes, without straining. Switch between light and
dark theme and compare: does the ocean mood carry over top to bottom, or does dark theme feel like
a plain color inversion where nothing pops anymore? Narrow the browser down to the smallest phone
width and walk the page top to bottom looking for anything spilling off the edge or getting cut
off, including the longest spot name on the list. Finish with reduced motion turned on and confirm
nothing moves that you didn't ask for.

## Expected observations (oracle)
- Abro la página de inicio a 390 px, en tema claro y en tema oscuro, y en los dos veo un azul-verde profundo de agua tropical al amanecer en vez de la lista gris de antes, y cada palabra sigue leyéndose con claridad.
- Miro la misma página de inicio bajo el sol simulado del mediodía y a las 6 de la mañana: en los dos temas, el texto del cuerpo se lee con margen de sobra y ningún color se acerca al límite de lectura.
- Recorro la página de inicio en el teléfono a 390 px y a 320 px, en los dos temas: nada se sale de la pantalla, ningún texto se corta, y con el movimiento reducido activado nada se mueve.
- El agua tropical profunda vive detrás de la tarjeta del spot destacado, arriba de todo; la lista
  de playas más abajo se mantiene clara y se recorre rápido, con el mismo tono azul-verde pero sin
  oscurecerse como el fondo de la tarjeta destacada.
- El tema oscuro no es solo el tema claro con los colores invertidos: el mismo carácter de agua
  tropical se mantiene de arriba a abajo, y el color de acento sigue destacando, nunca se ve
  apagado ni gris.
- El nombre de playa más largo de la lista entra completo a 320 px, sin cortarse ni empujar la
  fila a un segundo renglón desprolijo.
- La pantalla se ve terminada: nada está desalineado, cortado, ni tiene pinta de relleno de
  plantilla; de un vistazo se nota que el diseño es intencional, no una versión a medio pintar del
  sitio de siempre.
- Negative: si toda la página —incluida la lista larga de playas— se oscurece igual que el fondo
  de la tarjeta destacada, al punto de costar distinguir una fila de otra o leerla rápido, es
  FALLA: la lista tiene que seguir leyéndose clara y veloz; el agua profunda es el fondo de arriba,
  no de toda la pantalla.
- Negative: si el fondo detrás de la tarjeta destacada se ve como un turquesa claro y lavado —
  cualquier variación más clara que la necesaria para que el texto siga leyéndose con margen de
  sobra bajo el sol — es FALLA, aunque a simple vista en un escritorio parezca aceptable.
- Negative: si algún texto se lee cómodo en un escritorio en penumbra pero se pierde o cuesta leer
  bajo la luz brillante simulada, es FALLA — el sitio se lee en la playa, no en un cuarto oscuro.
- Negative: cualquier scroll horizontal o palabra cortada a 320 px es FALLA, incluida la fila con
  el nombre de playa más largo.
- Negative: si el tema oscuro pierde el color de acento o se ve como un negativo plano del tema
  claro, es FALLA.

Deferred, not this slice: the glass surfaces on the language pill and the report tray (slice-02),
the spot detail, ayer, 404 and both report screens (slice-03), the design-system's own contrast
documentation (slice-04), and the score bar and confidence shape on each ranked row (slice-05).
Their absence, or their continued old styling, is not a failure of this charter.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
