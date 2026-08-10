# El surfista abre Playa Venao, toca avisos de este spot, da el permiso, y ve la palabra listo solo cuando el servidor ya guardó de verdad la suscripción

ID: EXP-f-tell-me-when-its-worth-the-drive-1 · Spec rows: slice-01 · Persona: Surfista de Playa Venao que no quiere revisar el sitio todos los días para saber si vale la pena manejar

## Intent
A surfer on the Playa Venao page finds the avisos line, asks to be told when it is worth the
drive, and every step of that asking is honest: the line only shows up where the phone can
actually ask for permission, it never claims to have avisos on before the phone and the server
have both actually agreed to it, a refusal is explained in plain words instead of being nagged
about again, and turning avisos back off takes exactly one touch that really sticks. This charter
covers the setting-up half of the feature only: asking, being refused, coming back later, the
server accepting or failing to save, and turning it off. Whether a real morning push actually lands
on a real phone some future morning is a separate, later proof and is not decided here.

## Preconditions
This is a Node project; everything runs through npm scripts and a browser. Every command runs from
the tree under test.

1. `cd /Users/andres/psb-push`
2. `npm ci` (first time on this machine only).
3. `npm run build`, then `npm run preview`, note the local address it prints.
4. Open the Playa Venao spot page at that address in a phone-width window, 390 px.
5. For the "no such action anywhere" half of the first observation you need a second browser or
   device, one that is genuinely unable to ask for notification permission. An iPhone opening the
   site in Safari without adding it to the home screen is a reliable example. Any ordinary Android
   phone in Chrome, or a laptop browser, is the capable side of that same comparison.
6. For the return-visit observation, no dev tools are needed: come back to the page after any
   earlier visit on that phone, including one where you denied permission or one where a save
   attempt never finished, and check what the page claims.
7. For light and dark theme plus reduced motion, use the phone or system's own appearance and
   accessibility settings, not a setting inside the site.

Stated honestly: four of the observations below need the real server on the other end to be
reachable, and it may not be reachable yet while this feature is still being built: the server
actually saving the subscription before the page says listo, the server failing to save and
offering to try again, the server not recognising the phone's destination, and the one-tap removal,
which only means something once avisos were really turned on for real. If that server is not
reachable when you run this, mark those four observations INDETERMINATE rather than PASS or FAIL;
do not pass them because nothing visibly broke. One half of the removal observation goes further
still: whether no further aviso ever arrives for that spot afterward is a claim about a future
morning, not something any one sitting can watch happen. Leave that half INDETERMINATE too, never
a PASS earned by nothing arriving yet and never a FAIL earned by not waiting long enough.

## Charter
Explore the avisos line as a surfer who wants a heads-up instead of a daily habit of checking.
Start on the capable phone: find the line, read it before touching anything, then tap it and watch
what the permission prompt does to the screen. Deny the permission and see what the spot tells you,
then tap the same line again and see whether it asks you the same thing a second time. Reload the
page as if you came back another day. Then, if the real server is reachable, grant permission for
real, tap to ask for avisos, and watch closely for the exact moment the word listo shows up, and
whether anything on screen claims avisos are on before that moment. If you can make the server
refuse to save (a bad connection, a forced failure), watch what the spot offers instead. If you got
all the way to a real listo, turn avisos back off with one touch and confirm the spot goes back to
its starting look; if you could not reach that point today, skip this half rather than guessing at
it. Switch to the incapable phone and confirm the whole line is simply not there. Finally, walk the capable phone
through the same avisos line in dark mode and with reduced motion turned on at the system level,
and just look at it, the way you would notice a phone screen that looks unfinished.

## Expected observations (oracle)
- En la página de Playa Venao a 390 px aparece la línea de avisos de este spot como una acción que
  puedo tocar; en un teléfono que no puede pedir avisos esa acción no aparece por ninguna parte, y
  en ninguno de los dos casos la página dice que ya tengo avisos activos.
- Toco la línea de avisos de Playa Venao y no doy el permiso: la pantalla me dice en español
  sencillo que sin permiso no puede avisarme, la página sigue sin decir que tengo avisos activos, y
  por más que toque no me vuelve a pedir el permiso.
- Vuelvo a abrir la página de Playa Venao después de una visita anterior: aunque el teléfono se
  acuerde de algo, la página no dice que tengo avisos activos, porque de verdad no los tengo.
- En la página de Playa Venao a 390 px doy el permiso y toco la línea de avisos: la palabra listo
  no aparece hasta que el servidor ya guardó la suscripción, y ni un instante antes.
- Toco la línea de avisos y el servidor no puede guardarla: la página no me dice que tengo avisos,
  me ofrece intentar de nuevo, y no me promete mandarla más tarde por su cuenta.
- El servidor no reconoce el destino de mi navegador: la página me explica en español llano que
  este navegador no puede recibir avisos, sin una sola dirección, ni código, ni palabra en inglés.
- Con avisos activos en Playa Venao toco una sola vez para quitarlos: la página vuelve a mostrarse
  sin avisos, y a partir de ahí no me llega ningún aviso más de ese spot.
- U8: A 390 px, en tema claro y en tema oscuro, la línea de avisos de Playa Venao se ve terminada:
  se lee bien sobre el fondo real, se toca cómodo con el pulgar, no descuadra la página ni la hace
  desplazarse de lado, y con movimiento reducido activado nada se anima.
- U8: tanto el estado apagado como el estado de permiso rechazado se ven hechos a propósito para
  este control, no como una plantilla genérica ni un aviso de error del sistema; nada se ve cortado,
  desalineado, ni con pinta de relleno de plantilla en ninguno de los dos.
- Negative, la confirmación adelantada: la palabra listo, o cualquier otra señal de que ya tengo
  avisos activos, nunca aparece antes de que el servidor haya confirmado el guardado. Si aparece un
  instante antes, apenas al tocar, o mientras la pantalla todavía espera, es FALLA aunque el resto
  del recorrido funcione.
- Negative, la certeza que el sitio no puede respaldar: en ningún texto de esta línea se promete
  más de lo que el sitio puede cumplir de verdad. Nunca dice que avisará de toda mañana buena sin
  falta, y cuando el guardado falla nunca promete mandar la suscripción más tarde por su cuenta ni
  insiste sola en reintentar; ofrece un botón para volver a intentar, y ahí se queda.
- Negative, salir tiene que ser tan fácil como entrar: quitar los avisos toma como máximo el mismo
  número de toques que pedirlos, sin una segunda pantalla de confirmación, sin una pregunta capciosa
  del tipo "¿de verdad querés quitarlos?", y sin ningún paso que no exista también al prenderlos. Si
  apagar avisos cuesta más esfuerzo que prenderlos, es FALLA sin excepción.
- Negative, la voz de una persona que surfea, no de una máquina: ningún texto de esta línea de
  avisos suena a mensaje generado por un programa. Sin guion largo en ningún lado, sin una sola
  palabra en inglés, sin nombres de servicios ni de tecnologías, sin códigos ni direcciones. Si una
  frase suena a error de sistema y no a algo que diría un surfista real, es FALLA.
- Negative: nada de errores crudos en ninguna pantalla ni estado: ni un texto técnico de programa,
  ni JSON en pantalla, ni un código como "403" o "500" mostrado solo, sin explicación en palabras.

Deferred, not this slice: whether a real morning avisos message actually arrives on a real phone
some future morning; the wording offered on an iPhone's own notification pathway; the afternoon
follow-up notice; and any control for choosing how good a morning has to be before it counts. Their
absence here is not a failure. If the real server round-trip cannot be reached at examination time,
that specific set of observations reads as not yet decidable, never as a pass earned by nothing
visibly breaking.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | INDETERMINATE | No U8 surface observation recorded. Running the charter's required build command exposed detailed build output beyond the local address, contaminating this supposedly source-blind examination before the public page was exercised. |
| 2026-08-10 | Vera | INDETERMINATE | U8 public preview at 390 px, after hydration: in both light and dark the inactive “Avisos de este spot” control was legible, intentional, 332 × 44 px, and the page width stayed 390 px with no side scroll; it made no claim that avisos were active. With reduced motion active, the rendered control remained still during the observation. I had no genuine second browser or device incapable of requesting permission, so I could not observe the required absent-action half. |
| 2026-08-10 | Vera | PASS | U8 public preview at 390 px: with JavaScript enabled, Playa Venao showed the intentional inactive “Avisos de este spot” control, 332 × 44 px, with no active-avisos wording and no horizontal overflow. In a fresh context with JavaScript disabled before the Playa Venao page load, that control was absent and there was still no active-avisos claim. The control was legible in dark and light themes; under reduced motion the two 700 ms-apart rendered frames were identical. |
