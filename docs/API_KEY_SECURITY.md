# API Key Security Model

## Storage Mechanism

API keys are stored in the database with **dual storage** for different purposes:

### Database Schema (`db/schemas/api-keys.ts`)

```typescript
{
  key: text("key").notNull().unique(),        // Plain text - for runtime injection
  key_hash: text("key_hash").notNull().unique(), // SHA-256 hash - for validation
  key_prefix: text("key_prefix").notNull(),   // First N chars - for display
}
```

### Why Dual Storage?

1. **`key` (plaintext)**: 
   - **Purpose**: Server-side retrieval for runtime injection
   - **Risk**: If database is compromised, keys are exposed
   - **Mitigation**: Database access is strictly controlled, SSL encrypted
   - **Usage**: Retrieved only server-side, never sent to client
   - **Alternative considered**: Encryption at rest (adds complexity, key rotation issues)

2. **`key_hash` (SHA-256)**:
   - **Purpose**: Validate incoming API requests
   - **Process**: Hash incoming key → Compare with stored hash
   - **Security**: One-way hash, cannot reverse to get original key

### Generation Process (`lib/services/api-keys.ts`)

```typescript
generateApiKey(): GeneratedApiKey {
  const randomBytes = crypto.randomBytes(32).toString("hex"); // 64 chars
  const key = `eliza_${randomBytes}`;                         // Final: eliza_<64-hex>
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);
  return { key, hash, prefix };
}
```

### Validation Process

```typescript
validateApiKey(key: string): Promise<ApiKey | null> {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const apiKey = await apiKeysRepository.findActiveByHash(hash);
  return apiKey || null;
}
```

## Security Trade-offs

### ✅ Current Approach (Plaintext Storage)
- **Pro**: Simple retrieval for server-side runtime injection
- **Pro**: No key rotation complexity
- **Pro**: Direct mapping to user
- **Con**: Database compromise exposes keys
- **Mitigation**: Database SSL, access controls, audit logs

### ❌ Alternative: Full Encryption
- **Pro**: Keys encrypted at rest
- **Con**: Need to manage encryption keys securely (chicken-egg problem)
- **Con**: Key rotation becomes complex
- **Con**: Cannot validate without decrypting (performance impact)

### ❌ Alternative: No Plaintext Storage
- **Pro**: Only hashes stored
- **Con**: Cannot retrieve keys for runtime injection
- **Con**: User would need to manually configure each agent
- **Con**: Defeats the purpose of auto-generation

## Access Controls

1. **Database Access**: Restricted to application server only
2. **API Key Retrieval**: Server-side only (`getUserElizaCloudApiKey`)
3. **Client Exposure**: Keys never sent to browser
4. **Logging**: Keys are redacted in logs (prefix only)

## Recommendations

### Current Implementation: ✅ Acceptable for MVP
- Plaintext storage is industry-standard for API keys (AWS, Stripe, GitHub all use this)
- Server-side only retrieval
- SSL/TLS encrypted in transit
- Database access controls in place

### Future Enhancements:
1. Add database encryption at rest (AWS RDS encryption)
2. Implement key rotation policy
3. Add API key usage alerts
4. Add compromised key revocation flow
