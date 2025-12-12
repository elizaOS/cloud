# Domain Management System

Manages domain search, purchase, assignment, and monitoring for the Eliza Cloud platform.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Routes                           │
│  /api/v1/domains/*  │  /api/mcp (tools)  │  A2A skills │
└──────────────┬──────────────┬─────────────┬────────────┘
               │              │             │
┌──────────────▼──────────────▼─────────────▼────────────┐
│                    Services                             │
│  DomainManagement  │  DomainModeration  │  DomainRouter│
└──────────────┬──────────────┬─────────────┬────────────┘
               │              │             │
┌──────────────▼──────────────▼─────────────▼────────────┐
│                  Repository Layer                       │
│              managedDomainsRepository                   │
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│                    Database                             │
│    managed_domains  │  domain_moderation_events        │
└─────────────────────────────────────────────────────────┘
```

## Services

### DomainManagementService
- Domain search and availability checking via Vercel API
- Domain purchasing (credits only, x402 not yet implemented)
- External domain registration with DNS verification
- Assignment to apps, containers, agents, and MCPs
- DNS record management

### DomainModerationService
- Pre-purchase domain name validation
- Expletive and CSAM term detection
- Suspicious pattern detection (keyboard walks, random strings)
- Trademark concern flagging
- Content scanning of live domains

### DomainHealthMonitorService
- Periodic health checks (runs every 6 hours via cron)
- HTTP/HTTPS connectivity and SSL verification
- Content scans for live domains (runs daily via cron)
- Expiration warnings (30 days before expiry)
- Timeout protection (50s max runtime)

### DomainRouterService
- Routes custom domain requests to assigned resources
- Supports apps, containers, agents, and MCPs
- Error page generation for suspended/unverified domains

## Environment Variables

Required:
- `VERCEL_TOKEN` - Vercel API token with domain management permissions
- `VERCEL_TEAM_ID` - Vercel team ID (optional, for team-scoped domains)
- `CRON_SECRET` - Secret for authenticating cron job requests

Optional:
- `DATABASE_URL` - PostgreSQL connection string (Neon recommended)
- `REDIS_RATE_LIMITING` - Set to "true" for production rate limiting

## Database Migration

Before first use, run the migration:
```bash
bun run db:migrate
```

This creates:
- `managed_domains` table
- `domain_moderation_events` table
- Required enums for status types

## API Endpoints

### Public API (`/api/v1/domains/*`)
- `GET /search?q=keyword` - Search available domains
- `GET /check?domain=example.com` - Check single domain availability
- `POST /purchase` - Purchase domain (rate limited: 5/5min)
- `GET /:id` - Get domain details
- `POST /:id/verify` - Verify domain ownership
- `POST /:id/assign` - Assign to resource
- `GET /:id/dns` - Get DNS records

### MCP Tools
- `domains_search` - Search domains (free)
- `domains_check` - Check availability (free)
- `domains_purchase` - Purchase domain
- `domains_list` - List organization domains
- `domains_assign_resource` - Assign to resource

### Cron Jobs
- `GET /api/cron/domain-health` - Health checks (every 6 hours)
- `POST /api/cron/domain-health` - Content scans (daily)

## Limitations

1. **Payment**: Only credits supported. x402 crypto payment not yet implemented.
2. **Content scanning**: Text only (first 5KB). No image analysis.
3. **Trademark detection**: Basic word matching, not legal verification.
4. **DNS verification**: Uses system DNS resolver, may not work in all serverless environments.

## Testing

```bash
# Run all domain tests
bun test tests/unit/domain*.test.ts

# Run individually (more reliable)
bun test tests/unit/domain-moderation.test.ts
bun test tests/unit/domain-management.test.ts
bun test tests/unit/domain-router.test.ts
bun test tests/unit/domain-api-routes.test.ts
```

Note: Batch test runs may have mock isolation issues with Bun's test runner.

