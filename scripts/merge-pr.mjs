#!/usr/bin/env node
// merge-pr — run the FULL local gate, then merge the PR.
//
// WHY THE GATE LIVES ON THE MERGE
// Protected trunks mean every landing is a PR merged server-side, where no
// git hook runs. The pre-push hook only ever sees feature-branch pushes. With
// no hosted CI, merging from the GitHub UI or a bare `gh pr merge` bypasses
// every check — so the gate has to live here.
//
// USAGE
//   npm run merge:pr -- 42                # full gate, then merge
//   npm run merge:pr -- 42 --dry-run      # gate only, never merges
//   npm run merge:pr -- 42 --squash       # merge strategy (default: --merge)
//
// It REFUSES to merge when local HEAD is not the PR's head commit. Gating one
// tree and merging a different one looks green and ships unchecked code.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');

const STRATEGIES = ['--squash', '--rebase', '--merge'];
const strategy = STRATEGIES.find((s) => argv.includes(s)) || '--merge';

const prNumber = argv.find((a) => /^\d+$/.test(a));
if (!prNumber) {
  console.error('Usage: npm run merge:pr -- <pr-number> [--squash|--rebase|--merge] [--dry-run]');
  process.exit(2);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', shell: false, ...opts });
}

const view = run('gh', ['pr', 'view', prNumber, '--json',
  'number,state,headRefName,headRefOid,baseRefName,mergeable,title']);
if (view.status !== 0) {
  console.error(`Could not read PR #${prNumber}:\n${view.stderr}`);
  process.exit(1);
}
const pr = JSON.parse(view.stdout);

console.log(`\n  PR #${pr.number} — ${pr.title}`);
console.log(`  ${pr.headRefName} → ${pr.baseRefName}   [${pr.state}, mergeable: ${pr.mergeable}]\n`);

if (pr.state !== 'OPEN') {
  console.error(`  PR is ${pr.state}, not OPEN. Nothing to merge.`);
  process.exit(1);
}
if (pr.mergeable === 'CONFLICTING') {
  console.error('  PR has conflicts. Rebase it first — do not merge over a conflict.');
  process.exit(1);
}

// The check that makes the gate mean anything: gate the code being merged.
const localHead = run('git', ['rev-parse', 'HEAD']).stdout.trim();
if (localHead !== pr.headRefOid) {
  console.error('  ✗ Local HEAD is not the PR head commit.\n');
  console.error(`      local HEAD : ${localHead}`);
  console.error(`      PR head    : ${pr.headRefOid}\n`);
  console.error('    Gating this tree would prove nothing about what actually merges.');
  console.error(`    Fix:  git fetch origin && git checkout ${pr.headRefName} && git pull --ff-only\n`);
  process.exit(1);
}

// FULL gate — never the fast path. Affected-only test selection tracks static
// imports, so a runtime/config coupling can slip through it. Acceptable on a
// feature branch, not on the way to a trunk.
console.log('  Running the FULL local gate (no hosted CI is checking this repo)\n');
const gate = run('node', ['scripts/ci-local.mjs'], { stdio: 'inherit', encoding: undefined });

if (gate.status !== 0) {
  console.error('\n  ✗ Local CI failed — NOT merging.');
  console.error('    Fix it and re-run. Nothing else is checking this repo.\n');
  process.exit(1);
}

if (DRY) {
  console.log('\n  ✓ Gate green. --dry-run: stopping before the merge.\n');
  process.exit(0);
}

console.log(`\n  ✓ Gate green — merging #${pr.number} (${strategy.slice(2)})\n`);

// NO --delete-branch: it deletes the LOCAL branch too, which makes gh switch
// the working tree to the base branch — that fails when the base is checked
// out in another worktree (the normal case with parallel agents), and it
// exits non-zero AFTER a successful merge. Delete the remote ref directly.
const merge = run('gh', ['pr', 'merge', prNumber, strategy], {
  stdio: 'inherit', encoding: undefined,
});
if (merge.status !== 0) process.exit(merge.status ?? 1);

// NEVER delete a trunk. On a release PR (develop → main) the head branch IS
// develop — the generic "delete the head branch" step aims straight at it.
const TRUNKS = new Set(['main', 'develop', 'master']);
if (TRUNKS.has(pr.headRefName)) {
  console.log(`  ✓ merged. Left origin/${pr.headRefName} in place — it is a trunk, not a feature branch.`);
} else {
  const del = run('git', ['push', 'origin', '--delete', pr.headRefName]);
  console.log(del.status === 0
    ? `  ✓ merged, and deleted origin/${pr.headRefName}`
    : `  ✓ merged. (origin/${pr.headRefName} already gone, or not deletable — check by hand)`);
}

if (pr.baseRefName !== 'main' && pr.baseRefName !== 'master') {
  console.log(`\n  Reminder: this landed on ${pr.baseRefName}, which is not prod.`);
  console.log(`  Reaching prod still needs a ${pr.baseRefName} → main release PR, gated the same way.\n`);
} else {
  console.log('\n  This landed on the production trunk. If a deploy hangs off it, smoke it.\n');
}
