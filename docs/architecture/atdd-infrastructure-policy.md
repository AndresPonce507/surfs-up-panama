# ATDD Infrastructure Policy

Applies the project-wide port treatment in `nw-distill-port-treatment-policy`.
Rows are added as a port first enters DISTILL; no row changes the default
treatment for its port class.

## Driving

| Port | Mechanism | Note |
|---|---|---|
| Local CI protection command | Production-owned in-process `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` export from `scripts/ci-local.mjs`, with a captured output port | Slice-02 drives the stable CI command semantics without a test-owned wrapper, fork, or `commandRunner`. The stable public command remains `scripts/ci-local.mjs` and delegates to this entry. `environment` is an explicit read-only input. `declarationInput: { root, mode: 'declaration-only' }` selects the same production evaluator without asking the supplied root to be a package or CDK app. |
| Report journey | The production report page at an explicitly supplied `REPORT_ACCEPTANCE_ORIGIN`, connected to the real write handler. Until a deployment exists, a locally run production handler wired to its real local store is permitted. | No test-owned route, intercepted request, or fake endpoint. The origin is an explicit prerequisite for Slice-03 through Slice-05 evidence. |

## Driven internal (real)

| Port | Mechanism | Note |
|---|---|---|
| Infrastructure declaration evaluator | Production-owned `evaluateInfrastructureDeclarations({ root, environment, output })`, invoked by `runLocalCi` for `repoRoot/infra` in the public `infra` job and for a generic `declarationInput.root` in declaration-only mode | The real public job remains Vitest plus credential-free synth. The focused AT observes only the shared evaluator over a copied source universe. Declaration-only is not synth or deploy proof. |
| Infrastructure declarations | A copied `tests/.../fixtures/controlled-infrastructure-declarations/` input with no symlinks or `node_modules`; source symlinks are rejected before a non-dereferencing copy; only contained regular files may be renamed or rewritten, then restored and removed in finally-safe cleanup | Controlled universe: copied declaration files, a test-local credential-free environment, local-CI exit/report, and an unchanged working tree. The fixture is never `repoRoot`, a package, or a deployment source. |
| Report record and receipt store | The write handler's production store adapter, against the deployed store or the handler's real local-store composition. | A duplicate and a quota decision are observed from the report journey's public receipt, never by inspecting table rows in browser steps. |
| Published-call and spot-index reads | The production read adapters used by the report handler, with the real generated spot index and published-call artifacts. | A missing matching call is a real `no_snapshot` outcome, not a made-up response fixture. |

## Driven external / non-deterministic (fake)

| Port | Fake | Note |
|---|---|---|
| Cloud account | None | CDK guardrails inspect declarations without cloud credentials. |
| Device clock | Controlled browser clock only for the explicit clock-refusal journey. | It supplies the surfer's observation time; the write handler supplies authoritative received time and refusal bounds. |
