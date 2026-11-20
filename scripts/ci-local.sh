#!/usr/bin/env bash
# The checks CI runs, in one place, so a push or a release is checked the same
# way on this Mac as on GitHub. CI's Frontend job runs `ci-local.sh frontend`
# itself, so the two can't drift apart.
#
#   scripts/ci-local.sh frontend   CI's Frontend job (what pre-push runs)
#   scripts/ci-local.sh rust       cargo fmt --check and clippy, as CI runs them
#   scripts/ci-local.sh release    everything above, plus Rust tests and axe over
#                                  every harness scenario in both themes
#                                  (release.sh runs this before it tags)
#
# Every step runs even after one fails, and the summary lists every failure,
# so one round fixes them all (1.0.24 took seven pushes, one failure at a time).
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"

MODE="${1:-frontend}"
FAILED=()

step() {
  local name="$1"
  shift
  printf '\n==> %s\n' "$name"
  if "$@"; then
    printf 'ok  %s\n' "$name"
  else
    printf 'FAIL %s\n' "$name"
    FAILED+=("$name")
  fi
}

frontend() {
  step 'Config integrity' bash scripts/check-config-integrity.sh
  step 'Brand identity' pnpm -s check:brand
  step 'Type check' pnpm -s typecheck
  step 'Lint (strict)' pnpm -s lint:strict
  step 'Format check' pnpm -s format:check
  step 'Tests' pnpm -s test:run
  step 'Tooling tests' pnpm -s test:scripts
  step 'Icon inventory' pnpm -s icons:check
  step 'Design-system docs' pnpm -s docs:check
  step 'UI baseline' pnpm -s check:ui-baseline
  step 'Code patterns' pnpm -s check:patterns
}

rust() {
  step 'cargo fmt --check' cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
  step 'clippy' cargo clippy --manifest-path src-tauri/Cargo.toml -- -A clippy::uninlined_format_args
}

a11y() {
  local port="${SHIPSTUDIO_HARNESS_PORT:-1425}"
  if ! curl -sf "http://127.0.0.1:${port}/harness.html" >/dev/null; then
    pnpm harness >/tmp/ci-local-harness.log 2>&1 &
    local pid=$!
    trap 'kill $pid 2>/dev/null' EXIT
    for _ in $(seq 1 60); do
      curl -sf "http://127.0.0.1:${port}/harness.html" >/dev/null && break
      sleep 1
    done
  fi
  step 'Accessibility (light)' pnpm -s check:a11y --theme light
  step 'Accessibility (dark)' pnpm -s check:a11y --theme dark
}

case "$MODE" in
  frontend) frontend ;;
  rust) rust ;;
  release)
    frontend
    rust
    step 'Rust tests' cargo test --manifest-path src-tauri/Cargo.toml --lib --bins --tests
    a11y
    ;;
  *)
    echo "usage: $0 frontend|rust|release" >&2
    exit 2
    ;;
esac

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "All $MODE checks passed."
  exit 0
fi
echo "${#FAILED[@]} failed:"
printf '  - %s\n' "${FAILED[@]}"
exit 1
