#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(dirname "$SCRIPT_DIR")"
SCENARIO="${1:-smoke}"

export LOAD_TEST_ENV="${LOAD_TEST_ENV:-local}"
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export API_KEY="${API_KEY:-${CI_API_KEY:-sk_test_ci_key}}"

echo "::group::Load Test: $SCENARIO @ $BASE_URL"

cd "$LOAD_DIR" && mkdir -p dist results
bun x esbuild "scenarios/${SCENARIO}.ts" --bundle --outfile="dist/${SCENARIO}.js" --format=esm --platform=neutral --target=es2020 --external:k6 --external:'k6/*' --external:'https://jslib.k6.io/*' --minify

k6 run --out json="results/ci-${SCENARIO}-$(date +%Y%m%d-%H%M%S).json" --summary-export="results/summary-${SCENARIO}.json" "dist/${SCENARIO}.js"
EXIT_CODE=$?

echo "::endgroup::"
[[ -f "results/summary-${SCENARIO}.json" ]] && { echo "::group::Summary"; jq '.' "results/summary-${SCENARIO}.json" 2>/dev/null || cat "results/summary-${SCENARIO}.json"; echo "::endgroup::"; }

exit $EXIT_CODE
