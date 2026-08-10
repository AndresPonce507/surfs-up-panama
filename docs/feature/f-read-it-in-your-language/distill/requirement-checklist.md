# Requirement checklist: f-read-it-in-your-language

Extracted at DISTILL open (2026-08-10) from `feature-delta.md` (Slice Plan READ-01 to READ-08 +
Definition of Done + Out-of-scope + Pre-requisites + Translation inventory),
`application-architecture.md` §4 (route map and language routing), §5 (byte budget), §10 (copy,
exact, both languages), §13 (og:locale es_PA with en alternate), `docs/DISCUSS-decisions.md` 8
("Spanish first, English toggle"), `src/data/report-vocab.ts` (canonical wire enums, decided
2026-08-09), `src/i18n/routes.ts` and `src/i18n/strings.ts` (the seams on disk), and the U1-U7
UI mandates (`nw-ui-quality-mandates`). One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body. Rows whose
slice has not entered DELIVER yet are expected-uncovered-by-passing-tests; unlike the sibling
features, this feature's scenarios are AUTHORED on disk from DISTILL open (dispatch instruction
2026-08-10: a feature with no `.feature` files cannot enter DELIVER), scaffolded RED/pending, and
DELIVER unskips them slice by slice.

Copy discipline inside every row: scenarios never pin an English string that is not settled.
Settled (§10 verbatim, pinnable): home strings, report questions and all 14 option labels, Send,
noscript, GO TO {SPOT}, wind words Clean/Choppy/Blown out, confidence level words, the share
template. Unsettled (Pre-requisite 1/2/3, never pinned): toggle labels, the English call line,
`Ver el llamado`, spot-page empty states, 404 set, yesterday set, confidence reason sentences,
display-format words, report CTA. Unsettled copy is asserted by property (present, English,
never bracketed, never Spanish), not by exact text.

| # | Requirement | Category |
|---|---|---|
| R1 | The English home and English tomorrow page render the same twenty ranked spots as their Spanish twins, from the same published surface, in the same order (READ-01) | functional |
| R2 | Every page in both trees carries the language toggle as a plain link at the top of the page whose destination is exactly that page's twin address from the route map; tapping it lands on the twin, and tapping again returns (READ-01) | functional |
| R3 | Every internal link on every emitted English page points inside the English tree and every link on a Spanish page points inside the Spanish tree; the only cross-tree link on any page is the toggle (READ-01) | validation |
| R4 | Every emitted page declares its own language and names both language alternates with full absolute addresses derived from the configured site; the alternates name the page itself and its exact twin (READ-01) | build |
| R5 | No locale machinery exists anywhere: nothing sniffs a language, redirects, or stores a choice; the choice persists purely as the address tree (READ-01, §4, permanent) | security |
| R6 | No emitted English page renders missing text, a bracketed placeholder, or Spanish copy (READ-01 on the home/tomorrow pages; feature-wide from then on) | validation |
| R7 | Every new English page sits at or under its per-document byte ceiling inside the existing page-weight gate (READ-01, §5) | nfr |
| R8 | The translation-coverage check refuses a bracketed placeholder leaf in either language tree, naming the exact file, the key path, and the missing language (READ-02 detector a) | build |
| R9 | The check refuses a user-facing field or export whose name encodes one language with no twin (snake `_es` suffix, trailing `Es`, `SPANISH` camel convention), naming it exactly; ordinary English words ending in "es" never trigger it (READ-02 detector b) | build |
| R10 | After a build, the check refuses any English page containing rendered missing text or a Spanish-only fallback string, naming the page (READ-02 detector c; the 19-of-20 missing-fields incident shape) | build |
| R11 | Enforcement is a ratchet: a committed exceptions file (file, identifier, reason per line) tolerates recorded debt, refuses any new offender the day it lands, and refuses its own growth (READ-02) | build |
| R12 | Every refusal from the three checks names what broke and where, and each check is demonstrated red at least once against a deliberately seeded offender before it counts as protection (READ-02, READ-03, READ-04; unfired-is-not-evidence) | build |
| R13 | The no-hidden-copy check refuses a user-facing string written inline in a page template instead of flowing from a registered copy home, naming file and line (READ-03) | build |
| R14 | The check never fires on non-copy literals: class names, accessibility token values, data markers, time formats, style blocks, comments, and format tokens all pass untouched (READ-03) | validation |
| R15 | A genuinely ambiguous literal is legal only through the shared exceptions file with a written reason per line, never a silent skip (READ-03) | build |
| R16 | Every address the route map builds resolves to an emitted page; a builder whose output resolves to nothing fails the build, named (READ-04) | build |
| R17 | Every emitted Spanish page has its English twin under the route map's word mapping and every English page maps back; a page without its twin fails the build until the twin exists or its debt line is written with a reason (READ-04) | build |
| R18 | The route map carries the yesterday route in both languages and the yesterday page's own address flows from the route map, never a hand-typed path (READ-04, HANDOFF §6 item 2) | functional |
| R19 | A ranked row on the English home leads to that spot's own page in English: today's and tomorrow's numbers, size in body-height words, and the window (READ-05) | functional |
| R20 | The size line keeps the format law in English: body-height word first, numeric range second, always the approximation mark, and the open-ended band never claims a ceiling (READ-05, decision 18) | validation |
| R21 | Spot-page empty states on the English tree say what is missing plainly in English words, never in Spanish and never as missing text (READ-05) | validation |
| R22 | The English yesterday page never presents an English narrative that was not published: a receipt minted in Spanish is either quoted verbatim as the historical artifact or its English absence is plainly stated; a synthesized English narrative is refused under every resolution of Pre-requisite 3 (READ-05) | functional |
| R23 | The English yesterday page with no receipt states the absence plainly in English (READ-05) | validation |
| R24 | Sharing from the English tree pastes the settled English template with that build's real values: SURF {date} / Best: {spot}, {score} / {size} and {wind}. {window}. / {level} confidence. / the absolute link ending with the build marker (READ-06; after f-paste slices 01-04 land) | functional |
| R25 | Every page's link preview declares Spanish (Panama) as the page's locale with the English alternate beside it (READ-06, §13) | build |
| R26 | The English report invitation on the spot page is real settled copy, never a bracketed placeholder (READ-07; closes the feature's founding debt at `strings.en.spot.reportCta`) | functional |
| R27 | The English report screen asks the three questions with the settled English labels: How big?, Wind? (Clean / Choppy / Blown out), How was it? (Bad / OK / Good / Epic), Send, and the English no-script line (READ-07, §10 verbatim) | functional |
| R28 | The wire is locale-blind: a report answered identically by an English-tree visitor and a Spanish-tree visitor commits and replays byte-identical records; answers travel only as the canonical tokens of the one vocabulary home (`clean\|choppy\|blown_out`, `bad\|ok\|good\|epic`) and no committed record carries a language field (READ-07, domain-model §7.4) | security |
| R29 | Every state of the English report flow reads in English: queued, arrival, reveal, refusal, and the counter (READ-07; after f-tell-us slices 01 and 03-05 land) | functional |
| R30 | At settle, the three exceptions files are empty and their mechanisms deleted; the three checks run absolute and green (READ-08) | build |
| R31 | Every page the Spanish site emits has its English twin and every English page maps back, with zero debt lines (READ-08) | e2e |
| R32 | The epic sentence walks end to end: from any page one tap lands on the twin page, the call, the confidence reasons and the report flow read in the chosen language, and a saved address opens in that language on the next visit (READ-08) | e2e |
| R33 | Not one verbatim string was reworded in either language; no new UI string carries an em dash; the Spanish surface carries zero English and the English surface zero Spanish, except the immutable receipt quote if Pre-requisite 3 resolves to quoting (READ-08) | validation |
| R34 | U1: every text/surface pair the English tree adds, the toggle included, clears WCAG AA computed against the real rendered backdrop in both themes (visible slices) | ui |
| R35 | U2: no horizontal scroll, clipping or overlap at 390 px on any English page in any state, including the longest English strings (visible slices) | ui |
| R36 | U3: the language toggle and every interactive target on English pages measure at least 44 px and sit thumb-reachable; the 44 px toggle target is a §4 requirement (visible slices) | ui |
| R37 | U4: reduced motion honoured on English pages; nothing animates that delays first meaningful content (visible slices) | ui |
| R38 | U5: the designed states exist on the English tree and are honestly distinct: ready, empty (missing day, no receipt), error (English 404), success (visible slices) | ui |
| R39 | U6: type on English pages comes from the declared scale and survives the longest English string at 390 px without truncation or bad reflow (visible slices) | ui |
| R40 | U7: English surfaces use the same named tokens; the twin tree introduces no raw hex or ad-hoc values (visible slices) | ui |

U8 (restraint over decoration) is deliberately NOT a test row: per the slice classification table
in `feature-delta.md`, each user-visible slice (READ-01, 05, 06, 07, 08) carries a U8 charter
observation for the examiner walk, and the three non-visual slices (READ-02, 03, 04) carry
examined terminal-output charters instead. Charters live under
`docs/product/expectations/f-read-it-in-your-language/` and are owed by the coordinator lane, not
authored here (feature-delta file-discipline note).

## Current DISTILL coverage

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| R1-R7 (READ-01) | `tests/acceptance/f-read-it-in-your-language/english-tree-and-toggle.feature` — steps implemented against the real built tree; observed RED (MISSING_FUNCTIONALITY: no English tree, no toggle) per `red-classification.md` | RED, ready for DELIVER |
| R8-R18 (READ-02/03/04) | `translation-coverage-gate.feature`, `no-hidden-copy-gate.feature`, `route-map-conformance.feature` — scenarios authored, steps scaffolded pending; unskipped at each slice's DELIVER entry | scaffolded-pending |
| R19-R33 (READ-05/06/07/08) | `english-spot-and-yesterday.feature`, `english-share-card.feature`, `english-report-flow.feature`, `one-language-pass-complete.feature` — scenarios authored, steps scaffolded pending; READ-06/07 flow-state rows additionally gated on their producing lanes | scaffolded-pending |
| R34-R40 (ui) | R36 has an authored scenario (toggle target); the remaining U rows ride the feature-level UI gate (`npm run test:ui`) plus the slice charters, per HANDOFF §4 reuse convention | partially authored |
