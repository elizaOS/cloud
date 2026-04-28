#!/usr/bin/env bash
# =============================================================================
# cf-bootstrap.sh — One-time Cloudflare resource bootstrap for eliza-cloud
# =============================================================================
# Creates the R2 bucket, KV namespaces, and (optionally) Vectorize index that
# the Workers API and Pages frontend need.
#
# Idempotent: every create is wrapped in `|| true`, so re-running on an
# already-bootstrapped account is safe.
#
# Prerequisites:
#   - `wrangler` CLI installed (npm i -g wrangler  OR  bunx wrangler)
#   - `wrangler login` already run, OR CLOUDFLARE_API_TOKEN exported
#
# Usage:
#   bash scripts/cf-bootstrap.sh
#
# After running, paste the printed namespace IDs into cloud/api/wrangler.toml
# at the `id = "REPLACE_ME"` lines.
# =============================================================================

set -u  # NOT -e: we want to continue past idempotent failures

WRANGLER="${WRANGLER:-wrangler}"
R2_BUCKET="${R2_BUCKET:-eliza-cloud-blob}"
VECTORIZE_INDEX="${VECTORIZE_INDEX:-eliza-cloud-embeddings}"
SKIP_VECTORIZE="${SKIP_VECTORIZE:-0}"

echo "============================================================"
echo "  eliza-cloud Cloudflare bootstrap"
echo "  wrangler: $($WRANGLER --version 2>/dev/null || echo 'NOT FOUND')"
echo "============================================================"
echo

# -----------------------------------------------------------------------------
# 1. R2 bucket — replaces @vercel/blob
# -----------------------------------------------------------------------------
echo "[1/3] Creating R2 bucket: $R2_BUCKET"
$WRANGLER r2 bucket create "$R2_BUCKET" || true
echo

# -----------------------------------------------------------------------------
# 2. KV namespaces — session cache, rate limit, general cache
# -----------------------------------------------------------------------------
echo "[2/3] Creating KV namespaces"
echo "      Capture the printed `id` values and paste them into"
echo "      cloud/api/wrangler.toml (kv_namespaces blocks)."
echo

for NS in SESSION_CACHE RATE_LIMIT CACHE; do
  echo "  -> $NS (production)"
  $WRANGLER kv namespace create "$NS" || true
  echo "  -> $NS (preview)"
  $WRANGLER kv namespace create "$NS" --preview || true
  echo
done

# -----------------------------------------------------------------------------
# 3. Vectorize index — embeddings (optional)
# -----------------------------------------------------------------------------
if [ "$SKIP_VECTORIZE" = "1" ]; then
  echo "[3/4] Skipping Vectorize index (SKIP_VECTORIZE=1)"
else
  echo "[3/4] Creating Vectorize index: $VECTORIZE_INDEX"
  echo "      (set SKIP_VECTORIZE=1 to skip; requires Workers Paid plan)"
  $WRANGLER vectorize create "$VECTORIZE_INDEX" \
    --dimensions=1536 \
    --metric=cosine \
    || true
fi
echo

# -----------------------------------------------------------------------------
# 4. Cloudflare Queues — Stripe webhook fan-out
# -----------------------------------------------------------------------------
# The Stripe webhook handler enqueues to STRIPE_QUEUE; the same Worker consumes
# the queue and runs the heavy fan-out (credits, splits, redeemable earnings,
# cache invalidation). A dead-letter queue catches messages that exhaust
# max_retries (currently 5). See cloud/INFRA.md "Cloudflare Queues" for
# monitoring + DLQ drain procedure.
# -----------------------------------------------------------------------------
echo "[4/4] Creating Stripe webhook queues"
$WRANGLER queues create stripe-events || true
$WRANGLER queues create stripe-events-dlq || true
$WRANGLER queues create stripe-events-staging || true
$WRANGLER queues create stripe-events-staging-dlq || true
echo

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo "============================================================"
echo "  Bootstrap complete."
echo
echo "  Next steps:"
echo "    1. Open cloud/api/wrangler.toml"
echo "    2. Replace each REPLACE_ME 'id' with the matching namespace ID"
echo "       printed above (SESSION_CACHE, RATE_LIMIT, CACHE)."
echo "    3. Set 'account_id' in cloud/api/wrangler.toml to your Cloudflare"
echo "       account ID (wrangler whoami)."
echo "    4. Push secrets:  bun run cf:secrets:put:staging"
echo "                      bun run cf:secrets:put:prod"
echo "    5. First deploy:  bun run cf:deploy"
echo "============================================================"
