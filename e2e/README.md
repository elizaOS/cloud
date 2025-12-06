# E2E Testing with Synpress & Playwright

This directory contains end-to-end tests for the Eliza Cloud platform, specifically focused on testing Privy authentication flows including wallet-based and social logins.

## Overview

Our E2E testing setup uses:

- **[Playwright](https://playwright.dev/)** - Modern web testing framework
- **[Synpress](https://synpress.io/)** - Web3/wallet testing extension for Playwright
- **MetaMask** - Browser wallet extension for testing wallet login flows

## Prerequisites

1. **Node.js 18+** and **Bun** installed
2. **Chrome/Chromium** browser installed
3. Test wallet seed phrase (NEVER use a wallet with real funds!)

## Setup

### 1. Install Dependencies

```bash
bun add -D @synthetixio/synpress @playwright/test
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

- `TEST_WALLET_SEED_PHRASE` - 12-word seed phrase for test wallet
- `TEST_WALLET_PASSWORD` - Password for MetaMask (min 8 chars)

**⚠️ SECURITY WARNING:** Never use a wallet with real funds for testing. Generate a dedicated test seed phrase.

### 4. Build Wallet Cache (First Time)

```bash
bun run synpress:cache
```

This creates a cached MetaMask state to speed up test execution.

## Running Tests

### Run All E2E Tests

```bash
bun run test:e2e
```

### Run Tests with UI Mode (Interactive)

```bash
bun run test:e2e:ui
```

### Run Tests with Browser Visible

```bash
bun run test:e2e:headed
```

### Run Only Wallet Tests

```bash
bun run test:e2e:wallet
```

### Run Only Social Login Tests

```bash
bun run test:e2e:social
```

### View Test Report

```bash
bun run test:e2e:report
```

## Test Structure

```
e2e/
├── playwright.config.ts     # Playwright & Synpress configuration
├── tsconfig.json            # TypeScript config for tests
├── env.example              # Environment variables template
├── README.md                # This file
├── fixtures/
│   └── test-fixtures.ts     # Shared test utilities & selectors
├── wallet-setup/
│   └── wallet.setup.ts      # MetaMask wallet initialization
└── tests/
    ├── wallet-login.spec.ts # Wallet authentication tests
    ├── social-login.spec.ts # OAuth authentication tests
    └── global.teardown.ts   # Cleanup after tests
```

## Test Coverage

### Wallet Login Tests (`wallet-login.spec.ts`)

- ✅ Display login page with wallet option
- ✅ Open Privy modal on Connect Wallet click
- ✅ Complete MetaMask connection and signature
- ✅ Handle wallet connection rejection
- ✅ Handle signature rejection
- ✅ Persist authentication after page reload

### Social Login Tests (`social-login.spec.ts`)

- ✅ Display all OAuth options (Google, Discord, GitHub)
- ✅ Initiate OAuth flows
- ✅ Show loading states during OAuth
- ✅ Email login flow
- ✅ Verification code entry
- ✅ Handle signup intent parameter

## Debugging

### Debug Wallet Setup Issues

```bash
bun run synpress:debug
```

### Run Specific Test File

```bash
bunx playwright test e2e/tests/wallet-login.spec.ts --config=e2e/playwright.config.ts
```

### Run Single Test by Name

```bash
bunx playwright test -g "should successfully login with MetaMask" --config=e2e/playwright.config.ts
```

### View Trace on Failure

Failed tests automatically generate traces. View them with:

```bash
bunx playwright show-trace e2e/test-results/<test-name>/trace.zip
```

## CI/CD Integration

For CI environments:

1. Set `CI=true` environment variable
2. Use `--workers=1` for wallet tests (to avoid conflicts)
3. Consider using a dedicated test Privy app with test mode enabled

Example GitHub Actions workflow:

```yaml
- name: Run E2E Tests
  env:
    CI: true
    TEST_WALLET_SEED_PHRASE: ${{ secrets.TEST_WALLET_SEED_PHRASE }}
    TEST_WALLET_PASSWORD: ${{ secrets.TEST_WALLET_PASSWORD }}
  run: |
    bunx playwright install chromium
    bun run synpress:cache
    bun run test:e2e
```

## Troubleshooting

### "MetaMask not found" Error

Ensure you've built the wallet cache: `bun run synpress:cache`

### Tests Timing Out

- Increase timeout in `playwright.config.ts`
- Ensure dev server is running: `bun run dev`
- Check if localhost:3000 is accessible

### OAuth Tests Failing

OAuth tests verify the flow starts but don't complete actual OAuth.
For full OAuth testing, use:

- Mock OAuth provider
- Test accounts (Google, Discord, GitHub)
- Privy test mode

### Wallet Connection Rejected Automatically

Ensure `TEST_WALLET_SEED_PHRASE` is a valid 12-word mnemonic.

## Adding New Tests

1. Create test file in `e2e/tests/` with `.spec.ts` extension
2. Import fixtures from `../fixtures/test-fixtures`
3. Use `data-testid` attributes for element selection (add to components as needed)
4. Follow existing test patterns for consistency

Example:

```typescript
import { test, expect } from "../fixtures/test-fixtures";
import { goToLogin, LoginSelectors } from "../fixtures/test-fixtures";

test("should do something", async ({ page }) => {
  await goToLogin(page);
  // Your test logic
});
```
