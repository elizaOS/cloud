#!/bin/bash
# Postinstall script to clean up problematic files from node_modules
# These files cause Turbopack bundling issues when pino/thread-stream are resolved

# Detect monorepo root (2 levels up from vendor/cloud/scripts)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="${1:-$(dirname $(dirname $(dirname "$SCRIPT_DIR")))}"

# Only run cleanup if .bun directory exists (monorepo install)
if [ ! -d "$MONOREPO_ROOT/node_modules/.bun" ]; then
  exit 0
fi

echo "Cleaning problematic package files in $MONOREPO_ROOT..."

# Clean thread-stream test and bench files (causes tape/fastbench imports)
find "$MONOREPO_ROOT/node_modules/.bun" -path "*thread-stream*/test" -type d -exec rm -rf {} \; 2>/dev/null || true
find "$MONOREPO_ROOT/node_modules/.bun" -name "bench.js" -path "*thread-stream*" -type f -delete 2>/dev/null || true

# Clean pino test and bench files
find "$MONOREPO_ROOT/node_modules/.bun" -path "*pino*/test" -type d -exec rm -rf {} \; 2>/dev/null || true
find "$MONOREPO_ROOT/node_modules/.bun" -name "bench.js" -path "*pino*" -type f -delete 2>/dev/null || true

# Clean sonic-boom test files
find "$MONOREPO_ROOT/node_modules/.bun" -path "*sonic-boom*/test" -type d -exec rm -rf {} \; 2>/dev/null || true

echo "✓ Package cleanup complete"

