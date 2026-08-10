<!-- des-feature-context-bootstrap: {"feature_id":"f-read-it-in-your-language","intent":"A visitor who does not read Spanish flips one toggle and gets the same call, the same reasons and the same report flow in English, and that choice still holds on the next visit.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: f-read-it-in-your-language

Intent: A visitor who does not read Spanish flips one toggle and gets the same call, the same
reasons and the same report flow in English, and that choice still holds on the next visit.

Workspace opened 2026-08-09 on lane `build/f2-i18n` (base `82be859`). This is the DOCS-ONLY
workspace creation: no acceptance test, no step definition and no production code exists for this
feature yet, per the JIT rule (`HANDOFF.md` §1). Epic row: `docs/epic/surfs-up-panama/epic-delta.md`
row 11, the last row on purpose. Decision source: `docs/DISCUSS-decisions.md` 8, "Spanish first,
English toggle." Route and copy authority: `application-architecture.md` §4 (route map and language
routing), §10 (copy, exact, both languages), §13 (og:locale es_PA with en alternate).

The scheduling fact that shapes this whole plan: this feature is deliberately last so that ONE
translation pass covers copy that has finished moving (epic row 11 justification; `HANDOFF.md` §6
item 3: "placed last on purpose so one translation pass covers settled copy"). Ten other lanes are
adding Spanish UI strings right now. So the plan is written for a pass that runs AFTER those lanes
settle, and its early slices are the mechanical instruments that make the pass checkable: gates
that name exact offenders, an inventory derived from structure rather than a hand-kept list, and a
route-map conformance check over the emitted tree. A bracketed English string such as
`strings.en.spot.reportCta = '[report CTA copy pending]'` is treated as MISSING coverage
everywhere in this file, never as present.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| READ-01 | A visitor who does not read Spanish taps "English" at the top of the home page and reads today's twenty spots ranked at `/en/`, flips to `/en/tomorrow/`, and taps "Español" to land straight back on the twin page. Every link on an English page keeps them in the English tree, so the address they save opens in the language they chose, with no script deciding for them. | pending | @walking_skeleton | Thinnest end-to-end vertical of the epic promise, and it is a RECREATION, not an invention: the `/en/` home and tomorrow routes existed (added in `b116dbd`) and were deliberately deleted in `0f04f07` because half-bracketed English was worse than honestly Spanish (`HANDOFF.md` §6 item 3, verbatim: "Feature 11 recreates them properly with real translation"). The copy cost is nearly zero because `src/i18n/strings.ts` lines 103 to 131 already carry the full English home and report trees marked `verbatim` from `application-architecture.md` §10. The real work is the seam: `src/layouts/Base.astro` line 31 silently DROPS the `altPath` prop it declares at line 28, renders no toggle at all, and line 57 emits only a self-referential `<link rel="alternate" hreflang="es">`, against §4 which requires the toggle as a plain link to the twin URL (top of page, 44 px target), `hreflang` alternates on every page and `lang` per page. `site` is configured (`astro.config.mjs` line 25, locked 2026-08-09 in `535de91`), so the alternates go absolute in this slice, closing Base's own "must become absolute then" comment (lines 5 to 7). `RankedList.astro` is already locale-parameterized but renders Spanish regardless of locale: hardcoded band and wind maps (lines 34 to 48), `VE A` (line 85, en twin "GO TO {SPOT}" settled §10), `Ver el llamado` (line 99, settled in NO language, Pre-requisite 1), the fallback line 57, and `summary.call[locale]` (line 88) which is `undefined` for `en` because `src/data/forecast.ts` line 64 fills only `es` from the surface's `call_es`. The English call line is gated on Pre-requisite 2 (`call_en` source). `Confidence.astro` line 53 and its es-only helpers (`src/scoring/confidence.ts` lines 82 to 109) render Spanish on every row; the reason sentences have no settled English (Pre-requisite 1). No JS locale machinery of any kind: §4 forbids sniffing and redirects outright because both break caching and surprise people on bad signal, so "the choice holds" is a property of the URL tree plus locale-preserving links, which is why the link-discipline observable (crawl the built `/en/` documents, assert every internal href stays in the tree except the toggle) belongs to this slice and not to a later audit. Byte ceilings are unchanged: §5 budgets are per document and the page-weight gate runs inside the build against whatever was emitted (`astro.config.mjs` lines 10 to 14), so the new documents are inside the gate automatically. |
| READ-02 | Nobody can ship a half-covered string: CI fails naming the exact file, key path and missing language whenever a user-facing string exists in one language and not the other, including the strings the other ten lanes are adding right now. | pending | depends-on READ-01 | The gate derives coverage from STRUCTURE, never from a hardcoded key list, in three detectors. (a) Placeholder scan: any leaf of `strings` or any `label` in a `Record<Locale, string>` matching `^\[.*\]$` is missing coverage; this catches `strings.en.spot.reportCta` (`strings.ts` line 133) today and any future scaffold bracket the day it lands. (b) Single-language naming scan: TypeScript already enforces key parity inside `strings.ts` (`Record<Locale, UiStrings>`, line 69), so the type system is the first detector and the gate's real work is the sites TS cannot see: fields and exports whose NAME encodes one language with no twin, the established `_es`/`Es` convention: `call_es` (`src/publish/static-surface.ts` line 32; `src/publish/reading-state.ts` line 11), `message_es`/`notice_es` (`reading-state.ts` lines 21 to 29), `formatSizeEs`/`formatBestWindowEs` (`src/publish/display-format.ts` lines 24, 32), `CONFIDENCE_LEVEL_WORD_ES`/`MODEL_AGREEMENT_ES`/`NO_BEACH_REPORT_ES`/`confidenceReasonEs` (`src/scoring/confidence.ts` lines 82 to 109), `spanishCall`/`spanishWind`/`spanishSizeBand` (`src/pipeline/build.ts` lines 268, 308, 312). A lane that adds `foo_es` next week fails the gate the same day. (c) Emitted-surface scan: after a build, no `/en/` document may contain a rendered `undefined` or an es-only fallback string, the exact failure shape `HANDOFF.md` records for the 19-of-20 missing-fields incident where every gate stayed green while pages would have rendered `undefined`. Enforcement is a RATCHET, not a report: a committed exceptions file (one line per offender: file, identifier, reason) that the gate asserts only ever shrinks, empty by READ-08. A reporting-only gate is not a gate (project CLAUDE.md: a skipped job is not a green job); a blocking gate with an explicit shrinking debt file fails on NEW half-coverage immediately, which is the entire point of running this lane's gates while ten lanes are adding copy. Justification of the hard part: the `_es` heuristic must match only the snake `_es` suffix and the trailing `Es`/`SPANISH` camel convention, never English words ending in "es"; and structure cannot see copy composed inside template literals, which is exactly the residue READ-03 exists to catch. Contended seam: the local CI jobs table (`scripts/ci-local-core.mjs`, ten jobs today) is also amended by the F-TELL-US and F-BILL lanes; strictly serial on that file per lane discipline (Pre-requisite 5). |
| READ-03 | Nobody can hide a string from the translation pass: CI fails naming file and line when a user-facing string is written inline in an `.astro` template instead of flowing from a declared copy home, because an inline Spanish literal is precisely the string the pass will silently miss. | pending | depends-on READ-02 (shares the ratchet mechanism and the CI seam) | The day-one offender list proves the detector against reality and doubles as the pass's work order: `RankedList.astro` lines 34 to 48 (two full Spanish vocabulary maps duplicating `size-bands.ts` labels and §10 wind words), 55 (call template `viento X, mejor de A a B`), 57 (`Condiciones publicadas para hoy.`), 85 (`VE A`), 99 (`Ver el llamado`); `SpotDetail.astro` lines 39, 46, 63, 75, 89; `Confidence.astro` line 53; `spots/[slug]/ayer.astro` lines 35, 45, 46, 48; `404.astro` lines 13 to 17. The gate also carries a copy-home REGISTRY: modules that may legitimately export copy (`src/i18n/strings.ts`, `src/data/size-bands.ts`, and, until READ-05/READ-08 relocate or twin them, `src/scoring/confidence.ts`, `src/publish/display-format.ts`, `src/publish/reading-state.ts`, `src/pipeline/build.ts`), so copy in a registered home is legal and copy inline in a template is not. Justification of the hard part, stated because it is the reason this gate usually does not exist: the false-positive surface. Class names (`ranked`, `cta`, `home-primary`), ARIA token values (`aria-current="page"`), `data-*` values (`data-field="back-to-list"`, `data-reveal-shell`), `datetime` attribute formats, CSS inside `is:inline` style blocks (`ayer.astro` lines 36 to 40), code comments and format tokens (`≈`, `–`, the hour-padding regex in `display-format.ts` line 61) are all string literals that are NOT copy. So the detector scans POSITIONS, not literals: template text nodes plus an allowlist of copy-bearing attributes (`title`, `alt`, `aria-label`, `placeholder`), with a natural-language heuristic (diacritics, or two or more words with lowercase letters) for literals in registered non-copy `.ts` modules. Anything genuinely ambiguous goes into the same explicit shrinking exceptions file as READ-02 with a written reason per line, never a silent skip: a guard that silently stops looking is worse than a failing one. |
| READ-04 | The route map cannot lie: the build fails when `src/i18n/routes.ts` and the emitted tree disagree, naming the dead builder, the missing twin or the tree-crossing link. | pending | depends-on READ-01 | Today's breakage, verified on disk 2026-08-09: `routes.ts` lines 9 to 23 build five `/en/` URL families while `src/pages/` contains no `en/` directory at all, because the tree was removed in `0f04f07` per `HANDOFF.md` §6 item 3; so all four surviving `/en/` builders produce links to routes that do not exist. `ReportCapture.astro` line 44 and `ReportShell.astro` line 32 pass `altPath` into that dead tree, and only `Base.astro` line 31 dropping the prop keeps the broken links out of the emitted HTML: the damage is latent dead code plus a §4-nonconformant head (a lone self-referential `hreflang="es"`, no pair). `routes.ts` also has NO yesterday builder even though `HANDOFF.md` §6 item 2 settles the twin as `/en/spots/{slug}/yesterday` ("Settled, not a proposal") and `ayer.astro` line 35 hardcodes its own `currentPath` instead of reading the route map. This slice adds the `yesterday` builder, routes `ayer.astro`'s path through it (bounded change to a keystone-owned page: the route map is this feature's seam), and ships the conformance check, derived from structure: the es-to-en path mapping lives in `routes.ts` alone (`manana`↔`tomorrow`, `ayer`↔`yesterday`, `reportar`↔`report`, `reportado`↔`reported`, `sin-senal`↔`offline`, `acerca`↔`about`, else identical); after a build, every emitted Spanish document must have its English twin and every English document must map back, and every builder output must resolve to an emitted file. Routes that later slices ship live in the same shrinking exceptions mechanism as READ-02/03, empty by READ-08, so a NEW Spanish page added by any lane fails the gate until its twin exists or its debt line is written down with a reason. Deriving the expected set from the emitted Spanish tree rather than a route list is what makes this catch pages the other ten lanes are adding right now. |
| READ-05 | A visitor taps a ranked row on `/en/` and gets that spot's own page in English: today's and tomorrow's numbers, size in body-height words, the window; and the English yesterday page states the receipt honestly instead of inventing an English past. | pending | depends-on READ-04, depends-on Pre-requisites 1 and 3 | The spot page is a translation of settled structure: `SpotDetail.astro` is locale-parameterized already, size-band English labels are complete in `size-bands.ts` (the one bilingual `Record<Locale, string>` site that needs nothing), and the §10 en column settles the shared strings. What is NOT settled in English: the five hardcoded strings this page carries (`SpotDetail.astro` lines 39, 46, 63, 75, 89) and the display formatters, which are es-only by name and content (`formatSizeEs`, `formatBestWindowEs`, `Ventana`, `m o más`: `display-format.ts` lines 24 to 49); their en twins are Pre-requisite 1 copy, and the format LAW (§10, decision 18: body-height word first, range second, always `≈`, the open-ended band never claims a ceiling) is locale-independent and must survive translation intact. The yesterday half carries this feature's one genuinely hard honesty problem, Pre-requisite 3: `PublishedReceipt` carries `score_q` and `call_es` and nothing else (`reading-state.ts` lines 5 to 12), receipts are immutable by the epic's whole premise, so a receipt minted before English existed can NEVER gain an English narrative. The English yesterday page must either quote the Spanish call as the immutable historical artifact it is, or state the absence; retroactively synthesizing an "English receipt" would claim more than the data earns, which the project CLAUDE.md names as the one rule the whole product rests on. Recommendation recorded in Pre-requisite 3; the choice is DESIGN's, not made here. Slug discipline costs nothing by design: the slug IS `spot_id`, language-neutral (§4, domain model §13), so `/en/spots/playa-venao/` mirrors `/spots/playa-venao/` with no slug table and a shared URL works in both trees. |
| READ-06 | A visitor on the English tree taps once and the pasted call is English (date, spot, score, size, wind, window, confidence, link), and the pasted link previews with `og:locale` `en` alternate beside `es_PA`. | pending | depends-on f-paste-the-call-into-the-group slices 01 to 04 | The slice NUMBER is reserved, not chosen here: `docs/feature/f-paste-the-call-into-the-group/feature-delta.md` Out-of-scope row 1 names "READ-06 translates this feature's template and OG shape after they exist", the single piece of prior slice thinking for this feature found anywhere in the repo. The English template column is already settled verbatim in §10 ("SURF {date} / Best: {spot}, {score} / {size} and {wind}. {window}. / {level} confidence. / {url}?b={build_id}"), and §13 settles the OG shape (`og:locale` es_PA plus en alternate on every page). "After they exist" is load-bearing: translating a share island, template composer and OG meta block that have not landed would ship sentences that are not true at the moment they ship, the same rule that held `no_snapshot` back to F-TELL-US slice-04. Cross-lane seam, named before dispatch per the `HANDOFF.md` §7 lesson: `Base.astro`'s head is a contended file and f-paste slice-03's meta block lands first and alone; this slice amends, never races. One open sub-question inherited rather than created: the OG card IMAGE (f-paste slice-04) renders Spanish size and confidence words; a per-locale image doubles P7 PUT volume, which is exactly the cadence question already open in f-paste Pre-requisite 3. Recommendation: one Spanish image serves both locales at launch (the preview crawler reads `og:locale` correctly either way and the group the preview targets is the Spanish-speaking one); folded into that existing Andres decision, not decided here. |
| READ-07 | A visitor on the English tree taps a real English report CTA, answers the three questions in English, and every state of the flow (queued, arrived, revealed, refused, counter) reads in English, while the record on the wire stays byte-identical to a Spanish visitor's. | pending | depends-on READ-05, depends-on f-tell-us-what-you-saw-cold slices 01 and 03 to 05 | The cheapest translation in the plan and the one that closes the feature's founding placeholder: the entire English report tree already sits `verbatim` in `strings.ts` lines 112 to 131 (three questions, all 14 option labels, submit, noscript, settled §10), and the one bracketed string in the codebase is this flow's entry point, `strings.en.spot.reportCta = '[report CTA copy pending]'` (line 133; the Spanish twin `¿ESTUVISTE? CUÉNTANOS` is §14 wireframe copy with no settled English, Pre-requisite 1). The flow states beyond capture (queued, arrival, reveal, refusal, counter, share prompt) have settled §10 en columns but live in the report island and reveal renderer that F-TELL-US is building right now; translating states that do not exist would be decoration, so this row waits for that lane's slices. The wire discipline is the row's hard constraint and it is already engineered: option `value` tokens are the canonical language-neutral enums of `src/data/report-vocab.ts` (`clean|choppy|blown_out`, `bad|ok|good|epic`) and only `label` is locale copy (`strings.ts` lines 30 to 39 document exactly this split), so locale must never touch the committed record; domain model §7.4 replays a queued report byte-identical, which means an English-labeled report and a Spanish-labeled report of the same session are the same bytes on the wire. If the island lands with hardcoded Spanish literals instead of reading `strings[locale]`, READ-03's gate names them the day it lands and this slice moves them, which is the gates-before-pass ordering paying for itself. |
| READ-08 | Every page the Spanish site has, the English site has; the three exceptions files are empty; the gates flip from ratchet to absolute; and the epic sentence is true end to end: the same call, the same reasons, the same report flow in English, and the choice holds on the next visit because every link keeps you in your tree. | pending | depends-on READ-06, READ-07, and Pre-requisite 6 (all copy-shipping lanes settled) | This is the row the epic placed the feature LAST for: "one translation pass covers settled copy instead of translating the same strings twice" (epic row 11). Its scope is DERIVED, not listed: whatever the emitted Spanish tree and the copy registry contain at settle time, which by the epic plan may include the offline page and A2HS hint (F-WORKS, §10 en settled), the staleness stamp (§10 en settled), the day-one empty state and scorecard copy (F-SHOW, counter copy §10 settled, headline copy not yet written), weakest-link phrasing (F-SEE, not yet written), and push copy (F-TELL-ME, not yet written); each lands with §10 verbatim English where it is settled and through the Pre-requisite 1 sign-off batch where it is not. The pass also empties the three ratchets in the same motion: coverage exceptions to zero (READ-02), copy-home exceptions to zero and the interim es-only homes twinned or relocated (READ-03), route expected-missing to zero (READ-04), after which each gate drops its exceptions mechanism entirely and runs absolute. That deletion is part of this row's Done: a permanent exceptions file is how ratchets rot into allowlists. The pass never rewords Spanish: strings marked `verbatim` come word for word from §10 in BOTH languages and the Spanish register check stays Andres-and-cousin territory (`application-architecture.md` Decisions needing Andres 6); translation adds twins, it does not edit originals. This row cannot start before the other lanes stop moving copy, and that is a scheduling gate owned by the coordinator (Pre-requisite 6), not a code dependency, which is why it is a named slice rather than an ambient hope. |

Notes on the plan:

- Row order is dependency order, backward only. Same convention as the keystone and both sibling
  features: an empty Annotation cell would mean parallel-safe once the rows above have landed;
  no row in this plan has an empty cell because every one either gates or is gated.
- **Timing versus the ten concurrent lanes.** READ-01, READ-04 and READ-05 touch only surfaces
  that already shipped with the keystone, so they are start-safe apart from the named contended
  seams (Pre-requisite 5). READ-02 and READ-03 are MEANT to land while the other lanes still move:
  their ratchets catch new half-covered or inline copy at add time instead of at pass time.
  READ-06 and READ-07 wait for their producing lanes by construction. READ-08 waits for settle.
  This is how "gates early, pass last" stays coherent with the epic's placed-last intent.
- **A bracketed string is a missing string.** Stated once more because it is the point:
  `[report CTA copy pending]` and any future bracket is MISSING coverage (READ-02 detector (a)),
  never "English exists for this key". The scaffold header of `strings.ts` (lines 1 to 5) already
  says brackets mean no exact copy exists; the gate mechanizes that sentence.
- **No sentence ships before it is true.** No slice renders an English state whose Spanish
  original does not exist yet, and no slice invents product copy: unsettled English strings go
  through the Pre-requisite 1 sign-off batch, exactly as the sibling features route their missing
  Spanish strings through Andres (F-TELL-US Pre-requisite 8).
- **No JS locale machinery, ever.** §4: no sniffing, no redirects; both break caching and surprise
  people on bad signal. Persistence is the URL tree. A slice that adds a locale cookie or an
  `Accept-Language` branch violates the accepted design; the toggle is a plain 44 px link.
- **No em dashes in any new UI string, either language** (project CLAUDE.md copy rules; zero
  technical text on the Spanish surface, and this feature extends the same bar to the English one:
  no Spanish leakage on `/en/` except the immutable-receipt quote if Pre-requisite 3 resolves that
  way).
- **Byte discipline.** The English tree roughly doubles document count; §5 ceilings are per
  document and unchanged, and the page-weight gate runs inside every build against the emitted
  tree (`astro.config.mjs` lines 10 to 14, 33), so every new route is born inside the gate. The
  toggle link and second hreflang line cost tens of bytes per document.
- **File discipline of this workspace.** This lane owns `docs/feature/f-read-it-in-your-language/`
  only. Two follow-ups are therefore OWED elsewhere and recorded here so they are not lost:
  (a) the epic row flip to `in-flight` with the workspace link (`docs/epic/` is outside this
  lane); (b) expectation charters under
  `docs/product/expectations/f-read-it-in-your-language/` at each slice's DISTILL open, per the
  `HANDOFF.md` §4 convention the sibling features follow. Neither is created here.

## Wave: DISCUSS / [REF] Slice classification

Required at DISTILL open per `HANDOFF.md` §4 (classify every slice as user-visible or non-visual),
recorded now so it is not invented later. Charters will live under
`docs/product/expectations/f-read-it-in-your-language/` (not created by this lane; see file
discipline note above).

| Slice | Classification | Note |
|---|---|---|
| READ-01 | user-visible | The toggle, the English home and tomorrow pages ARE the slice. U1 to U7 rows and a U8 observation apply at 390 px, both themes, reduced motion aware; the 44 px toggle target is a §4 requirement, not a preference |
| READ-02 | non-visual | Emits no HTML; its product is a red CI line naming a half-covered string. Fabricating pixel checks would be dishonest. Its charter examines the gate's terminal output against a deliberately seeded half-covered fixture, the same shape F-TELL-US slice-02 uses for its guardrail gate |
| READ-03 | non-visual | Emits no HTML; its product is a red CI line naming an inline literal by file and line. Charter examines terminal output against a deliberately seeded inline Spanish literal in a scratch component, including one seeded false-positive candidate (a class name) that must NOT fire |
| READ-04 | non-visual | Changes one URL builder and ships a build-time conformance check; the only rendered delta (ayer's path now flowing through the route map) is byte-identical output. Charter examines the check's output against a seeded dead builder and a seeded twinless page |
| READ-05 | user-visible | The English spot page and English yesterday page are rendered surfaces; the yesterday page's honest-receipt state is the most sensitive copy this feature renders |
| READ-06 | user-visible | The pasted English text and the link preview are user-observable outside our own site; the observation includes a real WhatsApp paste, matching the f-paste charters |
| READ-07 | user-visible | The English CTA, capture form and every flow state are rendered; the U8 observation walks the three taps in English |
| READ-08 | user-visible | The completed tree is the observable: the examination walks Spanish pages and their twins side by side and runs all three gates in absolute mode |

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | The epic promise is walkable end to end: from any page, one tap lands on the twin page in the other language; the call, the confidence reasons and the full report flow read in English; and the choice holds on the next visit because the tree is the persistence: no sniffing, no redirects, no cookie, every internal link locale-preserving (§4). |
| 2 | The translation-coverage gate is green in ABSOLUTE mode: zero bracketed placeholders in either language tree, zero single-language-named fields or exports without a twin on any user-facing surface, zero rendered `undefined` in any emitted document, and its exceptions mechanism deleted. |
| 3 | The no-hardcoded-copy gate is green in ABSOLUTE mode: every user-facing string in every `.astro` template flows from a registered copy home; the registry has shrunk to the intended homes; its exceptions mechanism deleted. |
| 4 | Route-map conformance is green in ABSOLUTE mode: the emitted es and en trees are twins under the `routes.ts` mapping, zero dead builders, zero twinless pages, the `yesterday` builder exists and `ayer.astro` reads it; `hreflang` pairs are absolute against the configured `site` on every page and `og:locale` carries es_PA with the en alternate (§13). |
| 5 | Not one `verbatim` string was reworded in either language, no new UI string carries an em dash, the Spanish surface carries zero English, and the English surface carries zero Spanish except the immutable-receipt quote if Pre-requisite 3 resolves to quoting. |
| 6 | The wire is locale-blind: an English-labeled report commits and replays the same bytes as a Spanish one; option `value` tokens come only from `report-vocab.ts` and `size-bands.ts`; zero locale fields on any committed record. |
| 7 | Byte gate green across the doubled tree: every document at or under its §5 ceiling, first-visit route caps held, the toggle and alternate links inside the existing envelopes. |
| 8 | U1 to U7 checks green per visible slice through the built surface, and a sealed source-blind Vera PASS against each visible slice's U8 observation; the three non-visual slices carry examined terminal-output charters instead, per their recorded rationales. |
| 9 | Every Slice Plan row above is flipped `shipped`, and the English copy signed off through Pre-requisite 1 is recorded as settled copy (a §10 amendment is the natural home), so the next feature inherits settled strings, not this workspace's table. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| JS locale sniffing, `Accept-Language` handling, redirects, a locale cookie or storage | Never. §4 forbids them by design: both break caching and surprise people on bad signal. The toggle is a plain link; persistence is the URL tree |
| Translating slugs or spot names | Never. The slug IS `spot_id`, language-neutral (§4, domain model §13), so one shared URL works in both trees; that property is the feature's cheapest asset |
| Rewording any Spanish string; the Spanish register check ("picado", "destrozado") | Andres via the cousin's group (`application-architecture.md` Decisions needing Andres 6). This feature adds twins; it never edits originals |
| Translating wire tokens or enums (`size_band`, wind, quality) | Never. `report-vocab.ts` and `size-bands.ts` tokens are the canonical language-neutral wire vocabulary; only `label` is copy |
| A third locale or second country | Later epic (BRIEF constraint 5). This feature proves the seam (copy not bound to one locale); it does not build locale plumbing beyond `es`/`en` |
| Service worker precache of `/en/` routes, the English offline page mechanics | F-WORKS-WITH-NO-SIGNAL owns the SW file (settled seam, F-TELL-US notes). This feature hands it the en URL list through the route map and translates the §10-settled offline copy in READ-08; it never edits the SW |
| English push copy mechanics | F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE owns push; READ-08 translates its settled copy only if it shipped by settle time |
| A per-locale OG card image pipeline | Folded into f-paste Pre-requisite 3 (OG cadence, Andres); recommendation recorded in READ-06: one Spanish image serves both locales at launch |
| Prose documentation, ADRs, this workspace | Never user-facing; the product surface only |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **The English copy sign-off batch.** Every user-facing string with no settled English anywhere (§10 has no en column for them, and `strings.ts` brackets one of them). The full list, from the Translation inventory below: the report CTA (`¿ESTUVISTE? CUÉNTANOS`, §14 wireframe, en bracketed at `strings.ts` 133); `Ver el llamado` (`RankedList.astro` 99, settled in NO language); `Volver a la lista` (`SpotDetail.astro` 63, `404.astro` 17); the four spot-page empty states (`SpotDetail.astro` 39, 46, 75, 89); the 404 set (title, heading, body: `404.astro` 13 to 15); the yesterday-page set (`${spot.name} ayer`, `Así estuvo ayer`, `puntos`, `Publicado a las`, the empty-state message: `ayer.astro` 35 to 52, `reading-state.ts` 46); the confidence reason sentences (`confidence.ts` 88 to 98; §10 settles only the level words); the ranked-list fallback (`Condiciones publicadas para hoy.`, `RankedList.astro` 57) and builder fallback (`Condiciones variables`, `build.ts` 322); the display-format words (`Ventana`, `m o más`); the toggle labels themselves ("English"/"Español"). Recommendation: one batch table authored at READ-01 DISTILL open, approved by Andres asynchronously; the cousin mechanism is a Spanish-register control and is not needed for English. Inventing this copy inside a slice is out of scope, same rule as F-TELL-US Pre-requisite 8. | READ-01 (confidence reason, `Ver el llamado`, toggle labels), READ-05 (most of the list), READ-07 (the CTA), READ-08 (stragglers) | Andres | open |
| 2 | **The English call-line source.** The per-spot narrative is Spanish-only END TO END by schema: the builder composes `spanishCall` from structured fields (`build.ts` 268 to 270), publishes it as `call_es` (`static-surface.ts` 32), and the frontend adapter fills only `call.es` (`forecast.ts` 64), so `summary.call['en']` is `undefined` today. Because the composition is a pure function of `size_band`, `wind_state` and `best_window`, the English twin is mechanical either way. Options: (a) builder emits `call_en` beside `call_es` (recommendation: honors P1 "client renders, never computes", one composition function locale-keyed, and the coverage gate's `_es`-naming detector then passes structurally); (b) the en pages compose client-side from the structured fields through en formatters. Touches the published-surface schema and `src/pipeline/build.ts`, which the producer lane owns: contended, serial. | READ-01's call line; READ-05 inherits the same answer | DESIGN plus producer lane; Andres if the schema question is contested | open |
| 3 | **What the English yesterday page shows for receipts that predate English.** Receipts are immutable and carry `call_es` only (`reading-state.ts` 5 to 12): no receipt minted before this feature can ever gain an English narrative, and that is a property of the product's core promise, not a bug. Options: (a) quote the Spanish call verbatim as the immutable artifact, with English frame copy around it (recommendation: a receipt is a quote of what we published; quoting it in its original language is the honest reading, and "never claim more certainty than the data earns" extends naturally to "never claim we said something in a language we did not say it in"); (b) render score plus structured fields only and state that the narrative exists in Spanish. Either is honest; retroactive synthesis is not an option. | READ-05's yesterday half | DESIGN, with Andres on the frame copy (folds into Pre-requisite 1's batch) | open |
| 4 | **Absolute alternate URLs.** `Base.astro`'s own comment (lines 5 to 7) says hreflang hrefs are relative until the production domain settles and must become absolute then. Settled by `535de91` (2026-08-09): `site` is `https://d1j9u9fxnap4es.cloudfront.net` (`astro.config.mjs` 25), the single owner of the absolute host. Known accepted cost, same as f-paste Pre-requisite 1: the CloudFront hostname appears in the alternates until the domain lands, and the swap is one config edit plus a republish. | nothing; resolved inside READ-01 | answered | ANSWERED 2026-08-09 |
| 5 | **Contended seams, strictly serial, named before dispatch** (`HANDOFF.md` §7 lesson). (a) `src/i18n/strings.ts`: every copy-shipping lane edits it and this feature's gates read it; it is the single most contended file in this epic's endgame. (b) `Base.astro` head: f-paste slice-03's OG block lands first and alone; READ-01's toggle and alternates coordinate with it. (c) `scripts/ci-local-core.mjs` jobs table: amended by F-TELL-US slice-02 and the F-BILL lanes; READ-02/03/04 add jobs serially. (d) `src/pipeline/build.ts` and the published-surface schema: producer lane, Pre-requisite 2. | dispatch timing of READ-01/02/03/04/06; not the planning | coordinator | open |
| 6 | **The settle gate for READ-08.** The pass runs once, after the copy-shipping lanes' slices are flipped `shipped` or explicitly parked; running it earlier re-creates the translate-twice cost the epic ordered this feature last to avoid. The coordinator owns declaring settle; the ratchet exception files measure exactly how much the pass still owes at any moment, so "how close is settle" is a number, not a feeling. | READ-08 | coordinator (Andres declares settle) | open |
| 7 | **Missing planning artifacts, named so nobody trips on them.** Both sibling deltas cite `BUILD-ORDER.md` and `plan-cluster-*.md` (f-paste rows 1, 4, 5; F-TELL-US Pre-requisites throughout), but those files exist in NO branch of this repository and not in the coordinator worktree either (verified 2026-08-09: `git log --all --name-only` over all refs, plus disk globs of `/Users/andres/psb-i18n` and `/Users/andres/panama-surf`). The only prior slice thinking for THIS feature found anywhere is f-paste's Out-of-scope row reserving READ-06, which this plan honors by number. Also: the worktree copy of `HANDOFF.md` is older than the authority at `/Users/andres/panama-surf/HANDOFF.md` (F-TELL-US Pre-requisite 10); §6 items 2 and 3 were verified verbatim-identical in both copies before being relied on here. | nothing; carried so the next agent does not rediscover it | coordinator (recover or re-derive the cluster plans) | open |

## Translation inventory (verified on disk 2026-08-09, base `82be859`)

The mechanical work order for the pass. Four categories: what is bracketed (missing by its own
admission), what is hardcoded in templates (invisible to any key-based pass), what is
single-language by schema or module, and what is already complete. READ-02/03/04 mechanize this
table; READ-08 empties it. "en settled" means a verbatim English string exists in
`application-architecture.md` §10; "en unsettled" strings are Pre-requisite 1.

### A. Bracketed placeholder (missing coverage, the feature's founding debt)

| Site | String | Status |
|---|---|---|
| `src/i18n/strings.ts` 133, `strings.en.spot.reportCta` | `[report CTA copy pending]` | es twin `¿ESTUVISTE? CUÉNTANOS` is §14 wireframe copy; en unsettled. Closed by READ-07 via Pre-requisite 1. Recorded, deliberately NOT fixed by this workspace |

### B. Spanish-only copy hardcoded in templates (READ-03's day-one offender list)

| Site | String(s) | en status |
|---|---|---|
| `src/components/RankedList.astro` 34 to 42 | `spanishSizeBand` map, second home for the seven band labels | en labels already exist in `size-bands.ts`; the map itself is the offense |
| `src/components/RankedList.astro` 44 to 48 | `spanishWind` map (`limpio`, `picado`, `destrozado`) | en settled §10 Q2 (`Clean`, `Choppy`, `Blown out`) |
| `src/components/RankedList.astro` 55 | call template `{size}, viento {wind}, mejor de {start} a {end}.` | en unsettled; resolution is Pre-requisite 2 |
| `src/components/RankedList.astro` 57 | `Condiciones publicadas para hoy.` | en unsettled (es itself is not §10 copy) |
| `src/components/RankedList.astro` 85 | `VE A {SPOT}` | en settled §10 (`GO TO {SPOT}`) |
| `src/components/RankedList.astro` 99 | `Ver el llamado` | settled in NO language; Pre-requisite 1 |
| `src/components/SpotDetail.astro` 39, 46, 75, 89 | four empty states (`Sin datos de tamaño...`, `Sin ventana estimada...`, `Todavía no hay número de hoy...`, `...de mañana...`) | en unsettled |
| `src/components/SpotDetail.astro` 63 | `Volver a la lista` (also `404.astro` 17) | en unsettled |
| `src/components/Confidence.astro` 53 | `Confianza {word}` | level words en settled §10 (`high / medium / low confidence`; note the word ORDER flips in English) |
| `src/pages/spots/[slug]/ayer.astro` 35, 45, 46, 48 | title `{spot} ayer`, `Así estuvo ayer`, `puntos`, `Publicado a las {hora}` | en unsettled; page-level answer is Pre-requisite 3 |
| `src/pages/404.astro` 13, 14, 15 | `Esa playa no existe`, `No encontramos esa playa`, body sentence | en unsettled |

### C. Single-language by schema or module (READ-02 detector (b)'s day-one list)

| Site | Shape | Note |
|---|---|---|
| `src/publish/static-surface.ts` 32 | `SurfaceCall.call_es: string` | the published surface's narrative is es-only by field name; Pre-requisite 2 |
| `src/publish/reading-state.ts` 11, 21 to 29 | `PublishedReceipt.call_es`, `ReadingState.message_es` / `notice_es` | receipts immutable: Pre-requisite 3. The stale notice's en IS settled (§10 staleness stamp); the empty message's en is not |
| `src/publish/reading-state.ts` 46, 54, 60 to 62 | empty-state message, stale notice, `spotName` placeholder fallback | the `spotName` one-spot ternary is a scaffold flag in its own right, flagged not fixed |
| `src/data/forecast.ts` 31 to 32, 64 | `call: Partial<Record<Locale, string>>` filled with `es` only | `call[locale]` on an en page is `undefined` today; READ-02 detector (c) exists for exactly this |
| `src/scoring/confidence.ts` 82 to 109 | `CONFIDENCE_LEVEL_WORD_ES`, `MODEL_AGREEMENT_ES`, `NO_BEACH_REPORT_ES`, `confidenceReasonEs` | level words en settled §10; the two reason sentences en unsettled (they were minted with the keystone, after §10) |
| `src/publish/display-format.ts` 24 to 49 | `formatSizeEs`, `formatBestWindowEs`, `Ventana`, `m o más`, `bandWordEs` returning `label.es` | format LAW is locale-independent (decision 18); words en unsettled |
| `src/pipeline/build.ts` 246, 259, 268 to 270, 308 to 323 | `call: { es }`, `call_es`, `spanishCall`, `spanishWind`, `spanishSizeBand`, fallback `Condiciones variables` | the builder is the THIRD home of the band labels and second of the wind words; Pre-requisite 2 decides where the en twin lives |

### D. Already complete (proof the seam works; the pass must not touch these)

| Site | Coverage |
|---|---|
| `src/i18n/strings.ts` es and en `home` + `report` trees | complete, both `verbatim` from §10; the type `Record<Locale, UiStrings>` (line 69) makes a missing KEY unrepresentable, which is why the gates hunt brackets and out-of-tree copy instead |
| `src/data/size-bands.ts` 41 to 84 | all seven bands carry `label: { es, en }`, verbatim from §10 Q1 / domain model §7.2; the one fully bilingual `Record<Locale, string>` site in the codebase |
| `src/data/report-vocab.ts` | language-neutral wire tokens by design; nothing to translate, ever |

### E. Structural gaps that are not strings

| Site | Gap |
|---|---|
| `src/layouts/Base.astro` 27 to 31, 57 | `altPath` declared then dropped; no toggle rendered anywhere on the site; lone self-referential `hreflang="es"`, relative not absolute; no en alternate. READ-01 |
| `src/i18n/routes.ts` 9 to 23 | five `/en/` families built, zero `/en/` pages exist (tree removed in `0f04f07`, `HANDOFF.md` §6 item 3); no `yesterday` builder despite §6 item 2 settling `/en/spots/{slug}/yesterday`. READ-04 |
| `src/components/ReportCapture.astro` 44, `ReportShell.astro` 32 | `altPath` passed into the dead tree; both also inline `locale === 'es' ? 'en' : 'es'` instead of `otherLocale()` (`strings.ts` 18 to 20). READ-04 |
| `src/pages/spots/[slug]/ayer.astro` 35 | `currentPath` hardcoded, bypassing the route map. READ-04 |

### F. Copy arriving from concurrent lanes (the pass's settle-time scope, READ-08)

| Surface | Producing lane | en status |
|---|---|---|
| Share template, OG title/description | f-paste (READ-06 translates after they exist) | en settled §10 |
| Report island states: queued, arrival, reveal (`We said {band}...`), refusal, counter, share prompt, photo prompt | f-tell-us (READ-07) | en settled §10; the probe-refusal string is missing in BOTH languages (F-TELL-US Pre-requisite 8a), so it enters through the es batch first |
| Offline page, A2HS hint | F-WORKS | en settled §10 |
| Staleness stamp (JS) | keystone/signal lane | en settled §10 |
| Day-one empty state / counter | F-SHOW | en settled §10; scorecard headline copy not yet written in either language |
| Weakest-link and damages phrasing | F-SEE | not yet written in either language |
| Push copy | F-TELL-ME | not yet written in either language |

## Wave: DISTILL / [REF] Scenario inventory

DISTILL opened 2026-08-10. The `.feature` files under
`tests/acceptance/f-read-it-in-your-language/` are the scenario SSOT; this table is a pointer.
38 scenarios, 17 tagged `@negative`/`@error` (45%). Every scenario carries file-level
`@feature-f-read-it-in-your-language` plus BOTH `@READ-NN` (the plan's ids, dispatch hard rule)
and `@slice-NN` (the mechanical id `cucumber.mjs` and the carpaccio gate document), plus
`@covers-Rn` against `distill/requirement-checklist.md`. Steps live in
`tests/acceptance/f-read-it-in-your-language/steps/read-your-language.steps.ts`: READ-01 steps
are real drivers over the emitted tree, observed RED (11 assertion-class failures, 0 broken) at
DISTILL open; every later slice's steps are `pending` scaffolds unskipped at that slice's
DELIVER entry (`distill/red-classification.md` carries the observed run and the unskip
contract).

| File | Slice | Scenarios | Notes |
|---|---|---|---|
| `english-tree-and-toggle.feature` | READ-01 | 9 (1 `@walking_skeleton`) | Toggle, twin landing, link discipline, alternates, no locale machinery, no half-translation, byte ceilings; U3 toggle-target scenario pending browser measurement |
| `translation-coverage-gate.feature` | READ-02 | 6 | Three detectors seeded red against contained fixtures, false-positive guard, ratchet shrink/growth |
| `no-hidden-copy-gate.feature` | READ-03 | 4 | Inline-literal refusal by file and line, registered copy homes, non-copy false-positive guard, written-reason debt |
| `route-map-conformance.feature` | READ-04 | 4 | Dead builder, twinless page, bidirectional twinship, yesterday builder through the route map (real driver, RED today) |
| `english-spot-and-yesterday.feature` | READ-05 | 5 | Spot page in English, format law, English absences, honest yesterday (invariant valid under both Pre-requisite 3 options) |
| `english-share-card.feature` | READ-06 | 2 | Settled §10 English template + locale declaration; RED-for-right-reason only after f-paste 01-04 land |
| `english-report-flow.feature` | READ-07 | 4 | Real CTA, settled English questions, locale-blind wire (byte-identical records, canonical tokens), flow states after f-tell-us lands |
| `one-language-pass-complete.feature` | READ-08 | 4 | Ratchets to absolute, total twinship, the epic sentence end to end, nothing reworded |

## Wave: DISTILL / [REF] Port treatment and test placement

Per the Architecture of Reference: the driving surface is the BUILT PAGE (the emitted `dist/`
tree, the visitor's real reading surface) for user-visible slices, and the check run against a
contained seeded fixture (the f-bill shape) for the three non-visual gate slices. Driven-external
fakes: none needed at this feature's acceptance layer (no clock, no network in scope; the wire
byte-comparison in READ-07 drives the report island's committed record seam). Test placement:
`tests/acceptance/f-read-it-in-your-language/` matching both siblings. The
`docs/architecture/atdd-infrastructure-policy.md` row for the built-tree driving port is appended
in this same commit; the three gate mechanisms add their rows at their own DELIVER entry, because
choosing them now would pre-empt the crafter's seam design on a contended file.

## Wave: DISTILL / [REF] Pre-requisites the scenarios lean on

| # | Dependency | Effect on scenarios |
|---|---|---|
| 1 | Pre-requisite 1 (English copy sign-off, toggle labels included) | No unsettled string is pinned anywhere; unsettled copy asserted by property (present, English, never bracketed, never Spanish). Settled §10 verbatim strings are pinned |
| 2 | Pre-requisite 2 (English call-line source) | READ-01/05 assert the visible property only; the builder-vs-client answer changes step wiring at DELIVER, never the `.feature` text |
| 3 | Pre-requisite 3 (English yesterday for Spanish receipts) | READ-05's honesty scenario asserts the invariant both options satisfy; the chosen frame copy lands via Pre-requisite 1 |
| 4 | f-paste slices 01-04, f-tell-us slices 01, 03-05 | READ-06/07 flow-state scenarios stay pending until the producing lanes land; authored now so the contract is on disk |
| 5 | Pre-requisite 5 contended seams | READ-02/03/04 add local-CI jobs serially; `Base.astro` head coordinates with f-paste slice-03 |
| 6 | Pre-requisite 6 (settle, coordinator-declared) | READ-08 scenarios unskip only at settle |
