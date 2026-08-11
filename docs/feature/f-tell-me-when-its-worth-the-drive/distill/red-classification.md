# RED classification history

Feature: `f-tell-me-when-its-worth-the-drive`
Slices entered: `slice-01`
Status: slice-01 entered JIT DISTILL 2026-08-09 on lane branch `build/f2-push`, base `9be788e`

## Contract for every future entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed, then one row per scenario with the observable
   exercised, the classification, and the behavior oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behavior oracle. A failure during import,
   fixture construction, step matching, browser startup or runner setup is BROKEN and blocks
   handoff until the test is fixed.
3. Scenarios drive production entry points only: the real `npm run build`, the emitted `dist/`
   served over real HTTP, and Chromium at 390 px for visible observables. No fixture-only
   wiring may satisfy an oracle that the built surface owes, and no stand-in endpoint may
   satisfy an oracle that a deployed write path owes.
4. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the
   default for this feature; the recorded relaxation for keystone slices 06 to 08
   (HANDOFF §10 waiver 1) was a deliberate call for that build and carries no precedent here.

## Entries

---

# Slice-01 RED classification

Observed 2026-08-09 on `build/f2-push`, base `9be788e`.

## Reconciliation

Reconciliation passed, 0 contradictions. This feature carries a unified `feature-delta.md`
and no per-wave `discuss/`, `design/` or `devops/` decision files exist for it, so there is
no DISCUSS-versus-DESIGN-versus-DEVOPS contradiction surface to resolve. The two live
disagreements this lane carries are recorded as open Pre-requisites, not silently resolved:
the A2HS hint's ownership (Pre-requisite 4(b)) and the threshold value (Pre-requisite 1).
Neither is decided here, and no slice-01 scenario depends on either being decided.

`docs/product/architecture/brief.md` does not exist in this repo. Driving ports were taken
instead from the accepted architecture: `07-write-path.md` §10's component table names
`decide_subscribe` and `plan_notifications` as pure-function contracts, §8.6 gives the
subscribe sequence through the push island, and the feature-delta's seam section is the
contract of record for the service worker handlers.

## The two constraints that shaped every oracle

**1. The threshold is undecided, and no scenario pins it.** Pre-requisite 1 is open.
`07-write-path.md` §8.1 carries `threshold_score` "optional, default 70", and the same
document's "What I am unsure about" item 4 says that default "is an unfit prior; no research
names the right default". Andres has not ruled. So no scenario asserts 70 or any other
product default. What every threshold scenario asserts is the LAW the design does fix,
`score >= subscriber's threshold_score` (§8.2, and the ADR's send rule 4):

- `Una mañana que llega a la barra del suscriptor produce exactamente un aviso` runs at
  three different subscriber bars (30, 55, 88) with the morning scoring exactly at the bar,
  plus one row well above it. Those numbers are the bar of that scenario's own subscriber,
  supplied as fixture data. Inclusivity at the bar is the oracle.
- `Una mañana por debajo de la barra del suscriptor no produce ningún aviso` runs the same
  three bars at bar minus one. Exclusivity below the bar is the oracle.
- `Un suscriptor que no eligió barra igual se rige por una barra, la del servidor` sweeps the
  whole 0 to 100 scale for a subscriber with no chosen bar and asserts that the send decision
  has exactly one cut point, monotone, somewhere inside the scale. It deliberately never says
  where. That is the honest way to prove a server-side default governs without inventing it.

Whatever value Andres ratifies, and whichever way the stamp-at-subscribe versus
apply-at-send mechanic is settled, none of these scenarios needs an edit during GREEN.

**2. No write path is deployed, and no scenario fakes one.** Pre-requisites 2, 3, 5 and 6 are
open: no CloudFormation stack, no `push` Function URL, no mint credential, no concurrency
answer, no VAPID keypair. Five scenarios are tagged `@deploy-blocked` because their oracle
is about what the real server did. They run today and they fail at their oracle today, but
they cannot reach GREEN until those Pre-requisites close. Nothing in this suite stands up a
local endpoint to make one of them pass: a scenario satisfied by a stand-in endpoint proves
nothing about the real one, and per `adr-push-vapid-direct.md`'s own consequences an AT
against a fake push service attests protocol framing only, never real FCM or APNs acceptance
or aes128gcm interop.

## Commands observed

```sh
npm run typecheck
npm run build
npm run test:at -- --dry-run --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-01"
npm run test:at -- --dry-run --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-99"
npm run test:at -- --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-01"
npm run test:at -- --tags "not @feature-f-tell-me-when-its-worth-the-drive"
```

The dry run was executed first and deliberately: cucumber exits 0 on a tag expression that
selects nothing, so a real run against a mis-parsed tag would look green. The `@slice-99`
run is the control, and it returned 0 scenarios, which proves the quoted `--tags` argument
survives `npm run ... --` as ONE argument rather than being split into positional paths.
The `@slice-01` dry run collected 37 scenarios and 416 steps with zero undefined and zero
ambiguous steps, so `strict: true` had nothing to fail on at step matching.

**Focused gate**

```
npm run test:at -- --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-01"
REAL_EXIT=1
37 scenarios (37 failed)
416 steps (353 passed, 26 skipped, 37 failed)
```

All 37 scenarios failed on a `Then`. Not one failed on a `Given` or a `When`, so no scenario
fell over during setup, import, fixture construction, step matching or browser startup. The
353 passing steps are the preconditions and actions that ran successfully before each oracle;
the 26 skipped are the later steps cucumber drops once a scenario has failed.

**Regression**

```
npm run test:at -- --tags "not @feature-f-tell-me-when-its-worth-the-drive"
REAL_EXIT=0
78 scenarios (78 passed), 898 steps (898 passed)
```

The new step definitions are registered globally by `cucumber.mjs`'s `import` glob, so this
run is the proof that none of them shadows or ambiguously matches a step belonging to the
keystone or to F-BILL. `npm run typecheck` exits 0 with the new files included.

## How the surface is driven

- **The built reading surface.** Every browser scenario runs the real `npm run build` once
  per process, **inside a private copy of the project**, and serves that copy's emitted
  `dist/` through a plain static file server with **no route fallback**. The isolation is not
  decoration: `scripts/ci-local-core.mjs` states that two concurrent `astro build` runs
  collide on the shared `.astro` / `.prerender` / `.vite` scratch directories "whatever
  --outDir each was given", which is why its `budget` job is marked `serial` and gets its own
  wave. The `at` and `ui` jobs share wave 1 and `ui` already builds, so an acceptance run
  that built in the repository root would have introduced exactly that collision. The project
  is copied into a temporary root the way the keystone's slice-06 steps already do it, with a
  directory junction to the installed `node_modules` so nothing is downloaded and the
  dependency tree is the real one. The repository's own `dist/` is never written by the
  acceptance run, which was verified by comparing its mtime across a full gate. Not `astro preview`, and specifically not `vite preview`: its SPA
  fallback returns `index.html` for any unmatched path, which turns a page that does not
  exist into a 200 and would convert a missing surface into a passing test. A path that
  resolves to no emitted file returns the real `404.html` with a real 404 status. Route
  resolution mirrors `astro.config.mjs` `build.format: 'file'`, trying the sibling
  `spots/playa-venao.html` before the same-named directory, which really exists and holds
  `ayer`, `reportar` and `reportado`.
- **Chromium at 390 px**, `isMobile`, touch, `es-PA`, both colour schemes, both motion
  preferences.
- **The two server decisions** are driven as the pure functions the architecture already
  declares them to be (`07-write-path.md` §10: declared effect universe "none, returns a
  Plan value, never executes"). No store and no endpoint is stood up for them.
- **The service worker handlers** are driven with the scope they run in, whose network and
  storage capabilities are traps, so the statelessness obligation is observable. This touches
  no file belonging to F-WORKS-WITH-NO-SIGNAL.

## Harness facts established empirically, not assumed

| Fact | Why it is recorded |
|---|---|
| A TypeScript closure handed to `page.evaluate` dies with `ReferenceError: __name is not defined`. The steps load through tsx, and esbuild rewrites named local functions with a helper that does not exist in the page. | The first run of this suite produced exactly that, which is a harness failure wearing the costume of a result. Every page-side script is now a source string, handed to the page untouched. Recorded so a future author does not reintroduce it. |
| In headless Chromium, `Notification.permission` reads `denied` no matter what the context was granted, while `navigator.permissions.query({name:'notifications'})` reports the truth and `Notification.requestPermission()` resolves correctly. | The granted path is asserted on the query state, not on `Notification.permission`. Probed directly before the steps were written: granted context returns `{permission:'denied', query:'granted', asked:'granted'}` headless and `{permission:'granted', ...}` headed. |
| Playwright drives permissions per browser context, so a permission that was never granted surfaces as a dismissal (`prompt` / `default`), not as a hard `denied`. Neither `Browser.setPermission` over CDP nor `--deny-permission-prompts` changes that under Playwright. | Probed directly. The refusal scenario therefore asserts "no concedido", which is true of both a dismissal and a hard denial and owes the surfer the same honest state either way. A hard operating-system denial is only observable on the real-device smoke, Pre-requisite 10. **Flagged, not fudged.** |

## Every negative oracle is falsifiable

The first execution of this suite reported 9 passing scenarios. Every one of them was a
negative oracle satisfied by absence: "no sale ningún aviso" is trivially true of a run that
never decided anything, "no tocó la red" is trivially true of a handler that never ran, and
"no muestra avisos activos" is trivially true of a page with no avisos control at all. A
trivially true assertion is a false green, so each negative now first requires the machinery
it is about to have actually run:

| Negative oracle | What it now requires before it can pass |
|---|---|
| `no sale ningún aviso` | the run produced a plan at all |
| `nada queda guardado` | the server produced a decision at all |
| `ninguna suscripción queda marcada para borrarse` | the reaction rule decided at all |
| `el teléfono no pidió nada a la red` / `no guardó ni leyó nada` | the handler actually showed the notification |
| `la página no muestra avisos activos` | the built page offers an avisos control at all |
| `el spot no vuelve a pedir el permiso` | a control was actually tapped |
| `la página vuelve a mostrarse sin avisos` | a removal control was actually tapped |
| `la suscripción no queda guardada para mandarla más tarde` | a subscription was actually attempted |
| `la página no ofrece ninguna acción para activar avisos` | the SAME built page DOES offer the action in a context that can request push |

That last one is the shape worth naming. "No dead button" cannot be proven by absence, because
today the page offers nothing to anybody. The scenario therefore opens a second context on the
same served surface where push IS available and requires the action to be present there, then
requires it absent in the incapable context. It is a comparison, not an absence, so it can
only pass by real behaviour.

After those repairs the run went from 28 failures and 9 passes to 37 failures and 0 passes.

## Scenario classification

Every row is `MISSING_FUNCTIONALITY`. Every row reached a `Then`.

### `avisos-de-este-spot.feature` — the built spot page in a real browser

| # | Scenario | Observable exercised | Behavior oracle reached | Deploy |
|---|---|---|---|---|
| 1 | El surfista pide avisos de Playa Venao y solo ve listo cuando el servidor ya los guardó (`@walking_skeleton`) | built 390 px Venao page, permission granted for real, browser's own `PushManager.getSubscription()` | el navegador no entregó ninguna suscripción de avisos para Playa Venao | deploy-blocked |
| 2 | Si el teléfono no concede el permiso, el spot se queda sin avisos y lo dice en palabras | same page after a real refused `Notification.requestPermission()` | la página no dice en ninguna parte que sin permiso no puede avisar | runnable |
| 3 | Donde el teléfono no puede pedir avisos, no aparece un botón muerto | same page with `PushManager` and `ServiceWorkerRegistration.prototype.pushManager` genuinely removed before load, compared against a capable context | la misma página tampoco ofrece la acción donde el navegador SÍ puede pedir avisos, así que su ausencia aquí no distingue nada | runnable |
| 4 | Si el servidor no puede guardar la suscripción, el spot sigue sin avisos y ofrece reintentar | built page plus the observation that no avisos write destination is named anywhere in it | la página no ofrece intentar de nuevo | deploy-blocked |
| 5 | Un destino que el servicio no reconoce se explica en español llano, sin jerga | same | la página no explica que ese navegador no puede recibir avisos | deploy-blocked |
| 6 | Al volver, el estado de avisos sale de la suscripción real del navegador | reload with a remembered `localStorage` flag planted and no real subscription | la página construida no ofrece ningún control de avisos, así que esta comprobación en negativo todavía no prueba nada | runnable |
| 7 | Un toque quita los avisos y quitados quedan | chained from scenario 1's Given plus When, then the removal control | nunca se llegó a tocar ningún control para quitar los avisos, así que no hay nada que haya vuelto a apagarse | deploy-blocked |
| 8 | El control de avisos se ve terminado en el teléfono, tema claro, movimiento normal | rendered 390 px page, real backdrop, geometry, touch size, motion | U5: la página no tiene ningún control de avisos que examinar, así que ninguno de sus estados diseñados existe | runnable |
| 9 | El control de avisos se ve terminado en el teléfono, tema oscuro, movimiento reducido | same, dark scheme and reduced motion | U5 as above, plus U1/U6: no hay ningún texto de avisos cuyo contraste ni cuya escala tipográfica se pueda medir contra el fondo real | runnable |

Rows 8 and 9 are the U1 to U7 rows. They are RED for the honest reason: the mandates apply to
the avisos control in its designed states, and that control does not exist, so there is
nothing whose contrast, geometry, touch size, motion or type scale can be measured. The
checks were executed, not skipped.

### `el-aviso-de-la-manana.feature` — the hourly run's decision

| # | Scenario | Observable exercised | Behavior oracle reached |
|---|---|---|---|
| 10-13 | Una mañana que llega a la barra del suscriptor produce exactamente un aviso, bars 30/55/88 at the bar and 55 well above it | `plan_notifications` with the clock as an input, Venao's own timezone from the seed | salieron 0 avisos donde tenía que salir exactamente uno |
| 14-16 | Una mañana por debajo de la barra del suscriptor no produce ningún aviso, bars 30/55/88 at bar minus one | same | la corrida no llegó a decidir nada, así que un cero de avisos todavía no prueba la regla |
| 17-19 | Fuera de la mañana no sale ningún aviso, 05:25 / 09:25 / 13:25 spot-local | same | as above |
| 20 | Nadie recibe dos avisos del mismo spot el mismo día | chained: same subscriber, already notified today, run one hour later | as above |
| 21 | Un suscriptor que no eligió barra igual se rige por una barra, la del servidor | a 0 to 100 sweep over the whole score scale | en toda la escala no salió ni un aviso, así que no hay ninguna barra gobernando |
| 22 | Un spot en otro huso usa su propia mañana, no la de Panamá | a spot on a fixed offset six hours ahead, at Panama's 07:25 | la corrida no llegó a decidir nada, así que un cero de avisos todavía no prueba la regla |
| 23 | Pasado el tope de envíos de una corrida, lo que queda se anuncia en voz alta | seven subscribers, declared run cap of three | la corrida armó 0 avisos con un tope de 3 |
| 24-26 | Un destino que ya no existe se borra al primer fallo, "no encontrado" / "ya no existe" / "prohibido" | the send-reaction decision over 404, 410 and 403 | quedaron 0 suscripciones marcadas para borrarse donde tenía que quedar una |
| 27 | Un fallo pasajero del servicio de avisos no borra a nadie | same decision over a 503 | la corrida no llegó a decidir nada sobre ese fallo pasajero |

Row 27 exists so rows 24 to 26 are falsifiable: an implementation that pruned on every
failure would satisfy the three pruning rows and fail this one.

### `el-aviso-en-el-telefono.feature` — the service worker seat handlers

| # | Scenario | Observable exercised | Behavior oracle reached |
|---|---|---|---|
| 28 | Cada aviso que llega se muestra, ninguno llega en silencio | the push handler against a scope whose `showNotification` is observed | el aviso llegó y no se mostró ninguna notificación |
| 29 | Dos avisos del mismo spot no se apilan, el nuevo reemplaza al anterior | two pushes for the same spot | se mostraron 0 notificaciones donde tenían que mostrarse dos |
| 30 | Mostrar el aviso no pide red ni guarda nada | the same handler against a scope whose `fetch`, `caches`, `indexedDB` and `localStorage` are traps | el aviso nunca se llegó a mostrar, así que no haber tocado nada todavía no prueba nada |
| 31 | Tocar el aviso lleva a la página del spot sin abrir una segunda ventana | the click handler with one matching client open | el aviso siguió en la bandeja después de tocarlo |
| 32 | Tocar el aviso abre la página del spot cuando no hay ninguna ventana abierta | the click handler with no clients | no abrió ninguna ventana en la página del spot |

### `la-suscripcion-guardada.feature` — the write surface's decision

| # | Scenario | Observable exercised | Behavior oracle reached |
|---|---|---|---|
| 33 | Pedir avisos dos veces del mismo spot desde el mismo teléfono deja una sola suscripción | `decide_subscribe` twice with the same endpoint and device | quedaron 0 suscripciones donde tiene que quedar exactamente una |
| 34 | Un destino que no es de un servicio de avisos conocido se rechaza en voz alta | `decide_subscribe` with an off-allowlist host | el servidor contestó nada donde tenía que rechazar |
| 35 | Un destino sin conexión segura se rechaza igual | `decide_subscribe` with an `http://` endpoint | el servidor contestó nada donde tenía que rechazar |
| 36 | Un teléfono que pasa su cupo del día deja de escribir suscripciones | `decide_subscribe` with the day's writes already at 20 | el servidor contestó nada donde tenía que rechazar por cupo |
| 37 | Cancelar avisos que ya no están sigue siendo un final normal | `decide_subscribe` unsubscribing something already gone | el servidor contestó nada al quitar algo que ya no estaba |

## Which oracles cannot reach GREEN in this environment

Five scenarios carry `@deploy-blocked`: 1, 4, 5, 7 in `avisos-de-este-spot.feature`, and the
"a ese surfista no le vuelve a llegar ningún aviso" step inside scenario 7. Their oracles are
about what a real deployed server did or did not do, and no such server exists. They fail
today for the right reason and they will keep failing until Pre-requisites 2 (write stack),
3 (mint credential), 5 (concurrency quota) and 6 (VAPID keypair) close. DELIVER must not make
any of them green by pointing a step at a locally stood-up endpoint. If a crafter finds
themselves writing a test server to close one of these, the correct move is to stop and
escalate the Pre-requisite.

Three requirements have no executable oracle in slice-01 at all, recorded in
`requirement-checklist.md` rather than faked: R36 (no push string invented, because the
strings do not exist yet, Pre-requisite 8), R37 (island byte ceiling, because there are no
island bytes to weigh yet) and R38 (no PII on the push path and key material only in SSM,
because key material is a human apply step and there is no deployed path to observe).

## Declared production surfaces, and what DELIVER owes

The steps reach these by name. The three module paths are DISTILL's TypeScript rendering of
contract names the accepted architecture already uses; the export names are the contract, and
DELIVER may site them elsewhere at the cost of one step-file edit, which is a flag, not a
blocker.

| Surface | Named by | Shape the scenarios assume |
|---|---|---|
| `src/push/decide-subscribe.ts` → `decideSubscribe(request)` | `07-write-path.md` §10 names `decide_subscribe` as a pure-function contract | returns `{ outcome: 'subscribed' \| 'unsubscribed' \| 'rejected', stored: StoredSub[], rejection: { what, why, how } \| null }`. Inputs carry `now`, `existing`, `writes_today` and `allowlist` explicitly, so the decision reads no ambient anything |
| `src/push/plan-notifications.ts` → `planNotifications(input)` | `07-write-path.md` §10 names `plan_notifications` as a pure-function contract | returns `{ sends: PlannedSend[], deferred: number, events: [{kind, deferred?}] }` from `{ now, spots, scores, subscriptions, run_cap }` |
| `src/push/plan-notifications.ts` → `planSendReactions({sends, responses})` | **named by no document.** This is the minimum invention needed to express §8.4's pruning rule as a pure decision, since pruning reacts to a send response and the architecture's pattern keeps the core pure | returns `{ deletions: string[], events: [] }` |
| `src/push/notification-seat.ts` → `handlePush`, `handleNotificationClick` | **named by no document.** The seam grants a structural seat only, "where the listener goes", not what module supplies it | called as `(event, scope)` with the standard service worker event and global-scope shapes |

Two things DELIVER must not read into the above. First, the per-run cap is asserted as a LAW
against a declared cap of three, never against the literal 10,000: that number is D5's
proposal in `adr-push-vapid-direct.md` and is a configuration value, not an acceptance
oracle. Second, the `stored` array is the plan's report of what the write would leave behind,
not an instruction to hold state inside the decision.

## Infrastructure policy rows owed

`docs/architecture/atdd-infrastructure-policy.md` carries no row for any push port, and this
lane's write grant does not include that file, so the rows are **flagged, not written**. What
slice-01 actually used, for whoever adds them:

| Port | Class | Treatment used here |
|---|---|---|
| Built reading surface (spot page) | driving | real `npm run build`, emitted `dist/` over a no-fallback static server, real Chromium |
| `decide_subscribe`, `plan_notifications` | driving (pure decisions) | called directly with declared inputs; nothing stood up |
| Push subscription store | driven internal | not exercised. The decisions are pure and report the writes to make, so no store double was needed |
| Browser push service | driven external | not exercised at all in slice-01. Send framing against a fake push service and the real-device smoke are Pre-requisite 10 |
| Notification permission, service worker scope | driven external / non-deterministic | the real browser for permission, a trapped scope object for the handlers |

## Gate result

37 scenarios, 416 steps, all 37 failing at a `Then`, none during import, world construction,
fixture construction, step matching or browser startup. Classification for every scenario is
`MISSING_FUNCTIONALITY`. There are no skipped and no pending scenarios in the slice-01
selection. The rest of the acceptance suite is unaffected: 78 scenarios, 898 steps, all
passing.

Slice-01 is ready for the DISTILL review gate. It is not ready for DELIVER: the independent
AT-review verdict is not recorded here, the slice charter under
`docs/product/expectations/f-tell-me-when-its-worth-the-drive/` is owed and outside this
lane's write grant, and Pre-requisites 1, 4(a), 8 and 9 are open in ways that touch this
slice's copy, its seam and the paperwork its scenarios lean on.

---

# Slice-02 RED classification

Observed 2026-08-10 on `recover/push-maps`, base `0286ad7`.

## Reconciliation

Reconciliation passed, 0 contradictions among the available project truth. This feature has no
per-wave `discuss/`, `design/`, or `devops/` decision files; its unified feature delta and the
accepted architecture are the applicable sources. The subscriber threshold remains deliberately
unratified and no slice-02 requirement names a value. The only open delivery boundary is
Pre-requisite 4(b): both Push and SIGNAL claim the same A2HS disclosure. The contract is not
ambiguous about the user outcome, only its physical owner. The roadmap blocks implementation until
one owner is recorded and forbids duplicate markup.

## Commands observed

```sh
node --input-type=module -e "JSON.parse(...)"
npm run typecheck
npm run test:at -- --dry-run --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-02"
npm run test:at -- --dry-run --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-99"
npm run test:at -- --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-02"
```

The dry run collected 5 scenarios and 57 steps with zero undefined or ambiguous steps. The
slice-99 control selected zero scenarios, so the quoted tag expression is known to reach Cucumber
as one expression. Typecheck passed.

The live run reached the production build entry, then every scenario stopped in the shared
production build guard before a browser page existed:

```
publish-surface refused: WHAT static surface is for 2026-08-09,
not Panama's 2026-08-10; HOW publish the completed current bundle.
```

## Classification

| Scenario | Classification | Why |
|---|---|---|
| Safari explica cómo llegar a los avisos sin ofrecer un botón muerto | BROKEN | The real build refused stale published input before its Safari-path oracle could run. |
| El surfista que abre el icono instalado encuentra la misma entrada de avisos | BROKEN | Same stale-surface build guard, before the installed-entry oracle. |
| El icono instalado no finge que los avisos ya están encendidos | BROKEN | Same stale-surface build guard, before the no-phantom-state oracle. |
| Desde el icono instalado el surfista ve listo solo después de guardar los avisos | BROKEN | Same stale-surface build guard, before the deploy-blocked acknowledgement oracle. |
| El camino de iPhone se ve terminado a 390 px en los dos temas | BROKEN | Same stale-surface build guard, before U1-U7 observation. |

**Result: 0 RED, 5 BROKEN, 0 standing guards.** This is an honest failed pre-DELIVER gate, not a
missing-feature result. The suite may not enter DELIVER until a fresh two-day published surface is
available to the isolated build. The test lane did not generate or publish one because its scope
forbids touching generated data. Once that prerequisite is supplied, rerun the same focused command
and require each scenario to reach its own `Then` oracle as `MISSING_FUNCTIONALITY`.

---

# Slice-03 and Slice-04 RED classification

Observed 2026-08-10 in `psb-push-maps`.

## Reconciliation

Reconciliation passed, 0 contradictions. The feature-local DISCUSS, DESIGN and DEVOPS decision
directories are absent; the unified feature delta, accepted write-path architecture and
`distill/slice-03-04-decisions.md` are the applicable record. That decision record fixes the
launch bar default at 70, the follow-up as shipped, its Spanish copy, and Slice-04's exact integer
range. It also names the deployed write stack, scheduler, VAPID keypair, real-device smoke and
deployed report storage as external boundaries. No local fake is permitted for any of those claims.

## Commands observed

```sh
jq empty docs/feature/f-tell-me-when-its-worth-the-drive/deliver/roadmap.json
npm run typecheck
npm run test:at -- --dry-run --tags "@feature-f-tell-me-when-its-worth-the-drive and (@slice-03 or @slice-04)"
npm run test:at -- --dry-run --tags "@feature-f-tell-me-when-its-worth-the-drive and @slice-99"
npm run test:at -- --tags "@feature-f-tell-me-when-its-worth-the-drive and (@slice-03 or @slice-04) and not @requires_external"
```

The roadmap parsed, its 42 declared steps matched the counted phase steps, and TypeScript
typecheck passed. The dry binding run selected 18 scenarios and 230 steps with zero undefined or
ambiguous steps. The slice-99 control selected zero scenarios, proving the quoted tag expression
arrives as one Cucumber argument.

The local run excludes the three deliberately external journeys. It ran 15 scenarios and 192 steps:
all 15 failed at their individual `Then` oracle, with 171 setup/action steps completing and no
failure in import, step matching, world construction, browser launch or fixture setup.

## Classification

| Contract group | Classification | Right reason reached |
|---|---|---|
| Afternoon question, including a later bad sea | MISSING_FUNCTIONALITY | `planNotifications()` does not yet exist, so the `Then` reports zero questions rather than treating an absent plan as a pass. |
| Afternoon suppression after a response, outside the window, or without a morning aviso | MISSING_FUNCTIONALITY | The `Then` first requires a completed plan; it reports that the run decided nothing, preventing a false-green absence claim. |
| Exact chosen bar governs later sends | MISSING_FUNCTIONALITY | The existing idempotent upsert preserves the exact selected value; the later planner is absent and the send `Then` fails there. |
| Invalid -1, 101 and 67.5 choices | MISSING_FUNCTIONALITY | The current public upsert changes the stored value; the `Then` reports that invalid input changed avisos instead of a setup failure. |
| Returned bar from real active subscription | REQUIRES_EXTERNAL | `@requires_external @deploy-blocked`; it requires the real browser subscription plus deployed stored-subscription receipt. A stale local flag is hostile input only and never evidence. |
| Visual bar control | MISSING_FUNCTIONALITY | The emitted surface is unavailable because the current published data is stale; the acting step captures that condition and the `Then` reports the missing user-visible control. |
| Solicited report stored through the real report boundary | REQUIRES_EXTERNAL | `@requires_external @deploy-blocked`; no deployed report boundary is present and no local stand-in was made. |
| Morning aviso through afternoon delivery and the report deep link on Android or installed iPhone | REQUIRES_EXTERNAL | `@walking_skeleton @requires_external @deploy-blocked`; the real-device/VAPID smoke remains launch evidence, not a fake local pass. |

## Gate result

The local pure and built-surface contracts are RED-ready. The three external journeys are explicitly
blocked, not faked. This is not a DELIVER handoff yet: independent acceptance review is approved,
and a fresh current published surface is required before U1-U7 or a source-blind device
exam can produce GREEN evidence.
