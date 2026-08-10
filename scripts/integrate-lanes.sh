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
  # Undo the anchor links BEFORE merging. Some lanes force-added their
  # execution-log.json even though it is normally ignored, so in those features
  # the file is tracked — and a tracked file replaced by a symlink is a
  # TYPECHANGE, which git refuses to merge across. It aborts with "commit your
  # changes before you merge" and names a file nobody edited, which is a
  # confusing way to lose ten minutes. Restore, merge, relink.
  echo "== restoring tracked logs before the merge =="
  restored=0
  for f in $(git status --porcelain | awk '$1=="T"{print $2}'); do
    rm -f "$f"; git checkout -- "$f" 2>/dev/null && restored=$((restored+1))
  done
  echo "  ${restored} log(s) restored from git"

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
# Link ONLY execution-log.json, never the whole deliver directory.
#
# Symlinking the directory looked simpler and was wrong: `deliver/` also holds
# TRACKED files — roadmap.json above all — so replacing it with a link makes git
# report every one of them deleted, and the next merge conflicts against the
# deletions. That cost a confusing round of phantom conflicts on 2026-08-10.
#
# execution-log.json is gitignored and per-worktree by design, which is exactly
# why it never syncs through a merge and exactly why it is the one file that
# needs linking. Linking precisely it leaves git's view untouched.
for lane in "${LANES[@]}"; do
  src=$(ls -d "/Users/andres/psb-${lane}"/docs/feature/*/deliver 2>/dev/null | head -1)
  [[ -n "$src" ]] || continue
  feature=$(basename "$(dirname "$src")")
  target_dir="docs/feature/${feature}/deliver"
  # If a previous run replaced the directory with a link, restore the real thing
  # from git before relinking the single file.
  if [[ -L "$target_dir" ]]; then
    rm "$target_dir"
    git checkout -- "$target_dir" 2>/dev/null || mkdir -p "$target_dir"
  fi
  mkdir -p "$target_dir"
  ln -sfn "${src}/execution-log.json" "${target_dir}/execution-log.json"
  printf '  %-42s execution-log -> psb-%s\n' "$feature" "$lane"
done

echo "== verifying =="
resolved=0
for log in docs/feature/*/deliver/execution-log.json; do [[ -r "$log" ]] && resolved=$((resolved+1)); done
echo "  ${resolved} lane log(s) resolve through the anchor"
echo "  commit verifier sees: $(git log --oneline --grep='Step-ID:' | wc -l | tr -d ' ') step commits from HEAD"
