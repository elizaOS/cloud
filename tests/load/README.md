# Load Testing Framework

k6 load tests for Eliza Cloud APIs.

## Quick Start

```bash
brew install k6
bun run dev
bun run load:smoke
```

## Scenarios

| Scenario | Command | Description |
|----------|---------|-------------|
| Smoke | `bun run load:smoke` | Quick sanity (1 VU, 1 min) |
| Full Platform | `bun run load:local` | Complete API coverage |
| Stress | `bun run load:stress` | High load beyond normal |
| Spike | `bun run load:spike` | Sudden traffic burst |
| Soak | `bun run load:soak` | Endurance (30 min) |
| Throughput | `bun run load:throughput` | RPS capacity test |
| Rate Limit | `bun run load:rate-limit` | Rate limiter validation |

## Environments

```bash
bun run load:local                           # Local (default)
STAGING_API_KEY=sk_... bun run load:staging  # Staging
PROD_API_KEY=sk_... bun run load:production  # Production (smoke only)
```

## API Coverage (23 scenarios)

**Main scenarios:** smoke, stress, spike, soak, full-platform, rate-limit, throughput

**REST API:** agents, credits, storage, discovery, chat, rooms, knowledge, billing, voice, api-keys, containers

**Protocols:** mcp/tools, a2a/methods, cron/endpoints

**Webhooks:** discord, telegram

## Structure

```
tests/load/
├── config/           # environments, thresholds, scenarios
├── helpers/          # auth, assertions, data-generators, metrics
├── scenarios/
│   ├── api-v1/       # REST endpoints
│   ├── mcp/          # MCP tools
│   ├── a2a/          # A2A methods
│   ├── webhooks/     # Discord/Telegram
│   ├── cron/         # Background jobs
│   └── *.ts          # Main scenarios
├── scripts/          # Shell runners
├── tests/            # Framework tests
└── dist/             # Bundled JS (gitignored)
```

## CI/CD Integration

- **PR to main:** Smoke test on API/service changes
- **Nightly (2 AM UTC):** Full platform test
- **Manual:** Any scenario, local or staging

```bash
bun run load:test   # Run framework tests (included in main test suite)
bun run load:ci     # CI runner script
```

## Adding New Scenarios

1. Create `scenarios/api-v1/my-endpoint.ts`
2. Use `parseBody`, `recordHttpError` from helpers
3. Export default function for k6
4. Add to `package.json` if needed
