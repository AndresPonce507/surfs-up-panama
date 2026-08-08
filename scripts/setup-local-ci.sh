#!/usr/bin/env bash
# setup-local-ci.sh — make THIS machine able to run the full local CI gate.
#
#   bash scripts/setup-local-ci.sh
#
# Idempotent — safe to re-run any time; it only installs what is missing.
#
# WHY THIS EXISTS
# The runner and hooks are tracked in the repo, but two things are inherently
# per-machine and a fresh clone silently lacks them:
#   1. the scanner binaries the jobs shell out to
#   2. the git-hook wiring (core.hooksPath is per-clone, and the hooks
#      install OUTSIDE the working tree — see scripts/git-hooks/install.sh)
# The runner SKIPS a missing tool rather than failing, so a machine that
# never ran this script quietly checks less than it appears to.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "run me from inside the repo"; exit 1; }
cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════════════"
echo "  Local CI setup — $(hostname -s)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── 1. Tools the jobs shell out to (ADAPT to match ci-local.mjs `needs`) ──
TOOLS=(gitleaks)   # add: semgrep osv-scanner deno ... as jobs need them
if command -v brew >/dev/null 2>&1; then
  NEEDED=()
  for tool in "${TOOLS[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || NEEDED+=("$tool")
  done
  if [ ${#NEEDED[@]} -gt 0 ]; then
    echo "  Installing: ${NEEDED[*]}"
    brew install "${NEEDED[@]}" || { echo "  ✗ brew install failed — fix and re-run."; exit 1; }
  else
    echo "  ✓ scanner tools already present (${TOOLS[*]})"
  fi
else
  echo "  ⚠ Homebrew missing — install the tools by hand: ${TOOLS[*]}"
fi

# ── 2. Package deps (test runner, linters live here) ────────────────
if [ -f package.json ] && [ ! -d node_modules ]; then
  echo "  Installing npm dependencies..."
  npm install --no-audit --no-fund || { echo "  ✗ npm install failed."; exit 1; }
elif [ -f package.json ]; then
  echo "  ✓ node_modules present"
fi

# ── 3. Git hooks — per-machine wiring, shared across all worktrees ───
bash scripts/git-hooks/install.sh

# ── 4. Prove it ──────────────────────────────────────────────────────
echo ""
echo "  Verifying with the runner's own job list:"
node scripts/ci-local.mjs --list
echo ""
echo "  If nothing above says MISSING, this machine can run the gate:"
echo "    npm run ci:local          # full pipeline"
echo "    npm run merge:pr -- <n>   # gate a PR, merge only if green"
echo ""
echo "  Done."
