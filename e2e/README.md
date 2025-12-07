# E2E Testing with Playwright

This directory contains comprehensive end-to-end tests for the Eliza Cloud platform, including API tests, UI tests, wallet authentication, and full flow testing.

## Overview

Our E2E testing setup uses:

- **[Playwright](https://playwright.dev/)** - Modern web testing framework
- **[Synpress](https://synpress.io/)** - Web3/wallet testing extension for Playwright
- **MetaMask** - Browser wallet extension for testing wallet login flows

## Test Configuration

### Development Mode vs CI/Production Mode

The test configuration automatically adapts based on environment:

| Setting | Development Mode | CI/Production Mode |
|---------|------------------|-------------------|
| Server | `bun run dev` (on-demand compilation) | `bun run start` (pre-built) |
| Action Timeout | 30s | 15s |
| Navigation Timeout | 90s | 30s |
| Test Timeout | 180s | 60s |
| Retries | 0 | 2 |

**Development Mode**: Tests run against the dev server with longer timeouts to accommodate on-demand page compilation.

**CI/Production Mode**: Tests run against the pre-built production server with standard timeouts. Activated when `CI=true` or `NODE_ENV=production`.

### Page Warmup

A global setup script (`global.setup.ts`) runs before tests to pre-compile all pages in development mode. This prevents timeout issues during actual test execution:

1. Visits all public pages (`/`, `/login`, `/marketplace`, etc.)
2. Visits all dashboard pages (`/dashboard/*`)
3. Hits API routes to trigger compilation
4. Reports warmup status before tests begin

## Prerequisites

1. **Node.js 18+** and **Bun** installed
2. **Chrome/Chromium** browser installed
3. Test wallet seed phrase (NEVER use a wallet with real funds!)
4. Test API key (for authenticated API tests)

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Install Playwright Browsers

```bash
bunx playwright install chromium
```

### 3. Configure Environment Variables

Copy `env.example` to `.env` and configure:

```bash
cp e2e/env.example e2e/.env
```

Required variables:

```bash
# Base URL for tests (defaults to http://localhost:3000)
PLAYWRIGHT_BASE_URL="http://localhost:3000"

# API key for authenticated tests
TEST_API_KEY="eliza_xxxxx"

# Wallet testing (optional)
TEST_WALLET_SEED_PHRASE="test test test test test test test test test test test junk"
TEST_WALLET_PASSWORD="TestPassword123!"
```

**⚠️ SECURITY WARNING:** Never use a wallet with real funds for testing. Generate a dedicated test seed phrase.

## Running Tests

### Development Mode (against dev server)

```bash
# Run all tests against dev server (recommended for local development)
bun run test:e2e:dev

# Or start dev server first, then run tests
bun run dev  # In terminal 1
bun run test:e2e  # In terminal 2 (will reuse existing server)
```

### CI/Production Mode (against built server)

```bash
# Build the app first
bun run build

# Run tests against production server
bun run test:e2e:ci

# Or manually set CI mode
CI=true NODE_ENV=production bun run test:e2e
```

### Test Subsets

```bash
# Run only UI tests (pages, forms, buttons)
bun run test:e2e:ui

# Run only API tests
bun run test:e2e:api

# Run page loading tests
bun run test:e2e:pages

# Run miniapp tests
bun run test:e2e:miniapp

# Run miniapp authenticated tests
bun run test:e2e:miniapp:auth

# Run wallet tests
bun run test:e2e:wallet:local
```

### Debug Mode

```bash
# Run with browser visible
bun run test:e2e:headed

# Run in debug mode (step through tests)
bun run test:e2e:debug

# View HTML report
bun run test:e2e:report
```

## Test Structure

```
e2e/
├── playwright.config.ts        # Playwright & test configuration
├── global.setup.ts             # Page warmup before tests
├── tsconfig.json               # TypeScript config
├── env.example                 # Environment variables template
├── README.md                   # This file
│
├── fixtures/
│   └── test-fixtures.ts        # Shared test utilities & selectors
│
├── wallet-setup/
│   └── wallet.setup.ts         # MetaMask wallet initialization
│
├── test-results/               # Test artifacts (screenshots, traces)
├── test-reports/               # HTML reports
│
└── tests/
    ├── all-pages.spec.ts           # Page loading tests
    ├── api-keys.spec.ts            # API keys CRUD tests
    ├── analytics-api.spec.ts       # Analytics API tests
    ├── auth-session-api.spec.ts    # Auth & session API tests
    ├── billing-flow.spec.ts        # Billing & credits tests
    ├── chat-api.spec.ts            # Chat/Eliza API tests
    ├── chat-and-agents.spec.ts     # Chat UI tests
    ├── complete-ui-coverage.spec.ts# Comprehensive UI tests
    ├── comprehensive-buttons.spec.ts# Button interaction tests
    ├── containers-deployment.spec.ts# Container API tests
    ├── containers-extended.spec.ts # Extended container tests
    ├── form-submissions.spec.ts    # Form submission tests
    ├── gallery-storage-knowledge.spec.ts # Storage tests
    ├── interactive-features.spec.ts # Interactive UI tests
    ├── invoices-payments-api.spec.ts # Payment API tests
    ├── marketplace-api.spec.ts     # Marketplace API tests
    ├── mcp-api.spec.ts             # MCP server API tests
    ├── miniapp-authenticated.spec.ts # Miniapp API tests
    ├── misc-api.spec.ts            # Miscellaneous API tests
    ├── models-embeddings-api.spec.ts # Models API tests
    ├── my-agents-api.spec.ts       # My Agents API tests
    ├── organizations-api.spec.ts   # Org management tests
    ├── voice-api.spec.ts           # ElevenLabs voice tests
    ├── wallet-login.spec.ts        # Wallet auth tests
    ├── social-login.spec.ts        # OAuth auth tests
    └── global.teardown.ts          # Cleanup after tests
```

## Test Categories

### API Tests (`*-api.spec.ts`)

Tests all API endpoints with real HTTP requests:

- Authentication validation
- CRUD operations
- Error handling
- Response structure validation

### UI Tests (`*.spec.ts` without `-api`)

Tests user interface interactions:

- Page loading and content
- Button clicks and form submissions
- Navigation flows
- Responsive design

### Wallet Tests (`wallet-*.spec.ts`)

Tests Web3 wallet integration:

- MetaMask connection
- Transaction signing
- Wallet state management

## Test Patterns

### API Tests Pattern

```typescript
test.describe("My Feature API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("GET /api/my-endpoint returns data", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/my-endpoint`, {
      headers: authHeaders(),
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ My endpoint works");
    }
  });
});
```

### UI Tests Pattern

```typescript
test.describe("My Feature UI", () => {
  test("page loads correctly", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/my-page`);
    await page.waitForLoadState("networkidle");

    // Check for auth redirect
    if (page.url().includes("/login")) {
      console.log("ℹ️ Requires authentication");
      return;
    }

    const element = page.locator('[data-testid="my-element"]');
    await expect(element).toBeVisible();
  });
});
```

## Debugging

### View Test Traces

Failed tests automatically generate traces:

```bash
bunx playwright show-trace e2e/test-results/<test-name>/trace.zip
```

### Run Single Test

```bash
bunx playwright test -g "should successfully login" --config=e2e/playwright.config.ts
```

### Increase Verbosity

```bash
DEBUG=pw:api bun run test:e2e
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
          
      - name: Install dependencies
        run: bun install
        
      - name: Install Playwright
        run: bunx playwright install chromium
        
      - name: Build application
        run: bun run build
        
      - name: Run E2E Tests
        env:
          CI: true
          NODE_ENV: production
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
          PLAYWRIGHT_BASE_URL: http://localhost:3000
        run: bun run test:e2e:ci
        
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: e2e/test-results/
```

## Troubleshooting

### Tests Timing Out in Dev Mode

The global setup pre-compiles pages, but individual tests may still timeout if:

1. **Page is very complex**: Increase `navigationTimeout` in config
2. **Server is slow to start**: Increase `webServer.timeout`
3. **Network issues**: Check localhost:3000 is accessible

### API Tests Failing with 401

Ensure `TEST_API_KEY` is set and valid:

```bash
echo $TEST_API_KEY  # Check it's set
curl -H "Authorization: Bearer $TEST_API_KEY" http://localhost:3000/api/v1/api-keys
```

### MetaMask Not Found

Build the wallet cache first:

```bash
bunx synpress --wallet-setup
```

### Server Already Running

Tests will reuse an existing server (`reuseExistingServer: true`). This is the recommended approach for development.

## Adding New Tests

1. Create test file in `e2e/tests/` with `.spec.ts` extension
2. Add page to warmup in `global.setup.ts` if new page
3. Use `data-testid` attributes for reliable element selection
4. Follow existing patterns for consistency
5. Run tests locally before committing

### Naming Conventions

- `*-api.spec.ts` - API endpoint tests
- `*-ui.spec.ts` - UI-only tests
- `*.spec.ts` - Mixed or general tests
