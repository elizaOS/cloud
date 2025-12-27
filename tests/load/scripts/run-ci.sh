#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(dirname "$SCRIPT_DIR")"
SCENARIO="${1:-smoke}"

# Universal test API key - created by scripts/seed-test-api-key.ts
UNIVERSAL_TEST_KEY="eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

export LOAD_TEST_ENV="${LOAD_TEST_ENV:-local}"
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export API_KEY="${API_KEY:-$UNIVERSAL_TEST_KEY}"

echo "::group::Load Test Setup"
echo "Scenario:    $SCENARIO"
echo "Environment: $LOAD_TEST_ENV"
echo "Target:      $BASE_URL"
echo "API Key:     ${API_KEY:0:20}..."
echo "::endgroup::"

cd "$LOAD_DIR" && mkdir -p dist results

echo "::group::Bundle Scenario"
bun x esbuild "scenarios/${SCENARIO}.ts" --bundle --outfile="dist/${SCENARIO}.js" \
  --format=esm --platform=neutral --target=es2020 \
  --external:k6 --external:'k6/*' --external:'https://jslib.k6.io/*' --minify
echo "::endgroup::"

echo "::group::Run Load Test"
k6 run \
  --out json="results/ci-${SCENARIO}.json" \
  --summary-export="results/summary-${SCENARIO}.json" \
  "dist/${SCENARIO}.js"
EXIT_CODE=$?
echo "::endgroup::"

# Output summary
if [[ -f "results/summary-${SCENARIO}.json" ]]; then
  echo "::group::Test Summary"
  jq '.' "results/summary-${SCENARIO}.json" 2>/dev/null || cat "results/summary-${SCENARIO}.json"
  echo "::endgroup::"
fi

exit $EXIT_CODE
