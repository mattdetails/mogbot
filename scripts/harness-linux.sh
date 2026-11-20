#!/usr/bin/env bash
# The harness as Linux draws it (Linux Chromium and Linux WebKit, Linux fonts and
# scrollbars), from a Mac, in Docker's Playwright image. Needs Docker running and
# `pnpm harness` up (SHIPSTUDIO_HARNESS_PORT, default 1425).
#
#   scripts/harness-linux.sh <scenario>… [--theme light|dark] [--out dir]
#
# The harness answers only on this Mac's loopback, so a two-hop forward carries it
# into the container: a host proxy on :$((PORT+1000)), and inside the container a
# forward from its own 127.0.0.1:$PORT to that, so the Host header stays one the
# harness allows. Uses the playwright-core in the npx cache (PLAYWRIGHT_CORE to pick).
set -euo pipefail
PORT="${SHIPSTUDIO_HARNESS_PORT:-1425}"
IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.65.1-noble}"
CORE="${PLAYWRIGHT_CORE:-$(ls -d "$HOME"/.npm/_npx/*/node_modules/playwright-core | while read -r d; do grep -q '"version": "1.65' "$d/package.json" && echo "$d" && break; done)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/harness/shots/platforms"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
mkdir -p "$OUT"
node -e "
require('net').createServer(c=>{const u=require('net').connect($PORT,'127.0.0.1');c.pipe(u).pipe(c);c.on('error',()=>u.destroy());u.on('error',()=>c.destroy())}).listen($((PORT+1000)),'0.0.0.0')" &
PROXY=$!
trap 'kill $PROXY 2>/dev/null' EXIT
docker run --rm --ipc=host \
  -e SHIPSTUDIO_HARNESS_PORT="$PORT" -e PLAYWRIGHT_CORE=/pw/playwright-core \
  -v "$CORE":/pw/playwright-core:ro -v "$ROOT/scripts":/s:ro -v "$OUT":/out \
  "$IMAGE" bash -c "
node -e \"require('net').createServer(c=>{const u=require('net').connect($((PORT+1000)),'host.docker.internal');c.pipe(u).pipe(c);c.on('error',()=>u.destroy());u.on('error',()=>c.destroy())}).listen($PORT,'127.0.0.1')\" &
sleep 1; node /s/harness-platforms.mjs ${ARGS[*]} --engines linux-chromium,linux-webkit --out /out"
