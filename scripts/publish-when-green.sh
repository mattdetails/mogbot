#!/usr/bin/env bash
# Publish the release built at HEAD once CI on that exact commit has finished
# green. One straight line: no background jobs, no `wait`, no polling loop of
# our own (1.0.24's watcher died on `wait` after CI went green).
#
#   scripts/publish-when-green.sh            # HEAD
#   scripts/publish-when-green.sh <sha>      # checks out nothing: <sha> must be HEAD
#
# A red or cancelled run stops here: read every failed job, fix them all in one
# push, and start again on the new commit. release-mac.sh checks the same thing
# again before it publishes.
set -euo pipefail
cd "$(dirname "$0")/.."

SHA="$(git rev-parse "${1:-HEAD}")"
[ "$SHA" = "$(git rev-parse HEAD)" ] || { echo "Error: $SHA isn't HEAD; check it out first." >&2; exit 1; }
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

echo "Waiting for a CI run on ${SHA:0:9}..."
RUN=''
for _ in $(seq 1 60); do
  RUN="$(gh run list -R "$REPO" --commit "$SHA" --workflow CI --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$RUN" ] && break
  sleep 10
done
[ -n "$RUN" ] || { echo "Error: no CI run for ${SHA:0:9} after 10 minutes. Was it pushed?" >&2; exit 1; }

echo "CI run $RUN: https://github.com/$REPO/actions/runs/$RUN"
if ! gh run watch "$RUN" -R "$REPO" --interval 60 --exit-status >/dev/null; then
  echo "Error: CI run $RUN didn't pass. Failed jobs:" >&2
  gh run view "$RUN" -R "$REPO" --json jobs --jq '.jobs[]|select(.conclusion!="success")|"  \(.name): \(.conclusion)"' >&2
  exit 1
fi

echo "CI green on ${SHA:0:9}. Publishing."
./scripts/release-mac.sh --skip-build --publish
