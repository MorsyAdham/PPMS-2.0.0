#!/usr/bin/env bash
# Put an earlier deployed version of PPMS back on the live site.
#
#   tools/rollback.sh <production-commit> ["reason"]         live site (production/main)
#   tools/rollback.sh --v2 <production-commit> ["reason"]    v2 branch (Vercel)
#
# <production-commit> is a commit ON THE PRODUCTION BRANCH (what was live at
# some point — see `git log production/main`). Its files are copied into a new
# commit on top of the branch with a fresh version number, so history is kept
# and nothing is force-pushed. Users' version chip then offers the "new"
# (older) code like any other update.
#
# The workspace app/ folder is NOT changed: after a rollback the control panel
# shows the live site as "different from workspace" until you fix forward and
# deploy again with tools/deploy.sh.
set -euo pipefail

REMOTE=production
BRANCH=main
if [ "${1:-}" = "--v2" ]; then
    BRANCH=v2
    shift
fi
TARGET="${1:?usage: tools/rollback.sh [--v2] <production-commit> [reason]}"
REASON="${2:-}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

git fetch -q "$REMOTE" "$BRANCH"
if ! git merge-base --is-ancestor "$TARGET" "$REMOTE/$BRANCH"; then
    echo "$TARGET is not a commit on $REMOTE/$BRANCH - refusing." >&2
    exit 1
fi

OLD_LABEL="$(git show "$TARGET:version.json" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).label||'')}catch{console.log('')}})")"
OLD_LABEL="${OLD_LABEL:-$(git rev-parse --short "$TARGET")}"
MSG="Rollback to $OLD_LABEL${REASON:+ - $REASON}"

WT="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git worktree add -q --detach "$WT" "$REMOTE/$BRANCH"

# Replace every file with the target version's files.
git -C "$WT" rm -rq --ignore-unmatch .
git -C "$WT" checkout "$TARGET" -- .

VERSION_NUM=$(( $(git -C "$WT" rev-list --count HEAD) + 1 ))
VERSION_LABEL="v$VERSION_NUM"
VERSION_ID="$VERSION_LABEL-$(git rev-parse --short "$TARGET")"
node "$ROOT/tools/stamp_version.cjs" "$WT" "$WT" "$VERSION_LABEL" "$VERSION_ID" "$MSG"
git -C "$WT" add -A

if git -C "$WT" diff --cached --quiet -- . ':(exclude)version.json' ':(exclude)scripts/core/build-info.js'; then
    echo "$REMOTE/$BRANCH already has the same files as $OLD_LABEL - nothing to roll back."
    exit 0
fi
git -C "$WT" diff --cached --stat | tail -1
git -C "$WT" commit -q -m "$MSG"
git -C "$WT" push -q "$REMOTE" HEAD:"refs/heads/$BRANCH"
echo "Rolled $REMOTE/$BRANCH back to the files of $OLD_LABEL, published as $VERSION_LABEL ($(git -C "$WT" rev-parse --short HEAD))."
