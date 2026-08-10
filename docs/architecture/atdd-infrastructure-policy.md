# ATDD Infrastructure Policy

Applies the project-wide port treatment in `nw-distill-port-treatment-policy`.
Rows are added as a port first enters DISTILL; no row changes the default
treatment for its port class.

## Driving

| Port | Mechanism | Note |
|---|---|---|
| Built public tree (visitor reading surface) | Real `npm run build` output: acceptance steps read the emitted `dist/` documents (pages, anchors, language declarations, alternates); browser-measured observables (target sizes, viewport, contrast) ride `npm run test:ui` / Playwright | Added at f-read-it-in-your-language DISTILL (2026-08-10). Same surface the keystone's page-weight and reading scenarios drive. The three i18n check mechanisms (READ-02/03/04) add their own rows at their DELIVER entry. |
| Local CI protection command | Production-owned in-process `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` export from `scripts/ci-local.mjs`, with a captured output port | Slice-02 drives the stable CI command semantics without a test-owned wrapper, fork, or `commandRunner`. The stable public command remains `scripts/ci-local.mjs` and delegates to this entry. `environment` is an explicit read-only input. `declarationInput: { root, mode: 'declaration-only' }` selects the same production evaluator without asking the supplied root to be a package or CDK app. |

## Driven internal (real)

| Port | Mechanism | Note |
|---|---|---|
| Infrastructure declaration evaluator | Production-owned `evaluateInfrastructureDeclarations({ root, environment, output })`, invoked by `runLocalCi` for `repoRoot/infra` in the public `infra` job and for a generic `declarationInput.root` in declaration-only mode | The real public job remains Vitest plus credential-free synth. The focused AT observes only the shared evaluator over a copied source universe. Declaration-only is not synth or deploy proof. |
| Infrastructure declarations | A copied `tests/.../fixtures/controlled-infrastructure-declarations/` input with no symlinks or `node_modules`; source symlinks are rejected before a non-dereferencing copy; only contained regular files may be renamed or rewritten, then restored and removed in finally-safe cleanup | Controlled universe: copied declaration files, a test-local credential-free environment, local-CI exit/report, and an unchanged working tree. The fixture is never `repoRoot`, a package, or a deployment source. |

## Driven external / non-deterministic (fake)

| Port | Fake | Note |
|---|---|---|
| Cloud account | None | CDK guardrails inspect declarations without cloud credentials. |
