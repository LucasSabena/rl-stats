#!/usr/bin/env bash
# Capture harness launcher. Keeps the preview server and the Playwright run in
# one supervised process tree so a hang is easy to spot in the log file.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${CAPTURE_PORT:-4183}"
LOG="${CAPTURE_LOG:-/tmp/opencode/rl-landing-capture.log}"

mkdir -p /tmp/opencode
: > "$LOG"

echo "[capture] root=$ROOT port=$PORT" | tee -a "$LOG"

cleanup() {
  if [[ -n "${PREVIEW_PID:-}" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[capture] starting vite preview" | tee -a "$LOG"
( cd "$ROOT" && exec node node_modules/vite/bin/vite.js preview --port "$PORT" --strictPort ) >>"$LOG" 2>&1 &
PREVIEW_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "[capture] preview up" | tee -a "$LOG"
    break
  fi
  sleep 0.5
done

echo "[capture] running playwright" | tee -a "$LOG"
cd "$ROOT/landing" || exit 1
pnpm exec playwright test -c scripts/playwright.capture.config.ts "$@" >>"$LOG" 2>&1
STATUS=$?
echo "[capture] playwright exit=$STATUS" | tee -a "$LOG"
tail -40 "$LOG"
exit "$STATUS"
