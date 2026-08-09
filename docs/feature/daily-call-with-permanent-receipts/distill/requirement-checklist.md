# Requirement checklist: daily-call-with-permanent-receipts

Extracted at DISTILL-open (2026-08-08) from `feature-delta.md` (Slice Plan + Definition of
Done + plan notes), `05-scoring-engine.md` §10 (laws) + §11 (worked examples),
`04-ingest-pipeline.md` §3/§6 (run sequence + failure matrix), `domain-model.md` §5-§6,
`application-architecture.md` §4/§5/§10/§11, `09-design-system.md`, and the U1-U7 UI
mandates (`nw-ui-quality-mandates`). One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body.
Rows whose slice has not entered DELIVER yet are expected-uncovered (per-slice JIT); they
are visible here from day one so no requirement is silently dropped.

| # | Requirement | Category |
|---|---|---|
| R1 | A surfer sees a real spot's page with today's score (integer 0-100) and its call in Spanish, computed from this morning's actual model data (slice-01) | functional |
| R2 | Every hourly run fetches and snapshots all four Open-Meteo wave members; one prediction-log row per member per valid hour, natural key (spot_id, source, run_ts, valid_ts) per domain-model §5 (slice-01) | functional |
| R3 | The prediction-log write is the run's first durable side effect (after the raw archive), before scoring, building or publishing; a crash downstream of the snapshot never destroys the snapshot (slice-01) | functional |
| R4 | The prediction log is insert-only: a duplicate run cannot alter existing rows (conditional PUT, first write wins, duplicate acknowledged); a logged file re-reads byte-identical the next day (slice-01) | validation |
| R5 | Scoring runs from the input-space blend of usable members (arithmetic mean h/t, circular mean direction), per 05 §3.3 and adr-scoring-member-blend (slice-01) | functional |
| R6 | The learned-correction hook is wired and inert: no correction file, gate `no_file`, `Q_final = Q` exactly, `bias_applied` 0; turning learning on later is the appearance of a file, not a code change (slice-01) | functional |
| R7 | Yesterday's published call is readable in a browser per spot the next morning, rendered from `log/calls/v1`, exactly what the site said the day before, unchanged; the day's record is the dawn build (slice-01; route and day-stamp rule per Pre-requisites row 9) | functional |
| R8 | Every published-call row carries score_q, conf_value, conf_level, sub-scores, size_band, bias_gate, members_used/members_null per domain-model §6 (slice-01) | functional |
| R9 | Partial failure per 04 §6: a spot publishes with >= 1 usable wave member; an absent member means no rows this cycle and the build proceeds; zero usable members across every spot means the build refuses to publish and the previous publish keeps serving, manifest untouched (slice-01) | validation |
| R10 | Null observations are excluded, never fabricated: a null wind pair or tide series leaves the factor out (sub null, weight renormalized, `missing` names it, confidence capped) per 05 §3.6 (slice-01) | validation |
| R11 | Land-masked rows (H==0 && T==0 && dir==0) are translated to `land_masked: true` at the ACL and never averaged into a blend (slice-01) | validation |
| R12 | Law L1 bounds: every sub-score, q, q_final in [0,1]; score an integer in [0,100] | functional |
| R13 | Law L2 determinism: identical inputs give bit-identical outputs; no clock, env or filesystem reads | functional |
| R14 | Law L3 gate dominance: q <= sub.dir; as sub.dir -> 0, q -> 0 regardless of every other input | functional |
| R15 | Law L4 geometric-mean drag: q <= max(sub.size, sub.wind, sub.tide); any present factor at 0 forces q = 0 | functional |
| R16 | Law L5 direction monotone: sub.dir non-increasing in distance outside the window; 1 inside | functional |
| R17 | Law L6 size unimodal: q strictly increasing in h_eff on (0, h_ref), strictly decreasing past it; a swell strictly closer to h_ref in log space never scores lower | functional |
| R18 | Law L7 wind asymmetry: pure onshore at any speed x > 0 scores strictly below pure offshore at x; cross-wind term sign-symmetric | functional |
| R19 | Law L8 correction inertness and bounds: delta_q = 0 implies q_final = q exactly; |q_final - q| <= |delta_q|; monotone in delta_q; gate no_file implies both hooks identity | functional |
| R20 | Law L9 score/confidence separation: the score path accepts no spread/track/freshness input; perturbing confidence inputs never changes score | functional |
| R21 | Law L10 damage decomposition: q = exp(-(sum damages)); weakest_link = argmax damage with fixed tiebreak dir > size > wind > tide; all-zero damages imply weakest_link null | functional |
| R22 | Law L11 blend sanity: permutation-invariant; exclusions counted into members_null, never silent; circular mean of {359, 1} is 0, never 180 | functional |
| R23 | Law L12 rotational invariance: a constant rotation of all angles leaves every output unchanged; nothing keyed on hemisphere, window or timezone | functional |
| R24 | Law L13 period monotone below reference: longer period never lowers q when h_eff < h_ref; hEff(1.5, 16) = 1.90 and hEff(1.5, 8) = 1.34 | functional |
| R25 | Law L14 tide neutrality: range_class micro implies q independent of every tide input | functional |
| R26 | Law L15 rank consistency: rankSpots is a descending permutation, deterministic under ties; our_rank depends only on scores, baseline_rank_raw only on blended raw heights | functional |
| R27 | Law L16 null-factor honesty: null input implies sub null, factor in `missing`, no damage entry, q equal to the renormalized present-factor mean; confidence cap binds; weakest_link never names a null factor; neutral 1.0 and null distinguishable | functional |
| R28 | Law L17 freshness participation: no report ever implies c_fresh null and excluded from the product; a report implies c_fresh = max(exp(-h/36), 0.3), non-increasing; null and 1.0 distinguishable | functional |
| R29 | Day-one confidence levels render from model agreement alone: four tight members read alta, a period split reads media, the real 2026-08-08 Venao pull reads baja; a single-member day caps at baja via f(M) (05 §11) | functional |
| R30 | Twenty Pacific spots ranked best first on the home page, in Spanish; the order changes when the swell does; the spot list is a seed data file (slice-03) | functional |
| R31 | The top spot is unmistakably the call: oversized card, plain-language reason in Spanish a surfer can repeat (slice-04) | functional |
| R32 | Manana route carries tomorrow's own ranking and numbers; the site says plainly it will not pretend past tomorrow (slice-05) | functional |
| R33 | Every spot page shows today's and tomorrow's numbers, size in body-height words with metre ranges beside them (always with ~), and the best window (slice-06) | functional |
| R34 | Every ranked row carries a confidence level, reason one tap away in plain Spanish; unreported is not stale; the level never claims more certainty than the data earns (slice-07) | functional |
| R35 | An infra change that would expire or touch the prediction log, or drop a cost guardrail value, fails CI loudly naming what broke and why; the guardrail suite is demonstrated red once before green (slice-02) | build |
| R36 | The home page loads in under two seconds on emulated beach 3G; home document <= 14 KB gz; every route <= 100 KB first visit; a build over a ceiling fails CI naming route, measured bytes and ceiling; byte gate demonstrated red once (slice-08) | nfr |
| R37 | Nothing keyed on Panama: spots, regions, tide stations, timezones all come from seed data files (feature-wide; enforced by L12 plus seed-only configuration) | functional |
| R38 | No English route exists in the built site for this feature (the /en/ tree lands with F-READ-IT-IN-YOUR-LANGUAGE); all UI copy is the settled Spanish strings of application-architecture §10 | validation |
| R39 | U1: every text/surface token pair clears its declared WCAG ratio computed against the real backdrop (body >= 7:1 both themes, all text >= 4.5:1, hero-gradient worst stop included) | ui |
| R40 | U2: no horizontal scroll or clipped content at 390 px on any shipped route | ui |
| R41 | U3: interactive targets >= 44 px; primary actions in the thumb zone on phone-first surfaces | ui |
| R42 | U4: every animation and transition has a reduced-motion branch; nothing delays first meaningful content | ui |
| R43 | U5: loading, empty, error and success states are designed: the first morning with no yesterday explains itself; a no-data spot is honest, never a fabricated score; the staleness stamp always shows the absolute publish time | ui |
| R44 | U6: type comes from the declared scale and survives Spanish length (wrap and 2-line clamp, never a truncated confidence word) | ui |
| R45 | U7: colour, spacing, radii and motion exist as named tokens; no raw hex outside src/styles | ui |
| R46 | The staleness stamp on every reading route shows the real publish time (absolute time works with JS off) | ui |
| R47 | Reading routes ship zero render-blocking subresources and the browser never fetches forecast JSON (publish-time HTML rendering) | nfr |
| R48 | The keystone journey is walkable end to end on the built site: real model data snapshotted, scored, rendered; next morning yesterday's page shows the dawn build's numbers unchanged (the feature's single walking-skeleton e2e) | e2e |
| R49 | The raw prediction log stays private: no public route or built page serves predictions/v1 content; only log/calls/v1 backs the public yesterday surface (slice-01); no lifecycle expiration rule may ever reach the predictions/ prefix (slice-02, guardrail 4) | security |
| R50 | U1 para slice-04: el titular, puntaje y razón de la tarjeta superan 4.5:1 contra cada extremo real del fondo en los temas claro y oscuro. | ui |
| R51 | U2 para slice-04: la tarjeta no crea desplazamiento horizontal, recorte ni superposición a 390 px. | ui |
| R52 | U3 para slice-04: cada acción dentro del llamado mide al menos 44 por 44 px y sigue alcanzable en el teléfono. | ui |
| R53 | U4 para slice-04: el contenido aparece en el HTML inicial y toda transición queda anulada con movimiento reducido. | ui |
| R54 | U5 para slice-04: el éxito muestra el llamado completo sin carga artificial; un relato vacío o técnico degrada a tamaño, viento y ventana estructurados, sin imprimir datos crudos. | ui |
| R55 | U6 para slice-04: el puntaje conserva la escala heroica, la razón usa la escala declarada y el español se ajusta sin recorte a 390 px. | ui |
| R56 | U7 para slice-04: fondo, color, espaciado, radio, elevación y movimiento de la tarjeta usan tokens nombrados. | ui |

## Current DISTILL coverage

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| CI guardrail and prediction-prefix lifecycle safety | `tests/acceptance/daily-call-with-permanent-receipts/infrastructure-guardrails.feature`: all eight scenarios carry `@covers-R35`; lifecycle scenarios also carry `@covers-R49`. They drive production-owned `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` from `scripts/ci-local.mjs`, without supplying `commandRunner`. The default job runs the real `infra/test/guardrails.test.ts` and credential-free CDK synth phases over the named real `infra/` population; bounded declaration-only failures use a fresh empty `HOME`, no `AWS_*` overrides, and preserve `repoRoot/infra` plus `.ci-local-logs`. | Green 2026-08-09: 8 scenarios, 56 steps; fresh delegated approval recorded; carpaccio `SliceCleared`; shipped in `592d660` |
| Twenty-spot Pacific ranking | `ranked-pacific-spots.feature`: six `@slice-03` production-driven scenarios cover exact data-defined membership, explicit exclusions, zero and one-record policy refusals, a descending 20-row public ranking with Spanish calls, and an order change under altered swell direction. The existing sole browser journey also asserts that the actual home page visibly contains exactly that 20-ID set, its real source names, Spanish size-and-wind calls, descending varied scores, and no placeholder or raw-error text. | Green 2026-08-09: 6 scenarios and 36 steps pass through the production ports; 29 unit tests, UI gate, and browser journey pass; Vera recorded PASS; DES committed the slice in `df25ee6`. |
| Llamado principal de slice-04 | `top-call-card.feature`: ocho escenarios `@slice-04` construyen una copia aislada con el árbol de dependencias ya instalado, sirven `dist/` por HTTP y observan la home con Chromium. Uno conserva byte por byte la entrada pública instalada; los otros controlan el relato sin tocar producción. Dos perfiles estructurados contrastan pecho a cabeza, limpio, 06:00 a 09:30 con cabeza a un metro más, picado, 10:15 a 12:45 y un nombre largo, por lo que una frase fija no pasa. Cubren un solo "VE A", identidad y puntaje compartidos con el primer lugar, razón fiel a tamaño, viento y ventana, degradación de relatos vacíos o técnicos y U1-U7 en 390 px, ambos temas y movimiento reducido. U7 comprueba tokens de fondo, espaciado exterior e interior, radio y elevación; movimiento es no aplicable porque la tarjeta se observa estática. | RED activo 2026-08-09: los ocho escenarios llegan al HTML de producción y fallan solamente porque falta "VE A" o la razón fiel a los campos estructurados. Ningún escenario futuro fue creado. |
