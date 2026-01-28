# E2E Tests for Workflow Triggers

## Overview

This directory contains comprehensive E2E integration tests for the Workflow Triggers feature. The tests cover:

1. **API CRUD Operations** - Create, Read, Update, Delete triggers
2. **Trigger Matching Logic** - Keyword, contains, regex, phone matching
3. **Webhook Integration** - Twilio and Blooio webhooks
4. **Priority & Provider Filtering** - Trigger precedence rules
5. **Edge Cases & Error Handling** - Boundary conditions
6. **Real-World Scenarios** - Practical use cases

## Test Files

| File | Description | Type |
|------|-------------|------|
| `workflow-triggers-e2e.test.ts` | Main E2E test suite | Integration |
| `webhook-triggers-e2e.test.ts` | Webhook-specific tests | Integration |

## Running Tests

### Prerequisites

1. **Local Development Server Running**
   ```bash
   bun run dev
   ```

2. **Database Migrated**
   ```bash
   bun run db:push
   ```

3. **Environment Variables**
   Create a `.env.test` file or set these variables:
   ```env
   TEST_ORG_ID=<your-org-id>
   TEST_WORKFLOW_ID=<workflow-id-with-live-status>
   TEST_AUTH_TOKEN=<valid-api-token>
   ELIZAOS_CLOUD_BASE_URL=http://localhost:3000/api/v1
   ```

### Run All E2E Tests

```bash
# Run all E2E tests
bun test tests/e2e --timeout 60000

# Run specific test file
bun test tests/e2e/workflow-triggers-e2e.test.ts

# Run with verbose output
bun test tests/e2e --timeout 60000 --verbose
```

### Run Logic-Only Tests (No Server Required)

The test suite includes pure logic tests that don't require a server:

```bash
# These tests pass without server connection:
# - Trigger Matching Logic
# - Priority & Provider Filtering  
# - Response Configuration
# - Edge Cases & Error Handling
# - Real-World Scenarios

bun test tests/e2e/workflow-triggers-e2e.test.ts --timeout 30000
```

## Test Categories

### 1. API CRUD Tests (Requires Server)

Tests all API endpoints:
- `POST /api/v1/workflows/[id]/triggers` - Create
- `GET /api/v1/workflows/[id]/triggers` - List
- `GET /api/v1/workflows/[id]/triggers/[id]` - Get single
- `PATCH /api/v1/workflows/[id]/triggers/[id]` - Update
- `DELETE /api/v1/workflows/[id]/triggers/[id]` - Delete
- `GET /api/v1/triggers` - List all org triggers

### 2. Trigger Matching Tests (No Server Required)

Tests matching algorithms:
- **Keyword Matching**: Word boundary, case sensitivity
- **Contains Matching**: Substring matching
- **Regex Matching**: Pattern matching for dates, emails, phones
- **Phone Number Matching**: Normalization and comparison

### 3. Webhook Tests (Requires Server)

Tests webhook endpoints:
- Twilio webhook (`/api/webhooks/twilio/[orgId]`)
- Blooio webhook (`/api/webhooks/blooio/[orgId]`)
- Various message formats and edge cases

### 4. Real-World Scenarios (No Server Required)

Tests practical use cases:
- Calendar schedule requests
- Email forwarding triggers
- Appointment booking with dates
- VIP customer handling
- Provider-specific workflows
- Fallback to agent

## Test Expectations

### Passing Tests (53+)

All logic-based tests pass without server connection:
- Trigger matching algorithms
- Priority ordering
- Provider filtering
- Response template processing
- Edge case handling
- Real-world scenarios

### Requires Configuration (19+)

These tests require proper setup:
- API endpoint tests
- Webhook integration tests
- Tests requiring authentication

## Extending Tests

### Adding New Trigger Type Tests

```typescript
describe("New Trigger Type", () => {
  it("should match new pattern", () => {
    const trigger = {
      type: "new_type",
      config: { /* config */ }
    };
    
    const message = "test message";
    const matches = /* matching logic */;
    
    expect(matches).toBe(true);
  });
});
```

### Adding Webhook Scenarios

```typescript
it("should handle new webhook scenario", async () => {
  const response = await simulateTwilioWebhook(orgId, {
    Body: "new scenario message",
    From: "+15551234567",
  });
  
  expect(response.status).toBe(200);
});
```

## CI/CD Integration

For CI pipelines, use a test database and mock services:

```yaml
# Example GitHub Actions step
- name: Run E2E Tests
  env:
    TEST_ORG_ID: ${{ secrets.TEST_ORG_ID }}
    TEST_AUTH_TOKEN: ${{ secrets.TEST_AUTH_TOKEN }}
  run: bun test tests/e2e --timeout 60000
```

## Troubleshooting

### Tests fail with 401 Unauthorized

- Ensure `TEST_AUTH_TOKEN` is set and valid
- Check if the token has access to the test organization

### Tests fail with 404 Not Found

- Ensure `TEST_WORKFLOW_ID` points to an existing workflow
- Check if the workflow is in "live" or "testing" status

### Tests timeout

- Increase timeout: `--timeout 120000`
- Check if dev server is running
- Verify database connection

## Coverage

Current test coverage:

| Category | Tests | Status |
|----------|-------|--------|
| Keyword Matching | 7 | ✅ Pass |
| Contains Matching | 3 | ✅ Pass |
| Regex Matching | 6 | ✅ Pass |
| Phone Matching | 4 | ✅ Pass |
| Priority | 3 | ✅ Pass |
| Provider Filter | 3 | ✅ Pass |
| Response Config | 10 | ✅ Pass |
| Edge Cases | 12 | ✅ Pass |
| Real-World | 8 | ✅ Pass |
| API CRUD | 19 | Requires Setup |
| Webhooks | 42 | Requires Setup |
