#!/usr/bin/env bash
# 一键测试：启动临时静态服务器 → 单元测试 → 端到端 → 打印冒烟
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8787}"
TMP="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== 启动测试服务器 :$PORT =="
node "$ROOT/server.mjs" --port "$PORT" --host 127.0.0.1 > "$TMP/server.log" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/import.html" >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 0.15
done
if [ "$ready" != "1" ]; then
  echo "服务器启动失败："
  cat "$TMP/server.log" || true
  exit 1
fi

BASE="http://127.0.0.1:$PORT"

echo
echo "== 单元测试 =="
node --test "$ROOT/tests/unit.test.mjs"

echo
echo "== 端到端测试 =="
node "$ROOT/tests/e2e.mjs" "$BASE"

echo
echo "== 打印测试 =="
bash "$ROOT/tests/print.sh" "$BASE"
