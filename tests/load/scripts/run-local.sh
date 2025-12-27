#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$LOAD_DIR")")"
SCENARIO="${1:-full-platform}"
shift 2>/dev/null || true

# Universal test API key - created by scripts/seed-test-api-key.ts
UNIVERSAL_TEST_KEY="eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

export LOAD_TEST_ENV="local"
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export API_KEY="${API_KEY:-${LOCAL_API_KEY:-$UNIVERSAL_TEST_KEY}}"

echo "🏠 LOCAL LOAD TEST"
echo "   Scenario: $SCENARIO"
echo "   Target:   $BASE_URL"
echo "   API Key:  ${API_KEY:0:20}..."

# Check k6 installed
command -v k6 &>/dev/null || { echo "❌ k6 not installed (brew install k6)"; exit 1; }

# Check server is running
echo ""
echo "Checking server..."
if ! curl -sf --max-time 5 "$BASE_URL/.well-known/agent-card.json" >/dev/null 2>&1; then
  echo "❌ Server not running at $BASE_URL"
  echo ""
  echo "To start the server:"
  echo "  1. Seed the database: bun scripts/seed-test-api-key.ts"
  echo "  2. Start the server:  bun run dev"
  echo ""
  exit 1
fi
echo "✓ Server responding"

# Verify API key works
echo "Verifying API key..."
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/api/credits/balance" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "⚠ API key returned HTTP $HTTP_CODE"
  echo ""
  echo "To fix authentication:"
  echo "  1. Seed test data: bun scripts/seed-test-api-key.ts"
  echo "  2. Restart server:  bun run dev"
  echo ""
  echo "Continuing with test (auth endpoints may fail)..."
else
  echo "✓ API key authenticated"
fi

cd "$LOAD_DIR" && mkdir -p dist results

# Bundle the scenario
echo ""
echo "📦 Bundling $SCENARIO..."
bun x esbuild "scenarios/${SCENARIO}.ts" --bundle --outfile="dist/${SCENARIO}.js" \
  --format=esm --platform=neutral --target=es2020 \
  --external:k6 --external:'k6/*' --external:'https://jslib.k6.io/*' --minify

# Run k6
echo ""
echo "🚀 Running load test..."
k6 run --out json="results/${SCENARIO}-$(date +%Y%m%d-%H%M%S).json" "dist/${SCENARIO}.js" "$@"
