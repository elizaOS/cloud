#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(dirname "$SCRIPT_DIR")"
SCENARIO="smoke"

export LOAD_TEST_ENV="production"
export BASE_URL="${BASE_URL:-https://elizacloud.ai}"

command -v k6 &>/dev/null || { echo "❌ k6 not installed"; exit 1; }
[[ -z "$PROD_API_KEY" ]] && { echo "❌ PROD_API_KEY required"; exit 1; }
export API_KEY="$PROD_API_KEY"

echo "🚀 PRODUCTION | smoke only | $BASE_URL (max 10 VUs, 2 min)"
read -p "⚠️  Run against PRODUCTION? (type 'yes') " CONFIRM
[[ "$CONFIRM" != "yes" ]] && { echo "Cancelled"; exit 0; }

cd "$LOAD_DIR" && mkdir -p dist results
bun x esbuild "scenarios/${SCENARIO}.ts" --bundle --outfile="dist/${SCENARIO}.js" --format=esm --platform=neutral --target=es2020 --external:k6 --external:'k6/*' --external:'https://jslib.k6.io/*' --minify

k6 run --vus 5 --duration 2m --out json="results/${SCENARIO}-production-$(date +%Y%m%d-%H%M%S).json" "dist/${SCENARIO}.js"
