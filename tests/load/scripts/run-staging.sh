#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(dirname "$SCRIPT_DIR")"
SCENARIO="${1:-full-platform}"
shift 2>/dev/null || true

export LOAD_TEST_ENV="staging"
export BASE_URL="${BASE_URL:-https://staging.elizacloud.ai}"

command -v k6 &>/dev/null || { echo "❌ k6 not installed"; exit 1; }
[[ -z "$STAGING_API_KEY" ]] && { echo "❌ STAGING_API_KEY required"; exit 1; }
export API_KEY="$STAGING_API_KEY"

echo "🌐 STAGING | $SCENARIO | $BASE_URL (safe mode)"
read -p "⚠️  Run against STAGING? (y/N) " -n 1 -r; echo
[[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Cancelled"; exit 0; }

cd "$LOAD_DIR" && mkdir -p dist results
bun x esbuild "scenarios/${SCENARIO}.ts" --bundle --outfile="dist/${SCENARIO}.js" --format=esm --platform=neutral --target=es2020 --external:k6 --external:'k6/*' --external:'https://jslib.k6.io/*' --minify

k6 run --out json="results/${SCENARIO}-staging-$(date +%Y%m%d-%H%M%S).json" "dist/${SCENARIO}.js" "$@"
