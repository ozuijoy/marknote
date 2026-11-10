#!/usr/bin/env bash
# 本機測試環境（不需要 Neon 帳號）：
#   1. 啟動本地 PostgreSQL（apt 安裝或 Docker 皆可，預設 127.0.0.1:5433）
#   2. 啟動 dev/shim：把 Neon HTTP SQL 協定轉譯到本地 PostgreSQL
#   3. 套用 sql/schema.sql
#   4. build + start Next.js（PORT=3100）
#
# 用法：
#   bash dev/run-local.sh build   # 完整流程（含 npm run build）
#   bash dev/run-local.sh start   # 只重啟伺服器（沿用既有 build）
#   bash dev/run-local.sh test    # 跑整合測試（需先 start）
#   bash dev/run-local.sh stop    # 停掉 Next.js 與 shim
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://marknote:marknote@ep-local-000000.ap-southeast-1.aws.neon.tech/marknote?sslmode=require}"
export NEON_FETCH_ENDPOINT="${NEON_FETCH_ENDPOINT:-http://127.0.0.1:5599/sql}"
export APP_PASSWORD="${APP_PASSWORD:-test-password-123}"
export AUTH_SECRET="${AUTH_SECRET:-local-test-secret-0123456789abcdefghijklmnopqrstuvwxyzABCDEF}"
# 本機走 http，必須停用 Secure cookie，否則瀏覽器不會保存 session
export COOKIE_SECURE="${COOKIE_SECURE:-false}"
export NEXT_PUBLIC_APP_NAME="${NEXT_PUBLIC_APP_NAME:-MarkNote}"
export PORT="${PORT:-3100}"
# 檔案庫：本機用 dev/shim/s3.mjs 模擬 Neon Object Storage
export AWS_ENDPOINT_URL_S3="${AWS_ENDPOINT_URL_S3:-http://127.0.0.1:5600}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test-access-key}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test-secret-key}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export STORAGE_BUCKET="${STORAGE_BUCKET:-marknote-files}"
SHIM_PG_URL="${SHIM_PG_URL:-postgres://marknote@127.0.0.1:5433/marknote}"
S3_PORT="${S3_PORT:-5600}"

stop_all() {
  [ -f /tmp/marknote-next.pid ] && kill "$(cat /tmp/marknote-next.pid)" 2>/dev/null || true
  [ -f /tmp/marknote-shim.pid ] && kill "$(cat /tmp/marknote-shim.pid)" 2>/dev/null || true
  [ -f /tmp/marknote-s3.pid ] && kill "$(cat /tmp/marknote-s3.pid)" 2>/dev/null || true
  rm -f /tmp/marknote-next.pid /tmp/marknote-shim.pid /tmp/marknote-s3.pid
}

# 測試用 S3 模擬器（Neon Object Storage 走相同 S3 協定）
start_s3() {
  if curl -sf -m 2 "http://127.0.0.1:${S3_PORT}/health" >/dev/null 2>&1; then
    echo "→ S3 模擬器已在執行"
  else
    echo "→ 啟動 S3 模擬器（127.0.0.1:${S3_PORT}）"
    nohup node dev/shim/s3.mjs > /tmp/marknote-s3.log 2>&1 < /dev/null &
    echo $! > /tmp/marknote-s3.pid
    sleep 1
    curl -sf -m 5 "http://127.0.0.1:${S3_PORT}/health" >/dev/null || { echo "✗ S3 模擬器啟動失敗，見 /tmp/marknote-s3.log"; exit 1; }
  fi
  # 建立測試 bucket（模擬器重啟後會清空）
  curl -sf -m 5 -X PUT "http://127.0.0.1:${S3_PORT}/${STORAGE_BUCKET}" >/dev/null || true
}

start_shim() {
  if curl -sf -m 2 http://127.0.0.1:5599/health >/dev/null 2>&1; then
    echo "→ shim 已在執行"
    return
  fi
  if [ ! -d dev/shim/node_modules ]; then
    echo "→ 安裝 shim 相依套件（pg）"
    (cd dev/shim && npm install --no-audit --no-fund >/dev/null)
  fi
  echo "→ 啟動 Neon 相容 shim（$SHIM_PG_URL）"
  (cd dev/shim && SHIM_PG_URL="$SHIM_PG_URL" nohup node server.mjs > /tmp/marknote-shim.log 2>&1 < /dev/null &)
  sleep 2
  curl -sf -m 5 http://127.0.0.1:5599/health >/dev/null || { echo "✗ shim 啟動失敗，見 /tmp/marknote-shim.log"; exit 1; }
}

start_server() {
  [ -f /tmp/marknote-next.pid ] && kill "$(cat /tmp/marknote-next.pid)" 2>/dev/null || true
  echo "→ 啟動 Next.js（http://127.0.0.1:${PORT}）"
  nohup ./node_modules/.bin/next start -p "$PORT" > /tmp/marknote-next.log 2>&1 < /dev/null &
  echo $! > /tmp/marknote-next.pid
  for _ in $(seq 1 30); do
    if curl -sf -m 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      echo "✓ 伺服器就緒"
      return
    fi
    sleep 1
  done
  echo "✗ 伺服器啟動失敗，見 /tmp/marknote-next.log"
  exit 1
}

case "${1:-start}" in
  stop)
    stop_all
    echo "✓ 已停止"
    ;;
  build)
    start_shim
    start_s3
    npm run db:init
    npm run build
    stop_all
    start_server
    ;;
  start)
    start_shim
    start_s3
    npm run db:init >/dev/null
    start_server
    ;;
  test)
    start_s3
    npm test
    BASE_URL="http://127.0.0.1:${PORT}" TEST_PASSWORD="$APP_PASSWORD" node --test --test-reporter=spec tests/api.test.mjs
    ;;
  *)
    echo "用法：bash dev/run-local.sh {build|start|test|stop}"
    exit 1
    ;;
esac
