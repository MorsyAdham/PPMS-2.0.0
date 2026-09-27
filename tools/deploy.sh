#!/usr/bin/env bash
# Publish app/ to the live site.
#
# The live PPMS site is GitHub Pages on MorsyAdham/Planning-Monitoring-System,
# whose repo root is exactly the contents of app/. This script copies app/
# into a temporary checkout of that repo, commits, and pushes (fast-forward,
# never a force-push).
#
# Usage:   tools/deploy.sh ["commit message"]
#          (defaults to the message of the latest workspace commit)
# Needs:   git remote "production" -> https://github.com/MorsyAdham/Planning-Monitoring-System.git
set -euo pipefail

REMOTE=production
BRANCH=main
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
    echo "Missing git remote '$REMOTE'. Add it with:" >&2
    echo "  git remote add $REMOTE https://github.com/MorsyAdham/Planning-Monitoring-System.git" >&2
    exit 1
fi
if [ -n "$(git status --porcelain -- app)" ]; then
    echo "app/ has uncommitted changes - commit them first so the workspace and live site stay in sync." >&2
    exit 1
fi

MSG="${1:-$(git log -1 --format=%B)}"

git fetch -q "$REMOTE" "$BRANCH"
WT="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git worktree add -q --detach "$WT" "$REMOTE/$BRANCH"

# Mirror app/ exactly: drop everything tracked, copy app/ in, let git work out the diff.
git -C "$WT" rm -rq --ignore-unmatch .
cp -R app/. "$WT/"
git -C "$WT" add -A

if git -C "$WT" diff --cached --quiet; then
    echo "Live site already matches app/ - nothing to deploy."
    exit 0
fi

git -C "$WT" diff --cached --stat | tail -1
git -C "$WT" commit -q -m "$MSG"
git -C "$WT" push -q "$REMOTE" HEAD:"$BRANCH"
echo "Deployed $(git -C "$WT" rev-parse --short HEAD) to $REMOTE/$BRANCH - GitHub Pages updates in about a minute."
