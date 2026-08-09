#!/usr/bin/env bash
# Wire the tracked git hooks so they fire in EVERY worktree of this repo,
# on every branch. Run once; re-run whenever a hook here changes.
#
# WHY THE HOOKS ARE COPIED OUTSIDE THE WORKING TREE
# `core.hooksPath` lives in the shared .git/config, so all worktrees inherit
# it — but if the value is a path INSIDE the working tree, the hook file only
# exists in worktrees whose checked-out branch contains it, and git skips a
# missing hook without a word. Measured on TradelyHQ 2026-08-07: 1 worktree of
# ~200 had the pre-push hook; every other one pushed with zero checks while
# `git config core.hooksPath` reported a correct-looking value.
#
# So: copy the hooks to $GIT_COMMON_DIR/local-ci-hooks (shared by every
# worktree, outside any working tree) and point core.hooksPath there. The
# trade: a copy can drift from its tracked source, so each hook self-checks
# and warns when stale. Re-run this script to sync.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true
if [ -z "${REPO_ROOT:-}" ]; then
  echo "[install-hooks] not inside a git repo." >&2
  exit 1
fi
cd "$REPO_ROOT"

# --git-common-dir is the shared .git of the main checkout; every linked
# worktree resolves to the same path. --git-dir would give the per-worktree
# directory, which would reintroduce the exact per-worktree problem.
COMMON_DIR="$(git rev-parse --git-common-dir)"
case "$COMMON_DIR" in
  /*) ;;
  *) COMMON_DIR="$REPO_ROOT/$COMMON_DIR" ;;
esac

DEST="$COMMON_DIR/local-ci-hooks"
mkdir -p "$DEST"

for f in "$REPO_ROOT"/scripts/git-hooks/*; do
  name="$(basename "$f")"
  case "$name" in
    install.sh|README*) continue ;;
  esac
  cp "$f" "$DEST/$name"
  chmod +x "$DEST/$name"
done

git config core.hooksPath "$DEST"

echo "[install-hooks] core.hooksPath = $DEST"
echo "[install-hooks] shared by every worktree, on every branch:"
for f in "$DEST"/*; do
  [ -f "$f" ] && echo "  - $(basename "$f")"
done
echo
echo "[install-hooks] Re-run this script after changing anything in scripts/git-hooks/."
