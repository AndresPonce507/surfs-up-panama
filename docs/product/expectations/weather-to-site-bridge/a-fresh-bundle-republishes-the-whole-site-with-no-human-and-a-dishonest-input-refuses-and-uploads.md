# Un bundle fresco republica el sitio completo sin un humano, y una entrada deshonesta rehúsa y no sube nada
ID: EXP-weather-to-site-bridge-1 · Spec rows: slice-01 · Persona: Andres, el operador que hoy publica el sitio a mano y quiere dejar de hacerlo

## Intent
The manual release chain (build the bundle, merge the surface, verify the civil day, render with
Astro, upload PUT-only with directory aliases) runs unattended inside one bounded pipeline, and
every guard the manual chain has stays armed: the midnight rule, the origin receipt, the
build-id match, the never-delete publication contract, and the dawn-receipt archive.

## Preconditions
Honesty first: this slice has NO page. Nothing it ships changes a rendered byte relative to the
manual publish path. Its observable is terminal output: the acceptance suite driving the publish
port with fake adapters, and the ARM64 container smoke printing its evidence.

1. `cd /Users/andres/psb-weather-bridge`, all commands from this root.
2. `npm ci` has run; Docker is up (the smoke builds and runs the publisher image).
3. Run the slice's acceptance scenarios: `npm run test:at -- --tags "@feature-weather-to-site-bridge and @slice-01"`.
4. Run the container smoke the slice ships (discoverable from `package.json` scripts, sibling of
   `smoke:build-lambda-arm64`). Capture the real exit codes.

## Charter
Run the acceptance suite and the smoke like the operator who is about to trust this thing with
the public site. Does the happy path actually cover the whole chain (merge, verify, render,
upload with aliases), or does it stop at a mock boundary that proves nothing? Then probe the
refusals deliberately: a bundle for yesterday, an artifact built for the preview origin, a
bundle whose build id is not the one Build announced. Each must refuse with a named reason,
upload zero objects, and leave the previous durable surface byte-identical. Finally read what
the success event refuses to claim: publish.success must be impossible when any upload failed.

## Expected observations (oracle)
- La suite de aceptación del slice corre en verde, y el escenario feliz atraviesa fusión,
  verificación del día civil, render y subida con alias de directorio, todo por el puerto real.
- Un bundle de un día civil que no es el de hoy en Panamá rehúsa con razón nombrada, no sube ni
  un objeto, y el estado durable previo queda intacto.
- Un artefacto construido para otro origen (el recibo `.public-site-origin.json` no coincide con
  producción) rehúsa antes de tocar el almacenamiento.
- Un `build_id` que no coincide con el que Build anunció rehúsa; el Publisher nunca publica un
  bundle que no le pidieron publicar.
- Las operaciones grabadas por el almacén falso no contienen ni list ni delete, en ningún camino.
- Los recibos del amanecer sobreviven dos ciclos simulados; una primera corrida sin estado previo
  siembra el archivo honestamente en vez de inventarle historia.
- `publish.success` aparece solo cuando toda la subida terminó; cualquier rehusar imprime
  `publish.refused` con su razón.
- El smoke ARM64 imprime PASS con evidencia real (imagen construida, pipeline ejecutado adentro,
  presupuestos respetados) y sale con código cero.
- Negative: un escenario feliz que pase con el render falsificado Y sin ningún smoke que ejecute
  el render real dentro de la imagen es FALLA: la parte riesgosa es exactamente el Astro build
  dentro de Lambda.
- Negative: cualquier camino que borre o liste claves del bucket es FALLA de contrato, aunque
  todos los tests pasen.

If the acceptance suite or the smoke does not exist or cannot run, the verdict is INDETERMINATE
with that observation written down. Never a PASS by absence.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
