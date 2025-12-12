# Tests

## Quick Reference

```bash
bun run test:unit           # All unit tests (isolated)
bun run test:integration    # Integration tests (requires DB)
bun run test:security       # Security regression tests
bun run test               # Unit + Security + Integration
bun run test:playwright     # E2E browser tests
```

## Test Categories

| Category | Command | Description |
|----------|---------|-------------|
| Secrets | `test:unit:secrets` | Encryption, bindings, API routes |
| Domain | `test:unit:domain` | Registration, verification, moderation |
| Services | `test:unit:services` | Individual service unit tests |
| Misc | `test:unit:misc` | A2A, MCP, webhooks, etc |
| Security | `test:security` | Regression tests for exploits |
| Integration | `test:integration` | Real database tests |
| E2E | `test:e2e` | Full server tests |

## Structure

```
tests/
├── unit/           # Fast, mocked tests
├── integration/    # Real DB tests
├── security/       # Exploit regression tests
├── e2e/            # Full server tests
└── playwright/     # Browser tests
```

## Important: Mock Isolation

Bun's `mock.module` persists across files in the same process. Tests using heavy mocking run in separate processes:

```bash
# Wrong - mocks leak between files
bun test tests/unit tests/integration

# Right - separate processes
bun run test:unit && bun run test:integration
```

## Environment

Integration tests require:
- `DATABASE_URL` - Neon connection string
- `SECRETS_MASTER_KEY` - 64 hex chars
