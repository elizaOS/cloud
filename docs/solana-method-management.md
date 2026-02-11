# Solana RPC Method Management

## Overview

Solana RPC method whitelisting is now **database-driven** with a hardcoded fallback. This eliminates the need for code deployments when adding new RPC methods.

## Architecture

### Database-Driven Whitelist (Primary)

```typescript
// Any method with active pricing is automatically allowed
const pricingRecords = await servicePricingRepository.listByService("solana-rpc");
const allowedMethods = pricingRecords
  .filter(r => r.is_active)
  .map(r => r.method);
```

**Key Features:**
- ✅ No code deployments needed to add methods
- ✅ Granular control via `is_active` flag
- ✅ Automatic pricing validation (methods must have pricing)
- ✅ Cached for 60 seconds (fast and efficient)

### Hardcoded Fallback (Emergency)

```typescript
const HARDCODED_FALLBACK_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  // ... ~75 methods ...
]);
```

**Used When:**
- ❌ Database is unreachable
- ❌ Cache failure
- ❌ Zero active methods in database (bootstrap scenario)

## Adding New Methods

### Option 1: Admin API (Recommended)

```bash
curl -X PUT https://eliza.ai/api/v1/admin/service-pricing \
  -H "X-API-Key: admin_key_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "solana-rpc",
    "method": "getNewFeature",
    "cost": 0.0001,
    "reason": "Added support for new Solana feature",
    "description": "Gets new feature data from Solana"
  }'
```

**Effects:**
1. Creates pricing entry in database
2. Method becomes immediately available (via cache refresh)
3. No code deployment needed
4. Audit trail created automatically

### Option 2: Database Migration (Bootstrap)

For bulk additions or initial setup:

```sql
-- Add new method
INSERT INTO service_pricing (service_id, method, cost, description, is_active)
VALUES ('solana-rpc', 'getNewFeature', 0.0001, 'Gets new feature data', true);

-- Disable a method without deleting pricing
UPDATE service_pricing 
SET is_active = false 
WHERE service_id = 'solana-rpc' AND method = 'oldMethod';
```

## Disabling Methods

### Temporary Disable

```bash
# Mark method as inactive via admin API
curl -X PUT https://eliza.ai/api/v1/admin/service-pricing \
  -H "X-API-Key: admin_key_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "solana-rpc",
    "method": "problematicMethod",
    "cost": 0.0001,
    "is_active": false,
    "reason": "Temporarily disabled due to upstream issues"
  }'
```

**Note:** Currently `is_active` update via API requires schema update. For now, use direct database update:

```sql
UPDATE service_pricing 
SET is_active = false, updated_at = NOW()
WHERE service_id = 'solana-rpc' AND method = 'problematicMethod';
```

Then manually invalidate cache:
```bash
# Via redis-cli or admin script
redis-cli DEL solana-rpc:allowed-methods
```

### Permanent Removal

Delete the pricing record (not recommended - keeps no audit trail):

```sql
DELETE FROM service_pricing 
WHERE service_id = 'solana-rpc' AND method = 'deprecatedMethod';
```

**Better:** Keep as inactive for historical reference:
```sql
UPDATE service_pricing 
SET is_active = false, 
    description = description || ' [DEPRECATED]'
WHERE service_id = 'solana-rpc' AND method = 'deprecatedMethod';
```

## Querying Available Methods

### Public API

```bash
curl https://eliza.ai/api/v1/solana/methods
```

**Response:**
```json
{
  "service": "solana-rpc",
  "total": 94,
  "methods": [
    {
      "method": "getAccountInfo",
      "cost": 0.0001,
      "description": "Get account information"
    },
    // ... more methods ...
  ],
  "note": "Methods are dynamically managed via database."
}
```

### Direct Database Query

```sql
SELECT method, cost, description, is_active, updated_at
FROM service_pricing
WHERE service_id = 'solana-rpc'
ORDER BY method;
```

## Caching Strategy

### Allowed Methods Cache

- **Key:** `solana-rpc:allowed-methods`
- **TTL:** 60 seconds
- **Content:** Array of method names `["getAccountInfo", "getBalance", ...]`

**Cache Flow:**
```
Request → Check cache (60s TTL)
  ├─ Hit → Return cached methods (1ms)
  └─ Miss → Query database (10-50ms)
       ├─ Success → Cache + return
       └─ Failure → Return hardcoded fallback
```

### Pricing Cache (Separate)

- **Key:** `service-pricing:solana-rpc`
- **TTL:** 300 seconds (5 minutes)
- **Content:** Map of `{ method: cost }`

**Invalidation:**
- Automatic on pricing updates via admin API
- Manual: `redis-cli DEL service-pricing:solana-rpc`

## Performance

### Metrics

| Scenario | Latency | Notes |
|----------|---------|-------|
| Cache hit (allowed methods) | ~1ms | Most common case |
| Cache miss (DB query) | ~10-50ms | Once per minute |
| Database failure | ~1ms | Falls back to hardcoded list |
| Method validation | ~0.1ms | Set lookup |

### Load Impact

**Before (Hardcoded):**
- Zero database queries
- Code deployment for each new method

**After (Database-driven):**
- ~1 DB query per minute (cached)
- Zero code deployments
- Better operational flexibility

## Monitoring

### Key Metrics

```typescript
// Watch for these log events:
logger.debug("[Solana RPC] Allowed methods cache hit");
logger.debug("[Solana RPC] Allowed methods cache miss, querying database");
logger.warn("[Solana RPC] No active methods in database, using fallback");
logger.error("[Solana RPC] Failed to load allowed methods from database, using fallback");
```

### Alerts to Set Up

1. **Frequent Fallback Usage**
   ```
   Alert if: "using fallback" appears > 10 times/minute
   Indicates: Database connectivity issues
   ```

2. **Zero Active Methods**
   ```
   Alert if: "No active methods in database" appears
   Indicates: Database misconfiguration
   ```

3. **Cache Invalidation After Pricing Update**
   ```
   Monitor: "[Admin] Invalidated allowed methods cache"
   Verify: New method appears in /api/v1/solana/methods within 60s
   ```

## Schema Reference

### `service_pricing` Table

```sql
CREATE TABLE service_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id TEXT NOT NULL,
  method TEXT NOT NULL,
  cost NUMERIC(12, 6) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true NOT NULL,  -- Controls method authorization
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(service_id, method)
);
```

**Key Fields:**
- `is_active`: Controls whether method is allowed (primary authorization flag)
- `cost`: Required for all methods (prevents accidental free usage)
- `method`: RPC method name (e.g., "getAccountInfo")

## Migration Guide

### From Hardcoded to Database-Driven

**Step 1: Verify Database Has Pricing Records**
```sql
SELECT COUNT(*) FROM service_pricing WHERE service_id = 'solana-rpc' AND is_active = true;
```

Expected: ~75-100 methods

**Step 2: Deploy Updated Code**
- Code automatically uses database-driven whitelist
- Hardcoded fallback activates if DB query fails
- Zero downtime

**Step 3: Monitor Logs**
```bash
# Should see cache misses initially, then hits
tail -f /var/log/app.log | grep "Allowed methods"
```

**Step 4: Add New Method Without Deployment**
```bash
# Add via API
curl -X PUT https://eliza.ai/api/v1/admin/service-pricing ...

# Verify within 60s
curl https://eliza.ai/api/v1/solana/methods | jq '.methods[] | select(.method=="newMethod")'
```

## Troubleshooting

### New Method Not Appearing

**Symptoms:**
- Added via admin API
- Not showing in `/api/v1/solana/methods`
- Requests get "method not supported" error

**Solutions:**
1. Check if method was actually created:
   ```sql
   SELECT * FROM service_pricing 
   WHERE service_id = 'solana-rpc' AND method = 'yourMethod';
   ```

2. Check `is_active` flag:
   ```sql
   SELECT is_active FROM service_pricing 
   WHERE service_id = 'solana-rpc' AND method = 'yourMethod';
   ```

3. Manually invalidate cache:
   ```bash
   redis-cli DEL solana-rpc:allowed-methods
   ```

4. Wait for TTL (60 seconds max)

### All Methods Returning "Not Supported"

**Symptoms:**
- All RPC requests failing
- Even known methods like `getAccountInfo`

**Likely Causes:**
1. Database connection failure → Using fallback, but fallback is empty
2. All methods marked `is_active = false`
3. Cache contains empty array

**Solutions:**
1. Check database connectivity:
   ```sql
   SELECT 1; -- Simple connection test
   ```

2. Verify active methods exist:
   ```sql
   SELECT COUNT(*) FROM service_pricing 
   WHERE service_id = 'solana-rpc' AND is_active = true;
   ```

3. Check cache:
   ```bash
   redis-cli GET solana-rpc:allowed-methods
   ```

4. Clear cache and let it rebuild:
   ```bash
   redis-cli DEL solana-rpc:allowed-methods
   ```

### Performance Degradation

**Symptoms:**
- Slow RPC request processing
- High database load

**Diagnosis:**
1. Check cache hit rate:
   ```bash
   # Should see mostly cache hits
   grep "Allowed methods cache" /var/log/app.log | tail -100
   ```

2. Verify TTL is set correctly:
   ```bash
   redis-cli TTL solana-rpc:allowed-methods
   # Should show ~60 seconds after cache refresh
   ```

**Solutions:**
1. Increase cache TTL if needed:
   ```typescript
   // In solana-rpc.ts
   const ALLOWED_METHODS_CACHE_TTL = 300; // 5 minutes instead of 60s
   ```

2. Monitor database query performance:
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM service_pricing 
   WHERE service_id = 'solana-rpc' AND is_active = true;
   ```

## Best Practices

### ✅ DO

- Add new methods via admin API (auditable, immediate)
- Keep pricing records even for deprecated methods (`is_active = false`)
- Monitor cache hit rates
- Use descriptive reasons when updating pricing
- Test new methods in devnet first

### ❌ DON'T

- Edit hardcoded fallback list for regular method additions
- Delete pricing records (loses audit trail)
- Set `cost = 0` (indicates free usage, should be explicit)
- Bypass admin API for production changes
- Skip `reason` field when updating pricing

## Future Enhancements

### Planned

- [ ] Admin UI for method management
- [ ] `is_active` field update via admin API
- [ ] Method usage analytics per endpoint
- [ ] Automatic method discovery from upstream
- [ ] Rate limit overrides per method
- [ ] Method deprecation warnings

### Considerations

- **WebSocket Support**: May need separate whitelist for WS methods
- **Method Groups**: Bulk enable/disable for related methods
- **Conditional Authorization**: Role-based method access
- **Usage Quotas**: Per-method limits in addition to cost

## References

- **Implementation**: `lib/services/proxy/services/solana-rpc.ts`
- **Admin API**: `app/api/v1/admin/service-pricing/route.ts`
- **Methods Endpoint**: `app/api/v1/solana/methods/route.ts`
- **Schema**: `db/schemas/service-pricing.ts`
- **Repository**: `db/repositories/service-pricing.ts`
- **Pricing Cache**: `lib/services/proxy/pricing.ts`
