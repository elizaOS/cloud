# Load Testing Framework

k6 load tests for Eliza Cloud APIs with universal test key support for CI/CD and local testing.

## Universal Test API Key

The framework uses a universal test API key created by `scripts/seed-test-api-key.ts`:

```
eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

This key works in both local development and CI environments.

## Quick Start

```bash
# 1. Install k6
brew install k6

# 2. Setup database and seed test data
bun run db:push
bun run db:seed:test-key

# 3. Start the dev server
bun run dev

# 4. Run smoke test
bun run load:smoke
```

## Running Tests

### Local Testing

```bash
# Seed the test API key (required first time)
bun run db:seed:test-key

# Start server in another terminal
bun run dev

# Run load tests
bun run load:smoke        # Quick sanity check
bun run load:local        # Full platform test
bun run load:stress       # High load test
```

### CI/CD

The CI workflow automatically:

1. Sets up PostgreSQL database
2. Runs `db:push` to create schema
3. Runs `seed-test-api-key.ts` to create test data
4. Builds and starts the server
5. Verifies API key authentication
6. Runs load tests

Triggered by:

- Pull requests to main (smoke test)
- Nightly schedule (smoke test)
- Manual dispatch (any scenario)

## Scenarios

| Scenario      | Command                   | Description                |
| ------------- | ------------------------- | -------------------------- |
| Smoke         | `bun run load:smoke`      | Quick sanity (1 VU, 1 min) |
| Full Platform | `bun run load:local`      | Complete API coverage      |
| Stress        | `bun run load:stress`     | High load beyond normal    |
| Spike         | `bun run load:spike`      | Sudden traffic burst       |
| Soak          | `bun run load:soak`       | Endurance (30 min)         |
| Throughput    | `bun run load:throughput` | RPS capacity test          |
| Rate Limit    | `bun run load:rate-limit` | Rate limiter validation    |

## API Coverage (23 scenarios)

**Main scenarios:** smoke, stress, spike, soak, full-platform, rate-limit, throughput

**REST API:** agents, credits, storage, discovery, chat, rooms, knowledge, billing, voice, api-keys, containers

**Protocols:** mcp/tools, a2a/methods, cron/endpoints

**Webhooks:** discord, telegram

## Test Data

The `seed-test-api-key.ts` script creates:

| Entity          | ID/Value                               |
| --------------- | -------------------------------------- |
| Organization ID | `ec42ddc9-c6bc-4306-815b-438ba59bf876` |
| User ID         | `318fafde-d785-4990-9bda-a4a2eed8db62` |
| API Key ID      | `926a821a-bb75-4eb8-b43f-05ed8ae9020c` |
| API Key         | `eliza_test_0123...`                   |
| Credits         | $1000                                  |

## Structure

```
tests/load/
├── config/           # environments, thresholds, scenarios
├── helpers/          # auth, assertions, http, mcp, metrics
├── scenarios/
│   ├── api-v1/       # REST endpoints (11 files)
│   ├── mcp/          # MCP tools
│   ├── a2a/          # A2A methods
│   ├── webhooks/     # Discord/Telegram
│   ├── cron/         # Background jobs
│   └── *.ts          # Main scenarios (7 files)
├── scripts/          # Shell runners
├── tests/            # Framework tests
└── dist/             # Bundled JS (gitignored)
```

## Environment Variables

| Variable          | Description                            | Default                 |
| ----------------- | -------------------------------------- | ----------------------- |
| `LOAD_TEST_ENV`   | Environment (local/staging/production) | `local`                 |
| `BASE_URL`        | Server URL                             | `http://localhost:3000` |
| `API_KEY`         | API key (overrides all)                | Universal test key      |
| `LOCAL_API_KEY`   | Local override                         | Universal test key      |
| `STAGING_API_KEY` | Staging API key                        | Required for staging    |
| `PROD_API_KEY`    | Production API key                     | Required for production |

## Commands

```bash
bun run load:test       # Run framework unit tests
bun run load:smoke      # Quick smoke test
bun run load:local      # Full platform test
bun run load:stress     # Stress test
bun run load:spike      # Spike test
bun run load:soak       # Soak test (30 min)
bun run load:staging    # Test against staging (needs STAGING_API_KEY)
bun run load:production # Test against production (needs PROD_API_KEY)
```

## Troubleshooting

### Server not responding

```bash
# Check server is running
curl http://localhost:3000/.well-known/agent-card.json

# Restart server
pkill -f "next"
bun run dev
```

### Authentication failures

```bash
# Re-seed test data
bun run db:seed:test-key

# Verify API key works
curl -H "Authorization: Bearer eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  http://localhost:3000/api/credits/balance
```

### k6 not installed

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```
