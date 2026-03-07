# Unified RPC API Documentation

Multi-chain blockchain RPC proxy with credit-based billing.

## Overview

The Unified RPC API provides a single endpoint for accessing blockchain RPC across multiple chains:

- **Solana** via Helius (mainnet, devnet)
- **EVM chains** via Alchemy (Ethereum, Polygon, Arbitrum, Optimism, Base, zkSync, Avalanche)

**Why unified:**
- Standard RPC methods are commodity (identical across providers)
- Provider abstraction enables BD deals and cost optimization
- Single integration point for developers
- Backward compatible with existing `/api/v1/solana/rpc` endpoint

---

## Endpoints

### Unified RPC Endpoint

```
POST /api/v1/rpc/[chain]
```

**Supported chains:**
- `solana` - Solana blockchain (Helius)
- `ethereum` - Ethereum mainnet/testnet (Alchemy)
- `polygon` - Polygon mainnet/testnet (Alchemy)
- `arbitrum` - Arbitrum mainnet/testnet (Alchemy)
- `optimism` - Optimism mainnet/testnet (Alchemy)
- `base` - Base mainnet/testnet (Alchemy)
- `zksync` - zkSync mainnet (Alchemy)
- `avalanche` - Avalanche C-Chain mainnet (Alchemy)

**Query parameters:**
- `network` (optional) - `mainnet` (default) or `testnet`/`devnet`

**Request body:** Standard JSON-RPC 2.0 format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_blockNumber",
  "params": []
}
```

**Batch requests supported:**

```json
[
  {"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
  {"jsonrpc": "2.0", "id": 2, "method": "eth_getBalance", "params": ["0x..."]}
]
```

**Example:**

```bash
curl -X POST https://elizacloud.ai/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

### Solana RPC (Backward Compatible)

```
POST /api/v1/solana/rpc
```

Delegates to unified handler via `rpcConfigForChain("solana")`. Identical behavior to `/api/v1/rpc/solana`.

**Migration path:**
1. Both URLs work identically today
2. Migrate to `/api/v1/rpc/solana` at your own pace
3. No deprecation timeline - backward compat maintained indefinitely

---

## Pricing

### Two-tier pricing model

**Standard RPC (commodity tier):**
- `solana-rpc` - Helius Solana RPC
- `evm-rpc` - Alchemy EVM RPC (eth_* methods only)

**WHY separate tiers:**
- Standard RPC is identical across providers (can swap for BD deals)
- Bulk discounts and custom pricing don't affect entire platform
- Cost optimization and provider competition benefit users

### EVM RPC Pricing

Based on Alchemy CU costs with 20% markup:

| Method | CU Cost | Price | Use Case |
|--------|---------|-------|----------|
| `eth_chainId` | 0 | $0.000001 | Chain identification |
| `eth_blockNumber` | 10 | $0.000005 | Current block |
| `eth_getBalance` | 20 | $0.000011 | Wallet balance |
| `eth_call` | 26 | $0.000014 | Contract read |
| `eth_sendRawTransaction` | 40 | $0.000022 | Broadcast transaction |
| `eth_getLogs` | 60 | $0.000032 | Event logs |
| `_default` | 20 | $0.000011 | Fallback for unlisted methods |

**Batch requests:** Cost = sum of individual method costs

### Solana RPC Pricing

See existing Solana RPC documentation. Unchanged from Phase 1.

---

## Supported Methods

### EVM Chains

**Standard JSON-RPC methods only** (no `alchemy_*` prefixed methods):

**Network & Block:**
- `net_version`, `eth_chainId`, `eth_syncing`, `eth_blockNumber`
- `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_getBlockReceipts`
- `eth_feeHistory`, `eth_maxPriorityFeePerGas`, `eth_gasPrice`, `eth_blobBaseFee`

**Account & Balance:**
- `eth_getBalance`, `eth_getTransactionCount`, `eth_getCode`, `eth_getStorageAt`

**Transaction:**
- `eth_sendRawTransaction`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`
- `eth_estimateGas`, `eth_call`, `eth_simulateV1`

**Logs & Events:**
- `eth_getLogs`, `eth_newFilter`, `eth_getFilterLogs`, `eth_getFilterChanges`

**Utility:**
- `web3_clientVersion`, `web3_sha3`, `eth_getProof`

### Solana

See existing Solana RPC documentation for supported methods (Standard RPC, DAS API, Enhanced APIs).

---

## Network Selection

### Solana

- `mainnet` (default) - Production Solana mainnet
- `devnet` - Solana testnet

**Example:**
```bash
POST /api/v1/rpc/solana?network=devnet
```

### EVM Chains

- `mainnet` (default) - Production network
- `testnet` - Latest testnet (Sepolia for Ethereum, Amoy for Polygon, etc.)

**Example:**
```bash
POST /api/v1/rpc/ethereum?network=testnet  # Routes to eth-sepolia
POST /api/v1/rpc/polygon?network=testnet   # Routes to polygon-amoy
```

**Testnet support by chain:**
- Ethereum: Sepolia
- Polygon: Amoy
- Arbitrum: Sepolia
- Optimism: Sepolia
- Base: Sepolia
- zkSync: Mainnet only (no testnet support)
- Avalanche: Mainnet only (no testnet support)

---

## Caching

### Cache-Control Header

Request caching by setting `Cache-Control: max-age=X`:

```bash
curl -X POST https://elizacloud.ai/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_..." \
  -H "Cache-Control: max-age=30" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

**Cache behavior:**
- Cache miss: Full cost, response cached for up to 60s
- Cache hit: 50% cost, instant response

**Cache headers in response:**
- `X-Cache: HIT` or `MISS`
- `X-Cache-Age: <seconds>` (only on HIT)
- `Cache-Control: public, max-age=<ttl>`

### Non-cacheable Methods

**EVM:**
- `eth_sendRawTransaction` (mutates blockchain state)
- `eth_blockNumber` (changes every ~12s)
- `eth_gasPrice` (changes every block)
- `eth_maxPriorityFeePerGas` (changes frequently)

**Solana:**
- `sendTransaction`, `simulateTransaction`, `requestAirdrop`
- `getRecentBlockhash`, `getLatestBlockhash`

These methods are never cached even if `Cache-Control` header is set.

---

## Rate Limiting

**Default limits:**
- 100 requests per minute per organization
- Based on API key or authenticated user
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Rate limit exceeded:**
```json
{
  "success": false,
  "error": "Too many requests",
  "message": "Rate limit exceeded. Maximum 100 requests per 60 seconds.",
  "retryAfter": 42
}
```

Response: `429 Too Many Requests` with `Retry-After` header.

---

## Error Codes

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| 400 | Invalid request | Malformed JSON-RPC, unsupported method, invalid params | Check request format |
| 402 | Insufficient credits | Organization credit balance too low | Purchase credits |
| 404 | Not found | Invalid chain in URL path | Check supported chains |
| 429 | Too many requests | Rate limit exceeded | Wait for rate limit reset |
| 502 | Upstream error | Provider returned non-OK status | Check provider status, retry |
| 504 | Timeout | Provider took >25s to respond | Retry request |

**Error response format:**

```json
{
  "error": "Upstream RPC error",
  "code": 502
}
```

---

## Batch Requests

Both Solana and EVM support JSON-RPC batch requests:

```json
[
  {"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
  {"jsonrpc": "2.0", "id": 2, "method": "eth_getBalance", "params": ["0xABC..."]},
  {"jsonrpc": "2.0", "id": 3, "method": "eth_getBalance", "params": ["0xDEF..."]}
]
```

**Batch pricing:**
- Cost = sum of individual method costs
- Unique methods fetched in parallel (efficient)
- Example: 10x `getBalance` + 10x `getTransactionReceipt` = only 2 pricing DB hits

**Batch limits:**
- Solana: 20 requests per batch (configurable via `MAX_BATCH_SIZE`)
- EVM: 20 requests per batch (configurable via `ALCHEMY_MAX_BATCH_SIZE`)

**Batch validation:**
- One invalid method = entire batch rejected (fail-fast)
- Prevents partial execution and confusing errors
- Clear error message identifies which method failed

---

## Authentication

All RPC endpoints require authentication via:

**Option 1: API Key (recommended)**
```bash
curl -H "X-API-Key: eliza_..." https://elizacloud.ai/api/v1/rpc/ethereum
```

**Option 2: Bearer Token**
```bash
curl -H "Authorization: Bearer eliza_..." https://elizacloud.ai/api/v1/rpc/ethereum
```

**Option 3: Session Cookie**
- Automatic for web app requests
- Not recommended for API integrations

---

## Migration Guide

### From `/api/v1/solana/rpc` to `/api/v1/rpc/solana`

**No action required.** Both URLs work identically today.

**Optional migration:**

```diff
- POST /api/v1/solana/rpc
+ POST /api/v1/rpc/solana
```

Same request body, same response, same pricing, same rate limits.

**Why migrate:**
- Consistency: all chains under `/api/v1/rpc/[chain]`
- Future-proof: unified endpoint for multi-chain apps

**Timeline:** No deprecation planned - backward compat maintained indefinitely.

---

## Examples

### Get Ethereum block number

```bash
curl -X POST https://elizacloud.ai/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_blockNumber",
    "params": []
  }'
```

### Get wallet balance (with caching)

```bash
curl -X POST https://elizacloud.ai/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_..." \
  -H "Cache-Control: max-age=30" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_getBalance",
    "params": ["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", "latest"]
  }'
```

### Batch request

```bash
curl -X POST https://elizacloud.ai/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_..." \
  -H "Content-Type: application/json" \
  -d '[
    {"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]},
    {"jsonrpc":"2.0","id":2,"method":"eth_gasPrice","params":[]}
  ]'
```

### Solana RPC (backward compatible)

```bash
curl -X POST https://elizacloud.ai/api/v1/solana/rpc \
  -H "X-API-Key: eliza_..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getBalance",
    "params": ["DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK"]
  }'
```

### Using testnet

```bash
# Ethereum Sepolia
curl -X POST https://elizacloud.ai/api/v1/rpc/ethereum?network=testnet \
  -H "X-API-Key: eliza_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'

# Solana Devnet
curl -X POST https://elizacloud.ai/api/v1/rpc/solana?network=devnet \
  -H "X-API-Key: eliza_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["..."]}'
```

---

## Architecture

### Provider Registry Pattern

The handler maps chains to providers without exposing provider details to routes.

```typescript
// Routes never know which provider they're calling
POST /api/v1/rpc/ethereum → rpcConfigForChain("ethereum") → Alchemy

// Provider swap = one config change
const PROVIDER = useAlchemy ? alchemyConfig : quicknodeConfig;
```

**Benefits:**
- BD deals: Negotiate better rates with alternative providers
- Redundancy: Automatic failover if primary provider is down
- Cost optimization: Route expensive methods to cheaper providers

### Single Source of Truth (Solana)

`rpcConfigForChain("solana")` returns `solanaRpcConfig` directly (not a copy).

**WHY this matters:**
- `/api/v1/solana/rpc` and `/api/v1/rpc/solana` use the same config object
- Changes to Solana pricing affect both URLs automatically
- No risk of divergence (different rate limits, cache TTLs, etc.)

### Batch Cost Calculation

Shared `calculateBatchCost()` utility in `pricing.ts`:
- Validates all methods in batch upfront (fail-fast)
- Fetches unique method costs in parallel (not sequentially)
- Sums costs for all requests

**Example:**
```
Batch: [getBalance, getBalance, getTransactionReceipt]
Unique: {getBalance, getTransactionReceipt}
Cost: 2 * $0.000011 + 1 * $0.000011 = $0.000033
```

---

## Supported Methods by Chain

### Solana

See existing Solana RPC documentation. All methods unchanged.

### EVM Chains (Standard JSON-RPC only)

**WHY standard methods only:**
- Standard methods are commodity (identical across Alchemy, Infura, QuickNode)
- Enhanced methods (alchemy_*, infura_*) go in `/api/v1/chain/*` endpoints
- Ensures provider swappability

**Full method list:**

**Network & Info:**
`net_version`, `eth_chainId`, `eth_syncing`, `net_listening`, `eth_protocolVersion`

**Blocks:**
`eth_blockNumber`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_getBlockReceipts`, `eth_getBlockTransactionCountByHash`, `eth_getBlockTransactionCountByNumber`

**Transactions:**
`eth_sendRawTransaction`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getTransactionCount`

**Account:**
`eth_getBalance`, `eth_getCode`, `eth_getStorageAt`, `eth_getProof`

**Gas & Fees:**
`eth_gasPrice`, `eth_estimateGas`, `eth_feeHistory`, `eth_maxPriorityFeePerGas`, `eth_blobBaseFee`

**Execution:**
`eth_call`, `eth_simulateV1`, `eth_createAccessList`

**Logs & Filters:**
`eth_getLogs`, `eth_getFilterLogs`, `eth_newFilter`, `eth_newBlockFilter`, `eth_newPendingTransactionFilter`, `eth_getFilterChanges`, `eth_uninstallFilter`

**Utility:**
`web3_clientVersion`, `web3_sha3`, `eth_accounts`

**Subscriptions:**
`eth_subscribe`, `eth_unsubscribe`

---

## Provider Details

### Solana (Helius)

**Endpoint pattern:** `https://mainnet.helius-rpc.com/?api-key={key}`

**Features:**
- Standard Solana RPC methods
- DAS API (Digital Asset Standard) for compressed NFTs
- Enhanced APIs (getTransactionsForAddress, getValidityProof)
- Fallback URL support for redundancy

**API key:** Query parameter (automatically sanitized in logs)

### EVM Chains (Alchemy)

**Endpoint pattern:** `https://{slug}.g.alchemy.com/v2/{apiKey}`

**Chain slugs:**
- Mainnet: `eth-mainnet`, `polygon-mainnet`, `arb-mainnet`, `opt-mainnet`, `base-mainnet`, `zksync-mainnet`, `avax-mainnet`
- Testnet: `eth-sepolia`, `polygon-amoy`, `arb-sepolia`, `opt-sepolia`, `base-sepolia`

**API key:** URL path (automatically sanitized as `/v2/***` in logs)

---

## Configuration

### Environment Variables

```bash
# Alchemy API key (required for EVM chains)
ALCHEMY_API_KEY=your_alchemy_api_key_here

# Optional: Alchemy Configuration
ALCHEMY_TIMEOUT_MS=25000              # Request timeout
ALCHEMY_MAX_RETRIES=3                 # Max retry attempts
ALCHEMY_INITIAL_RETRY_DELAY_MS=500   # Initial retry delay
ALCHEMY_MAX_BATCH_SIZE=20             # Max batch size

# Solana RPC (unchanged)
SOLANA_RPC_PROVIDER_API_KEY=your_helius_key
```

### Database Migrations

**Apply pricing migrations:**

```bash
bun run db:migrate
```

**Verify pricing loaded:**

```bash
bun run db:studio
# Navigate to service_pricing table
# Confirm evm-rpc entries exist
```

---

## Testing

### Test Ethereum RPC

```bash
# Get block number
curl -X POST http://localhost:3000/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_test_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'

# Get balance
curl -X POST http://localhost:3000/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_test_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb","latest"]}'
```

### Test Batch Requests

```bash
curl -X POST http://localhost:3000/api/v1/rpc/ethereum \
  -H "X-API-Key: eliza_test_..." \
  -H "Content-Type: application/json" \
  -d '[
    {"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]},
    {"jsonrpc":"2.0","id":2,"method":"eth_gasPrice","params":[]}
  ]'
```

### Test Solana Backward Compat

```bash
# Old URL (still works)
curl -X POST http://localhost:3000/api/v1/solana/rpc \
  -H "X-API-Key: eliza_test_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["DYw8..."]}'

# New URL (identical behavior)
curl -X POST http://localhost:3000/api/v1/rpc/solana \
  -H "X-API-Key: eliza_test_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["DYw8..."]}'
```

---

## Security

### Input Validation

All requests validated before credit reservation:

1. **Chain validation** - chain in SUPPORTED_RPC_CHAINS
2. **Network validation** - mainnet or testnet/devnet only
3. **Method validation** - method in allowed methods whitelist
4. **Batch validation** - size ≤ max batch size, all methods valid

**WHY validate before billing:**
- Prevents charging for invalid requests
- Fast user feedback on errors
- DoS protection (reject malformed input early)

### API Key Sanitization

All URLs logged are automatically sanitized:

- Helius: `?api-key=xxx` → `?api-key=***`
- Alchemy RPC: `/v2/{key}` → `/v2/***`
- Alchemy NFT: `/v3/{key}/...` → `/v3/***/...`

Implemented in `retryFetch()` utility, applied automatically.

### Rate Limiting

- Redis-backed (distributed across serverless instances)
- Keyed by API key / user identity (not handler instance)
- Per-request handler creation is safe (verified)

---

## Monitoring

### Key Metrics

Track via `usage_records` table:

1. **Cost per request**: `input_cost` + `markup`
2. **Cache hit rate**: `COUNT(*) WHERE metadata->>'cached' = 'true'`
3. **Method distribution**: `GROUP BY metadata->>'method'`
4. **Error rate**: `is_successful = false`
5. **Latency**: `duration_ms` P50/P95/P99

### Logs

Search for:
- `[EVM RPC]` - Alchemy requests
- `[Solana RPC]` - Helius requests
- `[Proxy Engine]` - Billing and execution
- `[Pricing]` - Pricing cache hits/misses

---

## Troubleshooting

### "ALCHEMY_API_KEY not configured"

Set environment variable:
```bash
export ALCHEMY_API_KEY=your_key_here
```

### "Unsupported chain"

Check `/api/v1/rpc/[chain]` - chain must be lowercase and in supported list.

### "Method not supported"

Only standard JSON-RPC methods allowed. For enhanced methods (alchemy_*, infura_*), use `/api/v1/chain/*` endpoints.

### "Batch contains unsupported method"

One method in batch is not whitelisted. Check error message for method name.

### High costs

- Enable caching: `Cache-Control: max-age=30` (saves 50%)
- Batch related requests (reduces overhead)
- Cache at application level (prevent duplicate calls)

---

## Design Decisions

### Why provider abstraction?

**Scenario:** Alchemy raises prices 30% tomorrow.

**Without abstraction:**
- 20 route files hardcode Alchemy URLs/headers
- Migration to QuickNode = modify 20 files, test, deploy
- Downtime while migrating
- High risk of missed references

**With abstraction:**
- One config change in `rpc.ts`
- Test, deploy
- ~1 hour to complete
- Zero downtime with phased rollout

### Why separate EVM and Solana configs?

**Alternative:** One config for all chains.

**Problem:**
- Solana has fallback URLs (EVM doesn't)
- Solana uses `devnet` (EVM uses `testnet`)
- Different method whitelists
- Different cache policies

**Solution:** Delegate to existing `solanaRpcConfig`, build EVM config dynamically. Single source of truth per chain family.

### Why validate chains against ALCHEMY_SLUGS?

`address-validation.ts` includes `bsc` in `EVM_CHAINS`, but Alchemy doesn't support BSC.

**If we validated against EVM_CHAINS:**
```
GET /api/v1/chain/nfts/bsc/0xABC...
→ passes validation
→ fails deep in handler (no slug for BSC)
→ confusing error: "undefined slug"
```

**With ALCHEMY_SLUGS validation:**
```
GET /api/v1/chain/nfts/bsc/0xABC...
→ returns 400 with clear message: "Chain 'bsc' not supported. Supported: ethereum, polygon, ..."
```

**Trade-off:** Validation logic coupled to provider. But this is intentional -- enhanced APIs ARE provider-specific.

---

## Future Enhancements

### Multi-provider redundancy

```typescript
const providers = [
  { name: "Alchemy", buildUrl: alchemyUrl, priority: 1 },
  { name: "QuickNode", buildUrl: quicknodeUrl, priority: 2 },
];

for (const provider of providers) {
  try {
    return await provider.call(method, params);
  } catch (error) {
    logger.warn(`${provider.name} failed, trying next`);
    continue;
  }
}
```

### Chain-specific pricing

- Layer 2s (Polygon, Arbitrum) cheaper than Ethereum
- Testnet calls at 10% of mainnet cost
- Bulk discounts for high-volume orgs

### WebSocket support

Real-time subscriptions via `eth_subscribe`:
```json
{"jsonrpc":"2.0","id":1,"method":"eth_subscribe","params":["newHeads"]}
```

Streams new block headers over persistent connection.
