#!/usr/bin/env bash
# Integrate the lane branches into the gate anchor, then restore the DES anchor.
#
# WHY BOTH HALVES ARE NEEDED, AND WHY THEY FIGHT
# ----------------------------------------------
# The DES subagent-stop hook needs two different things from the orchestrator's
# working directory, and they pull in opposite directions:
#
#   1. `git log --grep="Step-ID: N" -1`, with NO --all, run from that directory.
#      So the lane's commit must be reachable from THIS worktree's HEAD.
#      -> satisfied by merging the lane branches in.
#
#   2. `<cwd>/docs/feature/<feature-id>/deliver/execution-log.json` must be the
#      lane's LIVE log, because a crafter appends to it in its own worktree and
#      then stops seconds later.
#      -> satisfied by symlinking each deliver directory at the real lane.
#
# The merge in (1) writes real files over the symlinks from (2). The hook then
# reads a frozen snapshot, reports phases missing that were genuinely written,
# and blocks a crafter that did nothing wrong. That cost several agents a long
# retry loop on 2026-08-10 before the interaction was understood.
#
# So the relink is not cleanup. It is the second half of integrating, and it
# must run every time the first half does.
#
#   bash scripts/integrate-lanes.sh          merge, then relink
#   bash scripts/integrate-lanes.sh --relink relink only, merge nothing
#
# NOT `--all` ON THE VERIFIER: patching the DES verifier to search every ref was
# the obvious shortcut and is wrong. Step-IDs are not globally unique — every
# feature has an `01-02` — so `--all` would let the gate pass on a different
# feature's commit. A gate that can pass on the wrong evidence is worse than one
# that fails.

set -uo pipefail

ANCHOR="/Users/andres/psb-gate"
LANES=(signal deltas trust record learning push report paste bugfix)

cd "$ANCHOR" || { echo "anchor missing: $ANCHOR" >&2; exit 2; }

relink_only=0
[[ "${1:-}" == "--relink" ]] && relink_only=1

if (( ! relink_only )); then
  echo "== merging lane branches into $(git rev-parse --abbrev-ref HEAD) =="
  git fetch origin --quiet 2>/dev/null
  for lane in "${LANES[@]}"; do
    branch="build/f2-${lane}"
    git rev-parse --verify --quiet "$branch" >/dev/null || { printf '  skip     %s (no such branch)\n' "$branch"; continue; }
    if git merge --no-edit -q "$branch" >/tmp/integrate-merge.log 2>&1; then
      printf '  ok       %s\n' "$branch"
    else
      printf '  CONFLICT %s\n' "$branch"
      grep -i '^CONFLICT' /tmp/integrate-merge.log | head -4 | sed 's/^/             /'
      echo "             resolve by hand, then rerun. Nothing was aborted."
      exit 1
    fi
  done
fi

echo "== restoring the DES log anchor =="
for lane in "${LANES[@]}"; do
  src=$(ls -d "/Users/andres/psb-${lane}"/docs/feature/*/deliver 2>/dev/null | head -1)
  [[ -n "$src" ]] || continue
  feature=$(basename "$(dirname "$src")")
  target="docs/feature/${feature}/deliver"
  # The merge may have written a real directory here. Replace it with a link to
  # the lane's live copy. Nothing is lost: the merged content is still in git.
  [[ -L "$target" ]] || rm -rf "$target"
  mkdir -p "$(dirname "$target")"
  ln -sfn "$src" "$target"
  printf '  %-42s -> psb-%s\n' "$feature" "$lane"
done

echo "== verifying =="
resolved=0
for log in docs/feature/*/deliver/execution-log.json; do [[ -r "$log" ]] && resolved=$((resolved+1)); done
echo "  ${resolved} lane log(s) resolve through the anchor"
echo "  commit verifier sees: $(git log --oneline --grep='Step-ID:' | wc -l | tr -d ' ') step commits from HEAD"
