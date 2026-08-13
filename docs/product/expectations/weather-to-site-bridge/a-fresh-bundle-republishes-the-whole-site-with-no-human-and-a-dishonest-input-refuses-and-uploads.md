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
| 2026-08-13 | Vera | FAIL | Verified myself, not on trust: test:at --tags "@feature-weather-to-site-bridge and @slice-01" exit 0, 9 scenarios/210 steps green; typecheck exit 0. Read the steps: the happy path drives the real mergePublishedSurface, the real civil-day guard against an injected clock, and the real checked-in publishBuild upload walk (aliases, no-cache, content types, production-bucket pin) through runPublishOnce; only the object store, clock, upload pipe and renderer are stand-ins, and the renderer is explicitly a fixture per the feature file's own text. All three refusals (wrong civil day, preview-origin receipt, build_id mismatch) name both values, upload zero objects, leave the archive byte-identical (putsTo=0), and the build_id-mismatch refusal proves the site was never rendered. PUT-only holds in the suite (store ops restricted to get/put, runner strays filtered to none) and in production code: defaultStore (publish-handler.ts) only wraps getCorrection/putManifest, defaultCommandRunner refuses any argv that is not s3api put-object. publish.success derives only from {published:true}; a mid-batch upload failure yields zero success lines and names the broken upload. Ran smoke:publish-lambda-arm64 myself (image pre-cached): exit 1, confirming the given measurement. Evidence shows the image built, the bootstrap loaded, the real composition root ran inside the linux/arm64 container, and the civil-day fixture was retargeted to Panama's real today/tomorrow (not a stale hardcoded date) so the midnight verify was not the blocker. The real `npm run build` inside the image then refused: a static-map-manifest-drift guard fired ("the committed map manifest is not what this policy and seed produce"), alongside a non-fatal Fontconfig stderr line whose causal role I could not determine without running maps:generate or editing committed artifacts, which is out of examiner bounds. The handler answered 204 and printed no PASS. This is the charter's own named negative: the acceptance suite's happy path proves merge/verify/render-call/upload-with-aliases only through a faked renderer, and the one smoke that exists specifically to prove the real Astro build inside Lambda does not pass with real evidence and exit zero right now. Tooling defect: des-record-examine refused to record against either roadmap step 01-01 or 01-02 in docs/feature/weather-to-site-bridge/deliver/roadmap.json ("is not a user-visible upgraded roadmap step; source-blind examination is not applicable") because both are classified surface_classification=non-visual, even though this charter explicitly commissions a non-visual CLI examination; recorded here verbatim rather than worked around. |
