# Load Testing Framework

k6 load tests for Eliza Cloud APIs.

## Quick Start

```bash
brew install k6
bun run load:smoke
```

## Scenarios

| Scenario | Command |
|----------|---------|
| Smoke (1 VU, 1 min) | `bun run load:smoke` |
| Full Platform | `bun run load:local` |
| Stress | `bun run load:stress` |
| Spike | `bun run load:spike` |
| Soak (30 min) | `bun run load:soak` |
| Throughput | `bun run load:throughput` |
| Rate Limit | `bun run load:rate-limit` |

## Environments

```bash
bun run load:local                           # Local
STAGING_API_KEY=sk_... bun run load:staging  # Staging
PROD_API_KEY=sk_... bun run load:production  # Production (smoke only)
```

## API Coverage

- REST: Agents, Credits, Storage, Discovery, Rooms, Billing, Voice
- MCP: 25+ tools via `/api/mcp`
- A2A: 25+ methods via `/api/a2a`
- Cron: Background job endpoints

## Structure

```
tests/load/
├── config/      # environments, thresholds, scenarios
├── helpers/     # auth, assertions, data-generators, metrics
├── scenarios/   # api-v1/, mcp/, a2a/, cron/, smoke.ts, etc.
├── scripts/     # shell runners
└── tests/       # bun test suite
```

## Running Tests

```bash
bun run load:test  # Run framework tests
```
