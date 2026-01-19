# Tests

## Structure

```
tests/
├── unit/                    # Pure logic, no external dependencies
├── integration/             # With DB, NO server needed
│   ├── services/           # Service layer tests (credits, budgets, etc.)
│   └── financial/          # Cross-service financial flows
├── e2e/                     # Server required
│   ├── api/                # HTTP API tests
│   ├── runtime/            # Runtime/agent tests (requires server)
│   │   └── scenarios/      # Complex runtime scenarios
│   └── browser/            # Playwright browser tests
├── properties/              # Property-based tests (fast-check)
├── builders/                # Test data builders (fluent API)
├── helpers/                 # Test utilities (factories, DB setup, etc.)
└── fixtures/                # Static test data
```

## Test Categories

| Category | DB | Server | Description |
|----------|----|---------| ------------|
| `unit/` | No | No | Pure functions, isolated logic |
| `integration/` | Yes | No | Service interactions, DB operations |
| `e2e/` | Yes | Yes | Full HTTP flows, browser automation |
| `properties/` | Yes | No | Invariant testing with random inputs |

## Running Tests

```bash
# All integration tests (requires local DB)
bun test tests/integration --timeout 60000

# Unit tests only (fast, no deps)
bun test tests/unit --timeout 30000

# Property-based tests (slow, thorough)
bun test tests/properties --timeout 300000

# E2E API tests (requires running server)
bun test tests/e2e/api

# E2E runtime tests (requires running server)
bun test tests/e2e/runtime

# Playwright browser tests
bunx playwright test tests/e2e/browser
```

## Test Philosophy

- **Sociable tests**: Real dependencies (DB, services), minimal mocks
- **Mock only**: External APIs (Discord, Blockchain, Email)
- **Race conditions**: Explicit concurrency tests for financial operations
- **Invariants**: Property-based tests for `balance >= 0` guarantees

## Builders

Use builders for flexible test data setup:

```typescript
import { OrgBuilder, AgentBudgetBuilder } from "@/tests/builders";

const org = await new OrgBuilder()
  .withCredits(100)
  .withAutoTopUp(10, 50)
  .build(connectionString);
```

## CI

Tests run automatically on PR/push to `dev` and `main`:
- `unit-tests`: Fast unit tests (no DB)
- `integration-tests`: Service tests with PostgreSQL
- `property-tests`: Property-based invariant tests
- `lint`: ESLint + TypeScript checks
- `e2e-api`: API + runtime tests (requires server)
- `e2e-browser`: Playwright browser tests
