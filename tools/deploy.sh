#!/usr/bin/env bash
# Publish an app folder to the Planning-Monitoring-System repo.
#
#   tools/deploy.sh ["commit message"]         app/    -> main  (live site, GitHub Pages)
#   tools/deploy.sh --v2 ["commit message"]    app-v2/ -> v2    (new secure system, Vercel)
#
# The target branch's contents are exactly the source folder. This script
# copies the folder into a temporary checkout of that branch, commits, and
# pushes (fast-forward, never a force-push). The commit message defaults to
# the latest workspace commit's message.
#
# Needs git remote "production" -> https://github.com/MorsyAdham/Planning-Monitoring-System.git
set -euo pipefail

REMOTE=production
SRC=app
BRANCH=main
if [ "${1:-}" = "--v2" ]; then
    SRC=app-v2
    BRANCH=v2
    shift
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
    echo "Missing git remote '$REMOTE'. Add it with:" >&2
    echo "  git remote add $REMOTE https://github.com/MorsyAdham/Planning-Monitoring-System.git" >&2
    exit 1
fi
if [ ! -d "$SRC" ]; then
    echo "Folder $SRC/ not found." >&2
    exit 1
fi
if [ -n "$(git status --porcelain -- "$SRC")" ]; then
    echo "$SRC/ has uncommitted changes - commit them first so the workspace and deployed code stay in sync." >&2
    exit 1
fi

MSG="${1:-$(git log -1 --format=%B)}"

# A new branch (first v2 deploy) starts from main's history.
if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
    BASE="$BRANCH"
else
    BASE=main
    echo "Branch '$BRANCH' does not exist on $REMOTE yet - creating it from main."
fi
git fetch -q "$REMOTE" "$BASE"

WT="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git worktree add -q --detach "$WT" "$REMOTE/$BASE"

# Mirror the folder exactly: drop everything tracked, copy it in, let git work out the diff.
git -C "$WT" rm -rq --ignore-unmatch .
cp -R "$SRC"/. "$WT/"
git -C "$WT" add -A

# version.json is regenerated every deploy, so leave it out of "anything changed?"
if git -C "$WT" diff --cached --quiet -- . ':(exclude)version.json' && [ "$BASE" = "$BRANCH" ]; then
    echo "$REMOTE/$BRANCH already matches $SRC/ - nothing to deploy."
    exit 0
fi

# Release manifest for the in-app "Update available" notice
# (scripts/features/update-notice): which version is live, when, what's new,
# and the files a browser should re-download before reloading onto it.
VERSION_ID="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
( cd "$SRC" && find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) | sed 's|^\./||' | sort ) \
    | VERSION_ID="$VERSION_ID" NOTES="$(printf '%s' "$MSG" | head -n 1)" node -e '
        const files = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
        process.stdout.write(JSON.stringify({
            version: process.env.VERSION_ID,
            deployedAt: new Date().toISOString(),
            notes: process.env.NOTES,
            files,
        }, null, 1));' > "$WT/version.json"
git -C "$WT" add version.json

if ! git -C "$WT" diff --cached --quiet; then
    git -C "$WT" diff --cached --stat | tail -1
    git -C "$WT" commit -q -m "$MSG"
fi
git -C "$WT" push -q "$REMOTE" HEAD:"refs/heads/$BRANCH"
echo "Deployed $SRC/ as $(git -C "$WT" rev-parse --short HEAD) to $REMOTE/$BRANCH."
