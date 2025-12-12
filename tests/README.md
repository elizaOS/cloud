# Test Configuration

This directory contains all tests for the eliza-cloud-v2 project. Tests are organized into categories and run in separate processes to prevent mock contamination.

## Test Categories

| Category | Script | Files | Description |
|----------|--------|-------|-------------|
| **Secrets** | `bun run test:unit:secrets` | `tests/unit/secrets*.test.ts` | Encryption, service, and API route tests for secrets management |
| **Domain** | `bun run test:unit:domain` | `tests/unit/domain*.test.ts` | Domain registration, verification, and moderation tests |
| **Services** | `bun run test:unit:services` | `tests/unit/services/**/*.test.ts` | Unit tests for individual services |
| **Misc** | `bun run test:unit:misc` | Various | A2A triggers, MCP tools, webhooks, x402, etc. |
| **Security** | `bun run test:security` | `tests/security/*.test.ts` | Security regression tests (double redemption, payout exploits) |
| **Integration** | `bun run test:integration` | `tests/integration/*.test.ts` | Database and API integration tests |
| **E2E** | `bun run test:e2e` | `tests/e2e/**/*.test.ts` | End-to-end tests requiring running server |

## Running Tests

### Run All Unit Tests (Isolated)
```bash
bun run test:unit
```
This runs each test category in a separate process to prevent mock.module contamination.

### Run All Tests
```bash
bun run test
```
Runs unit tests, security tests, and integration tests sequentially.

### Run Specific Category
```bash
bun run test:unit:secrets      # Secrets tests only
bun run test:unit:domain       # Domain tests only  
bun run test:unit:services     # Service tests only
bun run test:unit:misc         # Misc tests only
bun run test:security          # Security tests only
bun run test:integration       # Integration tests only
```

### Watch Mode
```bash
bun run test:watch
```
Watches secrets and domain tests for changes.

### Integration Tests
Integration tests require:
- Database connection (DATABASE_URL)
- Secrets master key (SECRETS_MASTER_KEY)

```bash
# Make sure .env.local has DATABASE_URL and SECRETS_MASTER_KEY
bun run test:integration
```

### Playwright E2E Tests
```bash
bun run test:playwright        # All Playwright tests
bun run test:playwright:ui     # UI tests only
bun run test:playwright:api    # API tests only
```

## Test Isolation

**Important**: Bun's `mock.module` persists across files within the same process. This means:

1. **Unit tests that heavily mock repositories** (like secrets tests) must run in separate processes from integration tests
2. **Each test category runs in its own process** to prevent mock leakage
3. **Do NOT run unit and integration tests together** in a single `bun test` command

### Why Separate Processes?

```bash
# ❌ BAD - Mocks from unit tests will break integration tests
bun test tests/unit tests/integration

# ✅ GOOD - Each category in separate process
bun run test:unit:secrets && bun run test:integration:secrets
```

## Directory Structure

```
tests/
├── setup.ts              # Test environment setup (loads .env)
├── test-utils.ts         # Shared test utilities
├── README.md             # This file
├── unit/                 # Unit tests
│   ├── secrets*.test.ts  # Secrets module tests
│   ├── domain*.test.ts   # Domain module tests
│   └── services/         # Service-level tests
│       ├── defi/         # DeFi service tests
│       └── *.test.ts     # Other service tests
├── integration/          # Integration tests (require DB)
│   └── *.test.ts
├── security/             # Security regression tests
│   └── *.test.ts
├── e2e/                  # End-to-end tests
│   ├── org/              # Organization tests
│   └── *.test.ts
└── playwright/           # Playwright browser tests
    ├── fixtures/
    ├── global.setup.ts
    └── *.spec.ts
```

## Writing New Tests

### Unit Tests
- Place in `tests/unit/` or `tests/unit/services/`
- Use `mock.module` for isolating dependencies
- Follow naming convention: `*.test.ts`

### Integration Tests
- Place in `tests/integration/`
- Use real database connections
- Clean up test data in afterEach/afterAll

### Security Tests
- Place in `tests/security/`
- Focus on preventing regressions in security-critical code

## CI/CD

Tests run in GitHub Actions with parallel jobs:

```
lint ──┬── unit-tests-secrets ─────────┐
       ├── unit-tests-domain ──────────┤
       ├── unit-tests-services ────────┤
       ├── unit-tests-misc ────────────┼── ci-ok
       ├── security-tests ─────────────┤
       ├── integration-tests ──────────┤
       └── build ──┬── e2e-ui ─────────┤
                   ├── e2e-api ────────┤
                   ├── e2e-pages ──────┤
                   └── e2e-miniapp ────┘
```

## Troubleshooting

### Mock Contamination
If you see errors like `undefined is not a function` in integration tests after running unit tests:
- Run tests in separate processes using the category scripts
- Clear bun's cache: `rm -rf node_modules/.cache`

### Database Connection Errors
- Ensure `DATABASE_URL` is set in `.env.local`
- Check Neon database is accessible
- Try running integration tests alone: `bun run test:integration`

### Timeout Errors
- Increase timeout in `bunfig.toml` (default: 30000ms)
- For specific tests: `test("name", async () => {...}, { timeout: 60000 })`

