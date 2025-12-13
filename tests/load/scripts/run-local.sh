#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(dirname "$SCRIPT_DIR")"
SCENARIO="${1:-full-platform}"
shift 2>/dev/null || true

export LOAD_TEST_ENV="local"
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export API_KEY="${API_KEY:-${LOCAL_API_KEY:-sk_test_load_testing_key}}"

echo "🏠 LOCAL | $SCENARIO | $BASE_URL"

command -v k6 &>/dev/null || { echo "❌ k6 not installed (brew install k6)"; exit 1; }
curl -s "$BASE_URL/api/a2a" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"a2a.getAgentCard","id":1}' >/dev/null 2>&1 || { echo "❌ Server not running (bun run dev)"; exit 1; }

cd "$LOAD_DIR" && mkdir -p dist results
bun x esbuild "scenarios/${SCENARIO}.ts" --bundle --outfile="dist/${SCENARIO}.js" --format=esm --platform=neutral --target=es2020 --external:k6 --external:'k6/*' --external:'https://jslib.k6.io/*' --minify

k6 run --out json="results/${SCENARIO}-$(date +%Y%m%d-%H%M%S).json" "dist/${SCENARIO}.js" "$@"
