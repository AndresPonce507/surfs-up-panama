# ATDD Infrastructure Policy

Applies the project-wide port treatment in `nw-distill-port-treatment-policy`.
Rows are added as a port first enters DISTILL; no row changes the default
treatment for its port class.

## Driving

| Port | Mechanism | Note |
|---|---|---|
| Local CI protection command | Production-owned in-process `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` export from `scripts/ci-local.mjs`, with a captured output port | Slice-02 drives the stable CI command semantics without a test-owned wrapper, fork, or `commandRunner`. The stable public command remains `scripts/ci-local.mjs` and delegates to this entry. `environment` is an explicit read-only input. `declarationInput: { root, mode: 'declaration-only' }` selects the same production evaluator without asking the supplied root to be a package or CDK app. |
| Built reading surface (home + spot pages) | Isolated copy of the production project, real `npm run build` over the installed public input, emitted `dist/` served over HTTP, Chromium at 390 px | The f-paste suites' driving port. Home routes serve through `vite preview`; spot routes MUST serve through the daemonising `astro preview` — raw vite preview SPA-falls-back to the home for `build.format:'file'` directory hrefs (keystone slice-06 precedent, re-confirmed by f-paste slice-05's first RED attempt). |
| Preview-crawler view of a publication | Site-absolute addresses declared in the served page head (`og:*`, canonical), fetched over the same local preview that serves the publication | How the f-paste slice-03/04 scenarios read what WhatsApp's crawler would read. A live paste against the hosted preview stays a charter observation, blocked on the AWS deploy (IAM). |
| Report journey | The production report page at an explicitly supplied `REPORT_ACCEPTANCE_ORIGIN`, connected to the real write handler. Until a deployment exists, a locally run production handler wired to its real local store is permitted. | No test-owned route, intercepted request, or fake endpoint. The origin is an explicit prerequisite for Slice-03 through Slice-05 evidence. |

## Driven internal (real)

| Port | Mechanism | Note |
|---|---|---|
| Infrastructure declaration evaluator | Production-owned `evaluateInfrastructureDeclarations({ root, environment, output })`, invoked by `runLocalCi` for `repoRoot/infra` in the public `infra` job and for a generic `declarationInput.root` in declaration-only mode | The real public job remains Vitest plus credential-free synth. The focused AT observes only the shared evaluator over a copied source universe. Declaration-only is not synth or deploy proof. |
| Infrastructure declarations | A copied `tests/.../fixtures/controlled-infrastructure-declarations/` input with no symlinks or `node_modules`; source symlinks are rejected before a non-dereferencing copy; only contained regular files may be renamed or rewritten, then restored and removed in finally-safe cleanup | Controlled universe: copied declaration files, a test-local credential-free environment, local-CI exit/report, and an unchanged working tree. The fixture is never `repoRoot`, a package, or a deployment source. |
| Report record and receipt store | The write handler's production store adapter, against the deployed store or the handler's real local-store composition. | A duplicate and a quota decision are observed from the report journey's public receipt, never by inspecting table rows in browser steps. |
| Published-call and spot-index reads | The production read adapters used by the report handler, with the real generated spot index and published-call artifacts. | A missing matching call is a real `no_snapshot` outcome, not a made-up response fixture. |
| Reading-mode preference | Real per-scenario browser storage in a fresh Chromium or Safari/WebKit context | Slice-07 proves selection by click, reload, and Spanish/English route transition; no test fake stands in for the surfer’s stored choice. |

## Driven external / non-deterministic (fake)

| Port | Fake | Note |
|---|---|---|
| Cloud account | None | CDK guardrails inspect declarations without cloud credentials. |
| Phone clipboard | Real Chromium clipboard with the permission granted per context; the DENIED state is simulated by refusing every write path in an init script (`NotAllowedError` + `execCommand` false) | f-paste slice-02/05. Reading back what the page wrote is a real round-trip; only the denial branch is simulated, the way a real phone denies. |
| WhatsApp (`wa.me` carrier + preview crawler) | Never called in tests. The number-less carrier was verified live ONCE (R5, recorded as a product fact in `distill/red-classification.md`); scenarios decode the anchor's `?text=` instead of opening WhatsApp | The live preview walk against the hosted site belongs to the examiner charter after the deploy lane unblocks. |
| Device clock | Controlled browser clock only for the explicit clock-refusal journey. | It supplies the surfer's observation time; the write handler supplies authoritative received time and refusal bounds. |
