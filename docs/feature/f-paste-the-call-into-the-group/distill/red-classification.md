# RED classification history

Feature: `f-paste-the-call-into-the-group`
Slices entered: `slice-01`
Status: slice-01 entered JIT DISTILL 2026-08-09; RED recorded below

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
3. Scenarios drive production entry points only: the real `npm run build` over the installed
   public input, the emitted `dist/` served over HTTP, and Chromium at 390 px for visible
   observables. No fixture-only wiring may satisfy an oracle that the built surface owes.
4. Slice-01 must additionally record the observed branch of the `wa.me/?text=` live check
   (R5 in `requirement-checklist.md`): anchor verified working, or anchor struck and the
   clipboard island promoted to the floor. That record is a product fact, not test evidence,
   and later slices read it from here.
5. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the
   default for this feature; the one recorded relaxation (keystone slices 06 to 08 opened in
   parallel on instruction, HANDOFF §10 waiver 1) was a deliberate call for that build and
   carries no precedent here.

## Entries

### slice-01 — pre-delivery RED, observed 2026-08-09

Branch `build/f2-paste`, base `82be859`. Suite:
`tests/acceptance/f-paste-the-call-into-the-group/whatsapp-call-from-home.feature` (7 scenarios,
one a two-row Scenario Outline, so 8 runs) with steps in `steps/whatsapp-call-from-home.steps.ts`
and shared machinery in `steps/support/built-share-surface.ts` (shipped slice-04 precedent).

#### Commands observed

```sh
npm run test:at -- --tags "@feature-f-paste-the-call-into-the-group and @slice-01" > /tmp/paste-red.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1
```

Cucumber collected 8 scenario runs; all 8 failed. Summary line:
`8 scenarios (8 failed) / 89 steps (73 passed, 8 skipped, 8 failed) / 0m 12.98s`.
The 89 counts the file's 33 Gherkin steps plus the Before/After hooks the other suites register
globally; every hook passed. Every Given (isolated copy of the production project; `dist/` is
never copied, so it exists only if the build runs) and every When (the real `npm run build`,
which is `publish:surface --verify && astro build`, the emitted `dist/` served over real HTTP by
`vite preview`, Chromium at 390 px) passed. Every failure landed inside a Then at its individual
behavior oracle with the `WHAT/WHY/HOW` assertion message. Zero failures during import, fixture
construction, step matching, browser startup or runner setup: nothing BROKEN.

#### Scenario classification

| Scenario (run) | Observable exercised | Classification | Behavior oracle reached |
| --- | --- | --- | --- |
| Un toque abre WhatsApp con el llamado del día ya escrito | built home over HTTP, Chromium 390 px, light/normal | `MISSING_FUNCTIONALITY` | data oracle PASSED (five share fields populated for the top spot, both published copies of today agree); failed at the single-action oracle: "la tarjeta grande no ofrece ninguna acción de WhatsApp" |
| Con JavaScript apagado el botón sigue siendo un enlace que funciona | built home with page JavaScript disabled | `MISSING_FUNCTIONALITY` | anchor-presence oracle: 0 acciones de WhatsApp, ningún ancla `wa.me` en el HTML publicado |
| El mensaje y la página cuentan la misma historia, sin texto técnico | built home, top card DOM queried | `MISSING_FUNCTIONALITY` | message-vs-card oracle: no action carries a prewritten message to compare ("un ancla wa.me/?text= en la tarjeta grande de la home publicada") |
| La dirección del mensaje sigue a la configuración del sitio, nunca a un nombre fijo | copy repointed to `https://olas-registradas.example`, rebuilt, served, opened | `MISSING_FUNCTIONALITY` | config-derived-address oracle: no action carries any address to derive |
| La acción de WhatsApp respeta el presupuesto del primer vuelo | built home over HTTP | `MISSING_FUNCTIONALITY` | single-action oracle failed first; the 14 KB gz byte-ceiling oracle sits behind it (skipped) |
| El nombre más largo de la costa cabe completo en el mensaje y en el botón | surface mutated to promote the longest-name spot, rebuilt, served | `MISSING_FUNCTIONALITY` | full-name-in-message oracle: no action carries a message |
| La acción de compartir se ve terminada... (tema claro, movimiento normal) | U1-U7 audit against the rendered action + built-surface UI gate (gate exited 0) | `MISSING_FUNCTIONALITY` | U5: "la tarjeta grande no ofrece la acción de WhatsApp" |
| La acción de compartir se ve terminada... (tema oscuro, movimiento reducido) | same audit under dark scheme + reduced motion | `MISSING_FUNCTIONALITY` | U5: "la tarjeta grande no ofrece la acción de WhatsApp" |

Handoff condition satisfied: the only RED in the run is `MISSING_FUNCTIONALITY`. Every scenario
reached its production driving surface (the built page a surfer taps) before failing.

#### R5 — `wa.me/?text=` number-less anchor, observed branch (product fact)

Settled by live observation, recorded here per checklist R5 and contract rule 4; later slices
read the branch from this entry, they do not re-run the check.

- `https://wa.me/?text=<urlencoded>` with NO phone number returns HTTP 200 and redirects to
  `https://api.whatsapp.com/send/?text=...&type=custom_url&app_absent=0`.
- The redirect target and its `type=custom_url` parameter are the evidence: WhatsApp treats the
  number-less text link as a valid share carrier and opens its chat picker.
- **Branch: PASS. The JS-off anchor SHIPS.** The anchor is not struck; the clipboard island stays
  slice-02, an enhancement on top of the zero-JS floor, exactly as the Slice Plan row declares.
