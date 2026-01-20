# Tests

## Quick Start

```bash
# 1. Start local services (postgres + redis)
docker-compose up -d

# 2. Run tests
bun test:integration          # Services tests
bun test:e2e                  # E2E tests (auto-starts server!)
bun test:properties           # Property-based tests
```

## Structure

```
tests/
├── setup.ts                 # 🔧 Preload: env vars (NODE_ENV, DATABASE_URL, etc.)
├── unit/                    # Pure logic, no external dependencies
├── integration/             # With DB, NO server needed
│   ├── services/           # Service layer tests (credits, budgets, etc.)
│   └── financial/          # Cross-service financial flows
├── e2e/                     # Server required (auto-started!)
│   ├── setup-server.ts     # 🔧 Preload: auto-starts Next.js server
│   ├── api/                # HTTP API tests
│   ├── runtime/            # Runtime/agent tests
│   └── browser/            # Playwright browser tests
├── properties/              # Property-based tests (fast-check)
├── builders/                # Test data builders (fluent API)
├── helpers/                 # Test utilities (factories, DB, HTTP client)
└── fixtures/                # Static test data (characters, etc.)
```

## Config Files

| File | Used for | Server |
|------|----------|--------|
| `bunfig.toml` | unit, integration, properties | ❌ Not needed |
| `bunfig.e2e.toml` | e2e/api, e2e/runtime | ✅ Auto-started |

The e2e config automatically starts the Next.js server before tests and shuts it down after (like Playwright's `webServer`).

## Test Categories

| Category | DB | Server | Config |
|----------|----|---------| -------|
| `unit/` | No | No | default |
| `integration/` | Yes | No | default |
| `properties/` | Yes | No | default |
| `e2e/api` | Yes | Yes | `bunfig.e2e.toml` |
| `e2e/runtime` | Yes | Yes | `bunfig.e2e.toml` |
| `e2e/browser` | Yes | Yes | Playwright config |

## Running Tests

```bash
# Unit tests (no deps)
bun test tests/unit

# Integration tests (needs DB)
bun test:integration

# E2E tests (needs DB, server auto-started)
bun test:e2e              # All e2e
bun test:e2e:api          # Just API tests
bun test:e2e:runtime      # Just runtime tests

# Property-based tests (slow)
bun test:properties

# Playwright browser tests
bunx playwright test tests/e2e/browser
```

## Philosophy

- **Sociable tests**: Real dependencies (DB, services), minimal mocks
- **Mock only**: External APIs (Discord, Blockchain, Email)
- **Race conditions**: Explicit concurrency tests for financial operations
- **Invariants**: Property-based tests for `balance >= 0` guarantees

## Helpers

All test utilities are available via `@/tests/helpers`:

```typescript
import {
  // DB connection
  getConnectionString,
  verifyConnection,

  // Test data factory
  createTestDataSet,
  cleanupTestData,

  // Runtime helpers
  createTestRuntime,
  sendTestMessage,

  // HTTP/SSE
  createTestApiClient,
  parseSSEStream,
} from "@/tests/helpers";
```

## CI

Tests run on PR/push to `dev` and `main`:

| Job | Tests | DB | Server |
|-----|-------|----| -------|
| `unit-tests` | unit/ | ❌ | ❌ |
| `integration-tests` | integration/ | ✅ | ❌ |
| `property-tests` | properties/ | ✅ | ❌ |
| `e2e-api` | e2e/api, e2e/runtime | ✅ | ✅ |
| `e2e-browser` | e2e/browser | ✅ | ✅ |
| `lint` | ESLint + TypeScript | ❌ | ❌ |
