# API Security Architecture

## Overview

This document explains the security architecture of Eliza Cloud's public APIs, including authentication, rate limiting, and CORS policies.

## Table of Contents

1. [Unrestricted CORS - Intentional Design](#unrestricted-cors---intentional-design)
2. [Authentication & Authorization](#authentication--authorization)
3. [Rate Limiting](#rate-limiting)
4. [Input Validation](#input-validation)
5. [Revenue Protection](#revenue-protection)

---

## Unrestricted CORS - Intentional Design

### Why Open CORS Is Required

**TL;DR:** Our APIs use `Access-Control-Allow-Origin: *` by design because they are public, revenue-generating APIs meant to be consumed by unknown third parties. Security is enforced through API keys, not origin restrictions.

### Business & Technical Rationale

#### 1. **Public API By Design**

Our platform provides APIs that are intentionally public and meant to be consumed by:

- **Web Applications**: Browser-based dApps, wallets, and tools
- **Mobile Apps**: iOS and Android applications
- **Third-Party Services**: Developer tools, analytics platforms, integrations
- **Unknown Consumers**: We cannot predict which domains will integrate our services

**Examples of public endpoints:**
- Solana RPC proxy (`/api/v1/solana/rpc`)
- Token account queries (`/api/v1/solana/token-accounts/[address]`)
- Asset listings (`/api/v1/solana/assets/[address]`)
- Transaction history (`/api/v1/solana/transactions/[address]`)
- MCP registry (`/api/v1/mcps`)
- Agent-to-Agent communication (`/api/agents/[id]/a2a`)

#### 2. **Revenue Model**

Our business model is **API-key-based revenue**, not origin-based:

```
┌─────────────────┐
│   Any Origin    │
│  (web, mobile)  │
└────────┬────────┘
         │ X-API-Key: xyz...
         ▼
┌─────────────────┐
│   API Gateway   │ ← Validates API key
│  (Rate Limit)   │ ← Tracks usage
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Billing System │ ← Charges by usage
└─────────────────┘
```

**Key Points:**
- Access control → API keys (not CORS)
- Rate limiting → Per API key (not per origin)
- Billing → Per organization (tracked by API key usage)
- Cost tracking → Every request logged and billed

#### 3. **CORS Is NOT a Security Boundary**

**What CORS Actually Does:**
- Prevents browsers from making cross-origin requests
- Does NOT prevent:
  - Direct API calls (curl, Postman, backend services)
  - Mobile app requests
  - Server-to-server communication

**What CORS Does NOT Protect:**
- ❌ Authentication (use API keys instead)
- ❌ Authorization (use user/org validation instead)
- ❌ Rate limiting (use proxy layer limits instead)
- ❌ Data access control (use database permissions instead)

**Our Actual Security Layers:**

```
Layer 1: API Key Authentication
  ↓
Layer 2: Rate Limiting (per key)
  ↓
Layer 3: Input Validation
  ↓
Layer 4: Authorization (user/org)
  ↓
Layer 5: Cost Tracking & Billing
```

#### 4. **Restricting CORS Would:**

- ❌ **Break legitimate integrations** - Third-party developers couldn't use our APIs
- ❌ **Prevent browser-based apps** - No dApps, wallets, or web tools
- ❌ **Reduce adoption & revenue** - Developers would choose competitors
- ❌ **Force workarounds** - Users would deploy CORS proxies (defeating the purpose)
- ❌ **Limit mobile usage** - React Native and mobile frameworks need cross-origin access

#### 5. **Real-World Use Cases**

**Example 1: Browser Wallet Integration**
```javascript
// A third-party wallet needs to check Solana balances
fetch('https://eliza.ai/api/v1/solana/token-accounts/So1111...', {
  headers: { 'X-API-Key': 'wallet_key_xyz' }
})
```
✅ With open CORS: Works perfectly  
❌ With restricted CORS: Blocked by browser, requires backend proxy

**Example 2: dApp Analytics Dashboard**
```javascript
// Analytics tool shows live transaction data
fetch('https://eliza.ai/api/v1/solana/transactions/TokenkegQ...', {
  headers: { 'X-API-Key': 'analytics_key_abc' }
})
```
✅ With open CORS: Direct integration possible  
❌ With restricted CORS: Cannot work client-side

**Example 3: Mobile App**
```swift
// iOS app queries MCP registry
let request = URLRequest(url: "https://eliza.ai/api/v1/mcps")
request.addValue("ios_app_key_123", forHTTPHeaderField: "X-API-Key")
```
✅ With open CORS: Works seamlessly  
❌ With restricted CORS: May require workarounds

---

## Authentication & Authorization

### API Key Authentication

All public endpoints require authentication via API keys:

**Header Format:**
```http
X-API-Key: eliza_live_abc123...
```

**Alternative (for compatibility):**
```http
Authorization: Bearer eliza_live_abc123...
```

**Key Properties:**
- ✅ Unique per organization
- ✅ Rate limited independently
- ✅ Usage tracked for billing
- ✅ Can be rotated/revoked
- ✅ Scoped to specific permissions

### Session Authentication

For user-facing features (dashboard, settings), we use:
- **Privy Authentication**: Wallet-based + email/social login
- **Session Tokens**: HTTP-only cookies
- **JWT Verification**: Cached to reduce latency

---

## Rate Limiting

### Per-API-Key Limits

Rate limits are enforced at the proxy layer, per API key:

| Tier | Requests/Second | Requests/Hour | Cost/Request |
|------|-----------------|---------------|--------------|
| Free | 1 | 100 | $0 (limited) |
| Basic | 10 | 10,000 | $0.001 |
| Pro | 100 | 100,000 | $0.0005 |
| Enterprise | Custom | Custom | Negotiated |

### Implementation

```typescript
// lib/services/proxy/engine.ts
async function rateLimit(apiKey: string) {
  const usage = await getUsage(apiKey);
  if (usage.requestsLastHour > limits[tier].perHour) {
    throw new Error("Rate limit exceeded");
  }
}
```

**Rate limit headers returned:**
```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1234567890
```

---

## Input Validation

### Solana Address Validation

**Security Issue:** Weak regex validation could allow DoS attacks

**Solution:** Cryptographic validation using `@solana/web3.js`

```typescript
import { PublicKey } from "@solana/web3.js";

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address); // Validates base58, checksum, 32-byte structure
    return true;
  } catch {
    return false;
  }
}
```

**What this validates:**
- ✅ Base58 encoding
- ✅ Checksum verification
- ✅ 32-byte public key structure
- ✅ Prevents invalid addresses from reaching RPC

**Before (regex only):**
```typescript
// ❌ Would accept: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
// ❌ Would accept: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"
const REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
```

**After (cryptographic):**
```typescript
// ✅ Rejects invalid checksums
// ✅ Rejects non-32-byte addresses
// ✅ Validates actual public key structure
new PublicKey(address);
```

### Request Size Limits

```typescript
// next.config.ts
export default {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Prevent large payload attacks
    },
  },
};
```

### SQL Injection Prevention

All database queries use **parameterized queries** via Drizzle ORM:

```typescript
// ✅ Safe - parameters are escaped
await db.select().from(users).where(eq(users.id, userId));

// ❌ NEVER do this
await db.execute(`SELECT * FROM users WHERE id = '${userId}'`);
```

---

## Revenue Protection

### Cost Tracking

Every API request is logged and tracked:

```typescript
interface UsageLog {
  api_key_id: string;
  organization_id: string;
  endpoint: string;
  method: string;
  tokens_used?: number;
  cost_usd: Decimal;
  timestamp: Date;
}
```

### Billing Integration

1. **Usage Accumulation**: Requests tracked per organization
2. **Cost Calculation**: Based on endpoint and model used
3. **Billing Cycle**: Monthly invoicing via Stripe
4. **Credit System**: Pre-paid credits + overage charges

### Abuse Prevention

```typescript
// Automatic suspension for abuse
if (dailyCost > organization.spendingLimit * 2) {
  await suspendApiKey(apiKey);
  await notifyAdmin(organization);
}
```

---

## Security Checklist

When adding new public API endpoints:

- [ ] Add API key authentication requirement
- [ ] Implement rate limiting
- [ ] Validate all input parameters
- [ ] Add cost tracking
- [ ] Use CORS helper: `import { handleCorsOptions } from "@/lib/services/proxy/cors"`
- [ ] Document security rationale in file header
- [ ] Add usage monitoring

---

## References

- **CORS Utility**: `lib/services/proxy/cors.ts`
- **Validation**: `lib/services/proxy/services/solana-validation.ts`
- **Rate Limiting**: `lib/services/proxy/engine.ts`
- **API Key Management**: `lib/services/api-keys.ts`
- **Cost Tracking**: `lib/services/usage-tracking.ts`

---

## Questions?

If you have concerns about security, CORS, or API access:

1. Read this document thoroughly
2. Check the implementation in `lib/services/proxy/cors.ts`
3. Review endpoint-specific documentation in route files
4. Consult with the security team

**Remember:** Open CORS on public APIs is intentional, not a vulnerability. Security is enforced through authentication, rate limiting, and billing - not origin restrictions.
