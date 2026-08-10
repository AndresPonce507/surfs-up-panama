# Un surfista abre Playa Venao en Safari y encuentra el camino honesto a avisos en el icono instalado

ID: EXP-f-tell-me-when-its-worth-the-drive-2 · Spec rows: slice-02 · Persona: surfista de iPhone que quiere enterarse de una mañana buena sin descubrir demasiado tarde que Safari no puede avisarle

## Intent

Safari abierto no puede pedir avisos. La página no disimula esa limitación con un botón
muerto ni deja al surfista solo: le muestra el camino exacto, Compartir y luego Añadir a
pantalla de inicio. Desde el icono instalado, el mismo control de avisos conserva la
honestidad de slice-01: no aparece un estado activo ni la palabra listo hasta que la
suscripción real y el guardado del servidor existen.

## Preconditions

1. Build and serve the deployed preview from the tree under examination.
2. Open Playa Venao in Safari on an iPhone at its normal phone width.
3. Have a second device or browser that can request avisos, so absence in Safari can be
   compared with the same published page where the action is meaningful.
4. For the installed-path observation, add the site from Safari to the Home Screen, open the
   resulting icon, and have the deployed subscription path reachable. If the write path is not
   live, leave only the save-dependent observation INDETERMINATE.

## Charter

Start in the ordinary Safari tab, not from the icon. Find the short iPhone explanation and read it
as a surfer would. It must say what to do, not speak like a browser error. Confirm there is no
thing to tap that claims to turn avisos on. Compare with the same Playa Venao page where avisos can
actually be requested, so a page that hides avisos from everybody cannot pass by accident.

Use Compartir, add the site to the Home Screen, then leave Safari and open the icon. The same
Playa Venao control should now be available. Before touching it, look for any premature claim that
avisos are already active. Grant permission and ask for avisos. Watch whether listo appears only
after the server has stored them. Repeat the walk in light and dark appearance, with reduced motion
enabled, at a narrow phone width.

## Expected observations (oracle)

- In an open Safari tab, Playa Venao shows exactly: “¿Quieres avisos? En iPhone: Compartir, y
  luego Añadir a pantalla de inicio. Sin eso, iPhone no deja avisar.” It is a short disclosure,
  not an automatic install prompt or an error wall.
- The Safari tab offers no control that pretends it can enable avisos. The same published page does
  offer the avisos control where the browser can ask for them.
- The installed icon shows the same avisos entry as the capable path. It never calls avisos active
  merely because the icon was installed or because a device remembered something from an earlier
  visit.
- When the deployed write path is reachable, asking from the installed icon reaches listo only
  after the real subscription has been stored. If that path is unavailable, record INDETERMINATE,
  not PASS from a silent failure.
- U8: at 390 px in both themes, the iPhone route reads like a calm, intentional instruction. It
  fits without side scrolling or clipped Spanish, uses the site’s visual rhythm, and does not rely
  on animation or decorative noise to explain an essential capability boundary.
- Negative: if Safari ever shows a tap target that cannot request avisos, this is FAIL. If the hint
  is missing, paraphrased, hidden in developer language, or the installed icon says listo before a
  real save, this is FAIL.

## Deferred, not slice evidence

Real FCM/APNs delivery and aes128gcm interoperability remain the ADR-required launch smoke on a
real iPhone and Android device. This charter observes the product route and the honest state
boundary. It does not claim that a local Chromium run proves an Apple push delivery.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
