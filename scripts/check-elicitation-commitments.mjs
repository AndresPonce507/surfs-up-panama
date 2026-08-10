#!/usr/bin/env node
//
// check-elicitation-commitments.mjs
//
// Enforces that every answer DISCUSS collected is WIRED to something that can
// fail — and reports, every single run, how much of the feature is still on the
// honour system.
//
// WHY THIS SHAPE
// --------------
// Most of the 48 elicitation answers are decisions, not facts, so no script can
// check them directly. "The person is a surfer at dawn with one bar" is not
// verifiable by a machine and never will be. So this does not try to check the
// answers. It checks that each answer names the mechanism that holds it, and
// that the named mechanism actually exists.
//
// That is the same rule this account already applies to product promises: one
// canonical place holds the value, an enforcement layer fires on every write
// path, and a guard fails loudly when a future change drops it. This applies it
// to the requirements themselves.
//
// THE NUMBER IS THE POINT
// -----------------------
// The most useful output is not PASS. It is the count of commitments marked
// `unenforceable`. "11 of 48 on the honour system" is a fact a person can act
// on; it makes honesty-by-omission visible instead of invisible. It prints on
// success as loudly as on failure, and a feature is allowed to have a high
// count as long as every one of them says WHY.
//
// THE LEDGER
// ----------
// `feature-delta.md`, under `## Wave: DISCUSS / [REF] Elicitation`, carries a
// table. One row per answered question:
//
//   | # | Group | Set | Answer | Enforced by | Kind |
//   |---|---|---|---|---|---|
//   | 8 | A | 2 | Stale data says so plainly, never the flattering reading | @feature-x and @slice-01 | scenario |
//   | 18 | B | 5 | 7:1 body contrast, ground #0B2E36, accent #22B8CF | check-design-contract.mjs | gate |
//   | 1 | A | 1 | A surfer at Playa Venao at dawn, one bar of signal | n/a | unenforceable: a fact about people, not about code |
//
// Kinds:
//   gate          — a build-failing script holds it. Must name a script that
//                   EXISTS in scripts/ and is WIRED into the local CI job list.
//                   A gate that exists but never runs is worse than none.
//   scenario      — an acceptance scenario proves it. Must name a tag that binds
//                   to an actual Scenario line, not one sitting above `Feature:`.
//                   Cucumber tags do not inherit downward, and a tag that binds
//                   zero scenarios reads exactly like coverage while proving
//                   nothing. This repo has already paid for that once.
//   unenforceable — genuinely a judgment or a fact about people. Allowed, must
//                   carry a reason after the colon, and is counted.
//
// EXIT CODES
//   0  every ledger present is complete and correctly wired
//   1  at least one commitment is unwired, miswired, or the floor is unmet
//   2  a ledger is malformed, or a feature that needs one has none

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.argv[2] ?? process.cwd();

const FLOORS = { build: 48, feature: 36 };
const GROUPS = ['A', 'B', 'C', 'D'];
const PER_GROUP = { build: 12, feature: 9 };

// Features whose DISCUSS ran before this gate existed, so no ledger was ever
// written. They are DEBT, not exemptions: listed by name, dated, counted on
// every run, and this list may only shrink. Adding a name here is a decision
// somebody made on a day; adding a silent skip is a decision nobody made.
//
// Backfilling one means reconstructing what was actually decided and what holds
// it, which is real archaeology — so it happens per feature, deliberately, not
// in a batch that would produce plausible fiction.
const PREDATES_THE_GATE = new Map([
  ['daily-call-with-permanent-receipts', '2026-08-10: shipped 8 slices before the ledger existed'],
  ['f-bill-stays-zero-and-stays-up', '2026-08-10: slices 01-03 shipped before the ledger existed'],
  ['f-forecast-learns-from-the-beach', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-know-how-much-to-trust-it', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-paste-the-call-into-the-group', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-see-what-killed-it', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-show-our-track-record', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-tell-me-when-its-worth-the-drive', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-tell-us-what-you-saw-cold', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-works-with-no-signal', '2026-08-10: DISCUSS ran before the ledger existed'],
  ['f-looks-like-the-ocean-and-reads-in-the-sun', '2026-08-10: DISCUSS ran before the ledger existed'],
]);

const problems = [];
const summaries = [];
const debt = [];

/** Every feature-delta.md under docs/feature/. */
function featureDeltas(root) {
  const base = join(root, 'docs', 'feature');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name, 'feature-delta.md'))
    .filter((path) => existsSync(path) && statSync(path).isFile());
}

/** Every .feature file in the repo, read once. */
function featureFileTexts(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.feature')) out.push({ path: full, text: readFileSync(full, 'utf8') });
    }
  };
  walk(join(root, 'tests'));
  return out;
}

/**
 * A tag "binds" only when it sits on a tag line that is followed, before the
 * next blank-separated block, by a Scenario. A tag above `Feature:` binds
 * nothing, which is the trap: it reads as coverage and proves nothing.
 */
function tagBindsAScenario(tag, files) {
  for (const { text } of files) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line.startsWith('@') || !line.includes(tag)) continue;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next === '') continue;
        if (next.startsWith('@')) continue;
        if (/^(Scenario|Scenario Outline|Example|Ejemplo|Escenario)/i.test(next)) return true;
        break; // hit Feature: or something else — this tag does not bind here
      }
    }
  }
  return false;
}

/** The job names the local CI actually runs, so a gate can be proven wired. */
function wiredJobScripts(root) {
  const wired = new Set();
  for (const file of ['scripts/ci-local.mjs', 'scripts/ci-local-core.mjs']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/scripts\/([A-Za-z0-9._-]+\.mjs)/g)) wired.add(match[1]);
    // A job may run through an npm script rather than naming the file.
    for (const match of text.matchAll(/'run',\s*'([A-Za-z0-9:_-]+)'/g)) wired.add(`npm:${match[1]}`);
  }
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    const scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {};
    for (const [name, body] of Object.entries(scripts)) {
      for (const match of String(body).matchAll(/scripts\/([A-Za-z0-9._-]+\.mjs)/g)) {
        if (wired.has(`npm:${name}`)) wired.add(match[1]);
      }
    }
  }
  return wired;
}

/** Pull the ledger rows out of the Elicitation section. */
function readLedger(text) {
  const section = /##\s*Wave:\s*DISCUSS\s*\/\s*\[REF\]\s*Elicitation([\s\S]*?)(?=\n##\s|\n#\s|$)/i.exec(text);
  if (section === null) return null;
  const rows = [];
  for (const line of section[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    if (/^-{2,}$/.test(cells[0]) || /^#$/.test(cells[0])) continue; // header or divider
    const [number, group, set, answer, enforcedBy, kind] = cells;
    if (!/^\d+$/.test(number)) continue;
    rows.push({ number: Number(number), group: group.toUpperCase(), set, answer, enforcedBy, kind });
  }
  return rows;
}

const featureFiles = featureFileTexts(repoRoot);
const wired = wiredJobScripts(repoRoot);

for (const deltaPath of featureDeltas(repoRoot)) {
  const shortPath = relative(repoRoot, deltaPath);
  const text = readFileSync(deltaPath, 'utf8');
  const rows = readLedger(text);

  const featureId = shortPath.replace(/^docs\/feature\//, '').replace(/\/feature-delta\.md$/, '');

  if (rows === null) {
    // A feature-delta with no ledger. Never skipped silently — silently skipping
    // is the exact failure this gate exists to catch. Either it is declared debt,
    // which is counted and reported, or it is a problem.
    if (PREDATES_THE_GATE.has(featureId)) {
      debt.push({ feature: featureId, note: PREDATES_THE_GATE.get(featureId) });
    } else {
      problems.push({ where: shortPath, what: 'no `## Wave: DISCUSS / [REF] Elicitation` ledger. Every feature needs one. If this feature genuinely predates the gate, add it to PREDATES_THE_GATE with a date and a reason — never a silent skip.', fatal: true });
    }
    continue;
  }
  if (rows.length === 0) {
    problems.push({ where: shortPath, what: 'the Elicitation section exists but holds no ledger rows', fatal: true });
    continue;
  }

  // Which floor applies. A delta that says it is a new build gets the higher one.
  const isNewBuild = /greenfield|brand new build|new build|MVP from scratch/i.test(text);
  const shape = isNewBuild ? 'build' : 'feature';
  const floor = FLOORS[shape];
  const perGroup = PER_GROUP[shape];

  if (rows.length < floor) {
    problems.push({ where: shortPath, what: `${rows.length} commitments recorded, floor for a ${shape} is ${floor}` });
  }
  for (const group of GROUPS) {
    const count = rows.filter((row) => row.group === group).length;
    if (count < perGroup) {
      problems.push({ where: shortPath, what: `group ${group} has ${count} commitments, quota is ${perGroup}. An uneven total is not a met floor, it is a blind spot with a number on it.` });
    }
  }

  let unenforceable = 0;
  let gated = 0;
  let scenarioed = 0;

  for (const row of rows) {
    const kind = row.kind.toLowerCase();

    if (kind.startsWith('unenforceable')) {
      unenforceable += 1;
      const reason = row.kind.slice(row.kind.indexOf(':') + 1).trim();
      if (!row.kind.includes(':') || reason.length < 8) {
        problems.push({ where: shortPath, what: `commitment ${row.number} is unenforceable with no reason. Unenforceable is allowed; unexplained is not.` });
      }
      continue;
    }

    if (kind === 'gate') {
      gated += 1;
      const named = row.enforcedBy.split(/[\s,+]+/).filter((token) => token.endsWith('.mjs'));
      if (named.length === 0) {
        problems.push({ where: shortPath, what: `commitment ${row.number} claims kind "gate" but names no .mjs script` });
        continue;
      }
      for (const named_script of named) {
        // A ledger may write the path either way. Normalise so a correctly wired
        // gate is never reported as missing, which is how a gate teaches people
        // to ignore it.
        const script = named_script.replace(/^\.?\/?scripts\//, '');
        if (!existsSync(join(repoRoot, 'scripts', script))) {
          problems.push({ where: shortPath, what: `commitment ${row.number} names gate "${script}", which does not exist in scripts/` });
        } else if (!wired.has(script)) {
          problems.push({ where: shortPath, what: `gate "${script}" exists but is not wired into the local CI job list. A guard that never runs is worse than one that fails, because it reads as protection.` });
        }
      }
      continue;
    }

    if (kind === 'scenario') {
      scenarioed += 1;
      const tags = row.enforcedBy.match(/@[\w-]+/g) ?? [];
      if (tags.length === 0) {
        problems.push({ where: shortPath, what: `commitment ${row.number} claims kind "scenario" but names no @tag` });
        continue;
      }
      for (const tag of tags) {
        if (!tagBindsAScenario(tag, featureFiles)) {
          problems.push({ where: shortPath, what: `commitment ${row.number} names ${tag}, which binds no Scenario. Cucumber tags do not inherit from Feature: downward, so a tag sitting above Feature: reads exactly like coverage and proves nothing.` });
        }
      }
      continue;
    }

    problems.push({ where: shortPath, what: `commitment ${row.number} has kind "${row.kind}". Must be gate, scenario, or unenforceable: <reason>.` });
  }

  summaries.push({ feature: shortPath, shape, total: rows.length, gated, scenarioed, unenforceable });
}

// ---- report -----------------------------------------------------------------
// The honour-system count prints on success too. That number is the product.

if (debt.length > 0) {
  process.stdout.write(
    `\x1b[33m  ${debt.length} feature(s) carry no ledger because their DISCUSS predates this gate.\x1b[0m\n` +
    '    Declared debt, not exemption. Backfill one whenever you next touch its requirements:\n',
  );
  for (const entry of debt) process.stdout.write(`      ${entry.feature}  (${entry.note})\n`);
}

if (summaries.length === 0 && problems.length === 0 && debt.length === 0) {
  process.stdout.write('\x1b[32m✓ elicitation\x1b[0m no feature-delta found — nothing to check\n');
  process.exit(0);
}

for (const s of summaries) {
  const share = s.total === 0 ? 0 : Math.round((s.unenforceable / s.total) * 100);
  process.stdout.write(
    `  ${s.feature.replace(/^docs\/feature\//, '').replace(/\/feature-delta\.md$/, '')}\n` +
    `    ${s.total} commitments (${s.shape} floor) · ${s.gated} held by a gate · ${s.scenarioed} by a scenario · ` +
    `\x1b[33m${s.unenforceable} on the honour system (${share}%)\x1b[0m\n`,
  );
}

if (problems.length === 0) {
  process.stdout.write('\x1b[32m✓ elicitation\x1b[0m every commitment is wired to something that can fail\n');
  process.exit(0);
}

process.stdout.write('\n\x1b[31m✗ elicitation\x1b[0m commitments are unwired or the floor is unmet\n\n');
for (const problem of problems) {
  process.stdout.write(`  ${problem.where}\n    ${problem.what}\n`);
}
process.stdout.write(
  '\nEvery answer DISCUSS collected must name what holds it: a gate that fails the build, a scenario\n' +
  'that binds, or an explicit admission that nothing does and why.\n',
);
process.exit(problems.some((problem) => problem.fatal) ? 2 : 1);
