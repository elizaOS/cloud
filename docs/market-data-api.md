# Market Data API

Provider-agnostic multi-chain market data API with credit-based billing.

## Architecture

### Provider Abstraction

The Market Data API is designed to be **provider-agnostic**. Routes never mention the underlying provider (currently Birdeye), making it trivial to swap providers without touching route files.

**WHY this matters:**

- **Provider migration**: Switch from Birdeye to CoinGecko/DexScreener in <1 hour
- **Multi-provider**: Run multiple providers simultaneously for redundancy
- **LLM-friendly**: AI agents can add routes without learning provider-specific APIs
- **Cost optimization**: Compare provider costs and switch to cheapest dynamically

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  Route: GET /api/v1/market/price/solana/EPj...                 │
│  Body: { method: "getPrice", chain: "solana", params: {...} }  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Handler: marketDataHandler (provider-agnostic)                 │
│  - Looks up PROVIDER_PATHS["getPrice"] → "/defi/price"         │
│  - Adds provider-specific headers (X-API-KEY, x-chain)         │
│  - Calls retryFetch with provider URL + path                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Upstream: https://public-api.birdeye.so/defi/price?address=...│
└─────────────────────────────────────────────────────────────────┘
```

**Single point of change**: Only `lib/services/proxy/services/market-data.ts` knows about Birdeye.

## Endpoints

### Token Price

```bash
GET /api/v1/market/price/{chain}/{address}
```

**WHY separate by chain/address:**

- RESTful: each resource has a unique URL
- Cacheable: browsers/CDNs can cache by URL
- Readable: `/market/price/solana/EPj...` is self-documenting

**Supported chains:** solana, ethereum, arbitrum, avalanche, bsc, optimism, polygon, base, zksync, sui

**Response:**

```json
{
  "value": 0.999845,
  "updateUnixTime": 1707523847,
  "priceChange24h": 0.0012
}
```

**Cost:** $0.000120 (10 CU)

---

### Token Overview

```bash
GET /api/v1/market/token/{chain}/{address}
```

Get comprehensive token metadata: supply, holders, liquidity, social links, security score.

**Cost:** $0.000360 (30 CU)

---

### OHLCV Candles

```bash
GET /api/v1/market/candles/{chain}/{address}?type=1H&time_from=1707000000&time_to=1707100000
```

**Query params:**

- `type`: `1m`, `3m`, `5m`, `15m`, `30m`, `1H`, `2H`, `4H`, `6H`, `8H`, `12H`, `1D`, `1W`
- `time_from`: Unix timestamp (seconds)
- `time_to`: Unix timestamp (seconds)

**WHY query params not in URL path:**

- Optional parameters: not all requests need time filtering
- Variable types: too many to enumerate in path
- HTTP spec: query params are for filtering, path is for resources

**Cost:** $0.000480 (40 CU)

---

### Token Trades

```bash
GET /api/v1/market/trades/{chain}/{address}?limit=50&offset=0&tx_type=swap
```

**Query params:**

- `limit`: 1-100 (default 50)
- `offset`: pagination offset
- `tx_type`: `swap`, `add`, `remove` (liquidity operations)

**⚠️ Non-cacheable**: Trades update every second. Always fetches fresh data.

**Cost:** $0.000120 (10 CU)

---

### Wallet Portfolio

```bash
GET /api/v1/market/portfolio/{chain}/{address}
```

Get all tokens held by a wallet with balances, prices, and USD values.

**WHY this is useful:**

- Portfolio tracking: see user's total holdings
- Token discovery: find what tokens users actually hold
- Analytics: understand which tokens are popular

**Cost:** $0.001200 (100 CU) - Most expensive due to multi-token lookups

## Pricing

All pricing is **DB-backed** with audit trails. To update pricing:

```bash
curl -X PUT https://api.elizacloud.ai/api/v1/admin/service-pricing \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "market-data",
    "method": "getPrice",
    "cost": 0.000150
  }'
```

**WHY DB-backed pricing:**

- **Instant updates**: No code deploys to change prices
- **Audit trail**: Every price change logged with who/when/why
- **A/B testing**: Easy to test different price points
- **Per-method granularity**: Charge more for expensive operations

### Pricing Formula

```
Cost = (Provider CU cost) × $0.00001 × 1.2 (markup)
```

**WHY 20% markup:**

- Covers platform costs (Redis, compute, support)
- Allows for provider price increases without immediate platform losses
- Industry standard: AWS charges 25-40% markup on upstream services

### Cache Economics

```
Cache hit: 50% of normal cost
Cache miss: 100% of normal cost
```

**WHY 50% split:**

- User saves money by using cache properly (setting `Cache-Control: max-age=30`)
- Platform saves upstream API costs
- Win-win: encourages efficient usage without making cache free (which leads to abuse)

**Example:**

```
getPrice = $0.000120 per request

Without caching: 1000 requests = $0.12
With caching (80% hit rate):
  - 200 misses × $0.000120 = $0.024
  - 800 hits × $0.000060 = $0.048
  - Total = $0.072 (40% savings for user)
```

## Validation

### Chain Validation

**WHY validate chains:**

- Fail-fast: reject invalid chains immediately, not after billing
- Security: prevent injection attacks via malformed chain names
- UX: clear error messages vs cryptic provider errors

**Supported chains:**

- Solana: `[1-9A-HJ-NP-Za-km-z]{32,44}` (base58)
- EVM: `0x[a-fA-F0-9]{40}` (checksummed hex)
- Sui: `0x[a-fA-F0-9]{64}` (longer hex)

### Address Validation

**WHY validate addresses:**

- **DoS prevention**: Reject 10MB "address" strings before they hit upstream
- **Cost saving**: Invalid address = wasted credits + API call
- **UX**: Instant feedback on typos vs 2-second upstream roundtrip

## Rate Limiting

**Default:** 100 requests/minute per organization

**WHY 100 req/min:**

- Birdeye free tier: 150 req/min
- We reserve 33% margin for retries + bursts
- Can increase per-org via pricing tiers

**WHY per-org not per-API-key:**

- Prevents users from creating multiple API keys to bypass limits
- Aligns with billing (credits are per-org)
- Simpler to manage and explain to users

## Caching

**Default TTL:** 30 seconds  
**Max response size:** 128KB  
**Cache key:** org + method + chain + params (hashed)

**WHY 30s TTL:**

- Token prices change every 1-5 seconds
- 30s is stale enough to save costs but fresh enough for most dashboards
- Users can override with `Cache-Control: max-age=0` for real-time needs

**WHY 128KB limit:**

- Most responses <10KB (price, metadata)
- Portfolio can be 50-100KB (100+ tokens)
- 128KB covers 99% without wasting Redis memory
- Oversized responses skip cache, full cost billed

**Cache headers:**

```
X-Cache: HIT|MISS
X-Cache-Age: 12  (seconds since cached)
Cache-Control: private, max-age=30  (remaining freshness for this org-scoped response)
```

## Error Handling

All routes return consistent error formats:

```json
{
  "error": "Invalid chain",
  "details": "Supported chains: solana, ethereum, ..."
}
```

**WHY consistent errors:**

- LLMs can parse and react to errors reliably
- Users can build robust error handling once, works across all endpoints
- Support can diagnose issues faster with standardized messages

### Error Status Codes

- `400`: Invalid input (chain, address, params)
- `401`: Missing or invalid API key
- `402`: Insufficient credits
- `429`: Rate limit exceeded
- `502`: Upstream provider error
- `504`: Upstream timeout

## Swapping Providers

To switch from Birdeye to another provider:

### 1. Update Configuration

```typescript
// lib/services/proxy/config.ts
MARKET_DATA_BASE_URL: "https://api.coingecko.com"; // was birdeye.so
```

### 2. Update Path Mappings

```typescript
// lib/services/proxy/services/market-data.ts
const PROVIDER_PATHS: Record<string, string> = {
  getPrice: "/v3/simple/token_price", // was /defi/price
  // ... update other paths
};
```

### 3. Update Headers (if needed)

```typescript
// market-data.ts handler
headers: {
  "X-API-Key": apiKey,  // was X-API-KEY (uppercase)
  // ... other provider-specific headers
}
```

### 4. Update Pricing

```sql
-- Update costs based on new provider's pricing
UPDATE service_pricing
SET cost = 0.000200  -- CoinGecko charges more than Birdeye
WHERE service_id = 'market-data' AND method = 'getPrice';
```

### 5. Test

```bash
# Verify each endpoint still works
curl -H "X-API-Key: $API_KEY" \
  https://api.elizacloud.ai/api/v1/market/price/solana/EPj...
```

**Total time:** <1 hour for experienced engineer, <2 hours for new team member.

**Routes unchanged:** Zero modifications needed in route files. All changes confined to handler.

## Adding New Methods

To add a new method (e.g., `getTokenHolders`):

### 1. Add to PROVIDER_PATHS

```typescript
const PROVIDER_PATHS: Record<string, string> = {
  // ... existing paths
  getTokenHolders: "/defi/token_holders",
};
```

### 2. Seed Pricing

```sql
INSERT INTO service_pricing (service_id, method, cost, metadata)
VALUES ('market-data', 'getTokenHolders', 0.000600,
        '{"cu": 50, "markup": 1.2, "description": "Token holder distribution"}');
```

### 3. Create Route

```typescript
// app/api/v1/market/holders/[chain]/[address]/route.ts
const body = {
  method: "getTokenHolders",
  chain,
  params: { address },
};

return executeWithBody(marketDataConfig, marketDataHandler, request, body);
```

**Done.** No changes needed to handler, validation, billing, or caching logic.

## Security

### API Key Security

**WHY keep provider auth in headers:**

- Birdeye authentication is sent in the `X-API-KEY` header, not the URL
- Keeping provider secrets out of URLs avoids credential leaks in logs and traces
- `retryFetch` only logs sanitized URLs and never emits auth headers

### Input Validation

**WHY validate everything:**

- DoS: 10MB address string crashes server
- Injection: malformed chain could break upstream queries
- Cost: invalid requests waste credits

**What we validate:**

1. Chain exists in supported list
2. Address matches chain's format (regex)
3. Query params are within reasonable bounds (limit ≤ 100)

### Rate Limiting

**WHY per-org not per-user:**

- Orgs pay for credits, they should control usage
- Prevents single user from eating org's entire quota
- Aligns with business model

## Monitoring

Key metrics to track:

1. **Cache hit rate**: Should be >70% for most endpoints

   - Low hit rate = users not using `Cache-Control` properly
   - Consider adjusting default TTL or education

2. **Upstream latency**: P95 should be <500ms

   - High latency = provider issues or network problems
   - May need to add fallback provider

3. **Error rate**: Should be <1%

   - High errors = provider instability or our bug
   - Check provider status page + our logs

4. **Cost per request**: Track actual provider cost vs our pricing

   - If provider raises prices, we know immediately
   - Adjust our pricing to maintain margins

5. **Method distribution**: Which methods are most used
   - Helps prioritize optimization efforts
   - Guides pricing strategy (charge more for popular methods)

## Testing

Run against testnet:

```bash
# Set testnet API key
export MARKET_DATA_PROVIDER_API_KEY=test_xxx

# Test each endpoint
bun test tests/integration/market-data.test.ts
```

**WHY integration tests:**

- Unit tests can't catch provider API changes
- Integration tests verify full request/response cycle
- Catch issues before users do

## Common Issues

### "Invalid chain"

- **Cause**: Typo in chain name or unsupported chain
- **Fix**: Check supported chains list, use lowercase

### "Invalid address format"

- **Cause**: Wrong address format for chain (e.g., EVM address on Solana)
- **Fix**: Verify address matches chain's format

### "Insufficient credits"

- **Cause**: Organization balance is zero
- **Fix**: Top up credits via billing page

### "Rate limit exceeded"

- **Cause**: >100 requests/min from single org
- **Fix**: Implement backoff in client, or contact support for higher limit

### "Market data provider error" (502)

- **Cause**: Upstream provider (Birdeye) returned error
- **Fix**: Check provider status page, retry in a few seconds

## Future Enhancements

1. **Multi-provider redundancy**

   - Try Birdeye first, fallback to CoinGecko on failure
   - Improves reliability to 99.9%+

2. **Smart caching**

   - Longer TTL for stablecoins (price rarely changes)
   - Shorter TTL for volatile meme coins
   - Adaptive TTL based on price volatility

3. **Batch requests**

   - Get prices for 100 tokens in one request
   - Reduces per-token cost for portfolio apps

4. **WebSocket streaming**

   - Real-time price updates without polling
   - Lower latency, better UX for trading apps

5. **Historical data warehouse**
   - Cache historical OHLCV data permanently
   - Serve from our DB instead of upstream
   - Massive cost savings for backtesting use cases
