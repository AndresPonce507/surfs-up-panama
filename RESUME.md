# Surfs Up Panama — resume here

Last updated 2026-08-10, late afternoon. Written so a cold session can pick up without
reconstructing anything from a transcript.

Read this, then `HANDOFF.md`. Section 11 of HANDOFF lives on `build/f2-integration`, not on main.

## The one-line state

The site is live and shows real numbers. 11 of 67 slices are done. 3 of 5 AWS stacks are
deployed. The hourly ingest is deployed but still runs placeholder code, so nothing refreshes
by itself yet.

Live site: https://d1j9u9fxnap4es.cloudfront.net/
CloudFront distribution `EH95FHQ75WCL3`. Bucket `surfs-up-panama-site-602167897909`.

## Where the code is

Everything is pushed to `github.com/AndresPonce507/surfs-up-panama`. Nothing important is
local-only.

`build/f2-gate` is the integration anchor. It has all twelve lanes merged and its gate is
green: 9 passed, 0 failed, 0 skipped, real exit 0. Rebuild it any time with
`bash scripts/integrate-lanes.sh` from `/Users/andres/psb-gate`. That script merges every
lane and then relinks the DES logs; both halves matter, read its header comment before
editing it.

Fourteen worktrees at `/Users/andres/psb-<lane>`, one branch each, one agent each. Never put
two agents in one worktree. `git stash` is global across all fourteen and will corrupt other
lanes.

## What is done

- Daily forecast (keystone): 6 of 8 slices.
- Cost guardrails: 4 of 5 slices. Only slice-04 is left.
- WhatsApp share: 1 of 5 slices, and it is live on the site.

## What is deployed

- `SurfsUpPanamaSite` — CREATE_COMPLETE
- `SurfsUpPanamaObservability` — CREATE_COMPLETE
- `SurfsUpPanamaIngest` — CREATE_COMPLETE, deployed 2026-08-10 18:45 UTC
- `SurfsUpPanamaWrite` — not deployed, goes last by design
- `SurfsUpPanamaGuardrails` — not deployed

Deploy through the `cdk-deploy` profile added to `~/.aws/config` today. It assumes
`cdk-hnb659fds-deploy-role`, so the CLI never prints a secret:

    cd /Users/andres/psb-infra
    npx cdk deploy <StackName> --profile cdk-deploy --require-approval never

Note: during the ingest deploy CDK warned it could not assume the file-publishing and deploy
roles and fell back to the user credentials, which worked. Earlier in the day those same
credentials were refused for CreateStack. Nobody has yet established which identity actually
built the infrastructure. Settle that before deploying the write stack, since that is the one
that touches real data.

## The biggest open thing

**The ingest Lambdas run fake code.** `infra/lib/ingest-stack.ts` around line 56 uses
`lambda.Code.fromInline(placeholderCode)` for both Fetch and Build. The placeholder logs
`ingest.placeholder` and returns 204. It deliberately does not emit `ingest.success`, so the
dead-man alarm keeps telling the truth. Keep that property.

The real pipeline already works on a laptop and must be reused, not rewritten:
`npm run pipeline:capture`, then `npm run pipeline:build -- --at <ISO>`, then
`npm run publish:surface -- --input .pipeline-out/pub/v1/regions/pa-pacific/bundle.json`.

Four live sources, all through Open-Meteo: `ncep_gfswave016`, `ncep_gfswave025`,
`meteofrance_wave`, `dwd_gwam`.

## Slices still needing a build plan

32 at last count, of which 23 were being written when this was saved. Check the truth with:

    for l in trust record deltas report push signal learning design paste bugfix i18n; do
      f=$(ls /Users/andres/psb-$l/docs/feature/*/deliver/roadmap.json 2>/dev/null | head -1)
      [ -f "$f" ] && python3 -c "
    import json,sys
    d=json.load(open(sys.argv[1]))
    sl={s['slice_id'] for ph in d.get('phases',[]) for s in ph.get('steps',[]) if s.get('slice_id')}
    print(sys.argv[2].ljust(9), len(sl), sorted(sl))" "$f" "$l"
    done

Uncovered when this was written: what-killed-it slices 02-05, report-flow slices 02-05, and
cost-guardrail slice-04. Those must be authored inside their own worktrees.

## Hard blocks that time will not solve

- **Zero surf reports exist.** Around 17 slices need 10 to 30 honest reports per spot from at
  least 5 different people. That needs real surfers, not compute. Track-record slices 03-05 and
  most of the learning feature sit behind this.
- **No tide station in the spot seed schema.** Every spot borrows tide, so a spot can publish
  `alta` confidence it never earned. The fix belongs in the ingest seed schema, NEVER in the
  confidence threshold. Lowering the threshold would manufacture confidence.
- **`ConfidenceDetail.astro` renders nowhere.** Nothing mounts it. The page ships the older
  level-based component with only 2 canned reasons across all 20 rows. Step 01-11 of the trust
  feature is the cross-lane wiring that fixes it.
- **`src/pipeline/build.ts` `surfaceCall()` omits `weakest_link`**, so zero published rows carry
  it. Owned by the keystone/producer lane.

## Rules that bit us today, in order of pain

1. `npm run ci:local` exits 0 when jobs are SKIPPED. Read the summary and confirm `0 skipped`.
2. Never pipe a gate into `tail`, `head` or `grep`. A pipeline returns the last command's status.
   Redirect to a file, then read the file.
3. `npm run ci:local:fast` is what the push hook gates on. The full `at` job is red by design on
   a branch mid-DELIVER — `scripts/ci-local-core.mjs` line 361 documents it. **Do not answer that
   with `git push --no-verify`.** Two lanes did today and both were wrong; the real cause was a
   branch missing the shared fast-gate fix.
4. Cucumber tags do not inherit from `Feature:` down to scenarios. Every scenario needs
   file-level `@feature-<id>` AND its own `@slice-NN`.
5. `des-log-phase --data` must be the bare word `PASS` or `FAIL` for an EXECUTED phase.
   Narrative there fails the schema. Explanation goes in the commit message.
6. U8 observation strings must be single-line in both the roadmap and the charter.
   Hard-wrapping breaks `des-record-examine`'s exact-substring match.
7. `.git/info/exclude` ignores `/docs/feature/`, so new files there need `git add -f`, and
   `git add` on tracked paths there exits 1 with a bogus warning while still staging.
8. Agents keep reporting a "second session" writing in their worktree. Every case today was the
   agent's own commit. Check the commit timestamp against the agent's start time before
   believing it.

## Vera examines every slice

Andres made this a hard rule on 2026-08-10. A slice is not done when its steps are green. It is
done when its steps are green AND the source-blind examiner has examined the running surface and
a verdict is recorded. Check the evidence, never an agent's claim:

`.execution-events/<step>/*.json` holds a `UI_CHECKS` record with U1-U7 and an examine record
with a verdict and a `charter_seal`. The charter's `## Session log` table holds hand-written
verdicts. Both count. **Warning: `.execution-events/` sits under `docs/feature/`, which is
gitignored, so those verdicts are local only and never reach the repo.** Losing a worktree loses
the proof while the code it blessed stays pushed. Worth fixing.

## Open questions for Andres

1. The push notification threshold value. No document fixes it and he has never been asked.
2. Track-record slice-04's headline copy. Not settled.
3. Which identity actually deployed the ingest stack (see the deploy note above).
4. PR #4 merged to main at 18:13 UTC. It is not established whether it went through the local
   gate or around it.
