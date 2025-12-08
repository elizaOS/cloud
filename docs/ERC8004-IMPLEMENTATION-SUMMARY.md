# ERC-8004 Integration Implementation Summary

## Overview

This document summarizes the implementation of ERC-8004 decentralized marketplace integration for Eliza Cloud. The implementation enables:

1. **Discovery** - Find services from both local Eliza Cloud and the ERC-8004 decentralized registry
2. **Registration** - Register local MCPs and agents on the ERC-8004 Identity Registry
3. **Caching** - Efficient caching of registry data using Redis SWR pattern
4. **Proxy** - Securely proxy requests to external ERC-8004 services

## Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `db/migrations/0018_add_mcp_erc8004_fields.sql` | Database migration adding ERC-8004 fields to user_mcps |
| `lib/types/erc8004.ts` | TypeScript types for discovery API (DiscoveredService, filters, etc.) |
| `app/api/v1/discovery/route.ts` | Unified discovery API combining local + ERC-8004 sources |
| `app/api/v1/external-service/route.ts` | Proxy endpoint for calling external ERC-8004 services |

### Modified Files

| File | Changes |
|------|---------|
| `lib/cache/keys.ts` | Added ERC-8004 cache keys and TTLs |
| `lib/services/agent0.ts` | Added cached search methods (SWR pattern) |
| `lib/services/agent-registry.ts` | Added `registerMCP()` method |
| `db/schemas/user-mcps.ts` | Added ERC-8004 registration fields to schema |
| `lib/services/user-mcps.ts` | Added ERC-8004 registration on MCP publish |

## API Endpoints

### GET /api/v1/discovery

Unified discovery of services from all sources.

**Query Parameters:**
- `query` - Text search on name/description
- `types` - Filter by service type (agent, mcp, a2a, app)
- `sources` - Filter by source (local, erc8004)
- `categories` - Filter by category
- `tags` - Filter by tags
- `mcpTools` - Filter by MCP tools
- `a2aSkills` - Filter by A2A skills
- `x402Only` - Only services with x402 support
- `limit` / `offset` - Pagination

**Response:**
```json
{
  "services": [
    {
      "id": "uuid or chainId:tokenId",
      "name": "Service Name",
      "description": "...",
      "type": "agent|mcp|a2a|app",
      "source": "local|erc8004",
      "mcpEndpoint": "https://...",
      "a2aEndpoint": "https://...",
      "x402Support": true,
      "pricing": {...}
    }
  ],
  "total": 100,
  "hasMore": true
}
```

### POST /api/v1/external-service

Proxy requests to external ERC-8004 services with credit management.

**Request Body:**
```json
{
  "serviceId": "chainId:tokenId",
  "serviceType": "mcp|a2a",
  "payload": { ... },
  "timeout": 30000
}
```

**Response:**
```json
{
  "success": true,
  "serviceId": "...",
  "status": 200,
  "response": { ... },
  "metadata": {
    "duration": 150,
    "creditsCharged": 0.5
  }
}
```

### GET /api/mcp/registry

MCP registry now supports `includeExternal=true` to include ERC-8004 MCPs.

### POST /api/v1/mcps/[mcpId]/publish

Publish endpoint now supports ERC-8004 registration:

```json
{
  "registerOnChain": true,
  "network": "base-sepolia"
}
```

## MCP Server Tools

Added discovery tools to the MCP server (`/api/mcp`):

| Tool | Description |
|------|-------------|
| `discover_services` | Search for services from all sources |
| `get_service_details` | Get detailed info about a specific service |
| `find_mcp_tools` | Find services with specific MCP tools |
| `find_a2a_skills` | Find agents with specific A2A skills |

## Database Schema

New fields added to `user_mcps` table:

```sql
erc8004_registered BOOLEAN DEFAULT false NOT NULL
erc8004_network TEXT
erc8004_agent_id INTEGER
erc8004_agent_uri TEXT
erc8004_tx_hash TEXT
erc8004_registered_at TIMESTAMP
```

## Caching Strategy

Uses Redis with Stale-While-Revalidate (SWR) pattern:

- **Search results**: 5 min TTL, 3 min stale threshold
- **Agent details**: 1 hour TTL
- **Discovery results**: 3 min TTL, 2 min stale threshold

Cache keys:
```
erc8004:search:{network}:{filterHash}:v1
erc8004:agent:{agentId}:v1
erc8004:discovery:{filterHash}:v1
```

## Usage Examples

### Discover Services (MCP Tool)

```
Tool: discover_services
Input: {
  "query": "crypto",
  "types": ["mcp"],
  "sources": ["local", "erc8004"],
  "limit": 10
}
```

### Publish MCP with ERC-8004 Registration

```bash
curl -X POST /api/v1/mcps/{mcpId}/publish \
  -H "Authorization: Bearer {apiKey}" \
  -d '{"registerOnChain": true, "network": "base-sepolia"}'
```

### Call External Service

```bash
curl -X POST /api/v1/external-service \
  -H "Authorization: Bearer {apiKey}" \
  -d '{
    "serviceId": "84532:123",
    "serviceType": "mcp",
    "payload": {"method": "tools/list"}
  }'
```

## Configuration

Required environment variables:

- `AGENT0_PRIVATE_KEY` - Wallet key for on-chain registration (pays gas)
- `PINATA_JWT` - (Optional) For IPFS-based registration files

Network configuration in `config/erc8004.json`:

```json
{
  "defaultNetwork": "base-sepolia",
  "networks": {
    "base-sepolia": {
      "chainId": 84532,
      "rpcUrl": "https://sepolia.base.org",
      "contracts": {
        "identityRegistry": "0x...",
        "reputationRegistry": "0x...",
        "validationRegistry": "0x..."
      }
    }
  }
}
```

## Migration Steps

1. Run database migration:
   ```bash
   bun run db:migrate
   ```

2. Clear Redis cache (optional):
   ```bash
   redis-cli KEYS "erc8004:*" | xargs redis-cli DEL
   ```

3. Set required environment variables

## Security Considerations

1. **Rate Limiting**: 60 requests/minute for external service proxy
2. **Credit Management**: 0.5 credits per external service call
3. **Service Validation**: Validates services exist in ERC-8004 registry before proxying
4. **Timeout Protection**: 30s default timeout, max 120s

## Future Enhancements

1. **Reputation Integration**: Sync with ERC-8004 Reputation Registry
2. **Validation Registry**: Submit validation requests
3. **x402 Payments**: Native x402 payment flow for external services
4. **Base Mainnet Subgraph**: Deploy subgraph for production network

