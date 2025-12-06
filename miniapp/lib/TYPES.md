# Miniapp Type System

## Complete Separation from Main App

The miniapp maintains **complete type independence** from the main app. This ensures:

1. **No Coupling**: The miniapp can evolve independently without affecting the main app
2. **Clear Boundaries**: Types are explicitly defined for the miniapp's specific needs
3. **API Contract**: Types match the API contract between miniapp and cloud, not internal DB schemas

## Type Organization

### `miniapp/lib/types.ts`
**Single source of truth** for all miniapp types. This file contains:

- **Agent Types**: `Agent`, `AgentDetails`, `MessageExampleConversation`
- **Chat & Message Types**: `Chat`, `Message`, `MessageAttachment`
- **User & Organization Types**: `User`, `Organization`
- **Billing Types**: `Billing`, `AppBilling`, `CreditPack`, `UsageSummary`, `Transaction`
- **Pagination Types**: `Pagination`
- **Streaming Types**: `StreamCallbacks`
- **Referral & Rewards Types**: `ReferralInfo`, `RewardsStatus`, `ShareStatus`
- **Auth Types**: `AuthUser`, `AuthState`

### `miniapp/lib/cloud-api.ts`
- Imports types from `./types.ts`
- Re-exports types for convenience
- Contains API client functions

### `miniapp/lib/use-auth.ts`
- Imports `AuthUser` and `AuthState` from `./types.ts`
- Contains authentication logic

## Rules

1. **NEVER** import types from the parent app (`../lib/types`, `@/lib/types`, etc.)
2. **ALWAYS** import types from `./types.ts` or `@/lib/types` (which resolves to `miniapp/lib/types.ts`)
3. **NEVER** use database schema types directly - use API response types instead
4. **ALWAYS** define types that match the API contract, not internal implementations

## Type Differences from Main App

The miniapp types may differ from main app types because:

- **API-First**: Types match API responses, not database schemas
- **Simplified**: Miniapp may not need all fields from the main app
- **Different Context**: Miniapp has different use cases and requirements

## Adding New Types

When adding new types:

1. Add them to `miniapp/lib/types.ts`
2. Export them from that file
3. Import them where needed using `import type { ... } from "@/lib/types"` or `import type { ... } from "./types"`
4. **Never** import from parent app types

## Verification

To verify no parent app types are imported:

```bash
# Check for imports from parent app
grep -r "from.*\.\.\/\.\.\/lib\|from.*\.\.\/\.\.\/db\|from.*\.\.\/\.\.\/components" miniapp/

# Should return no results (or only false positives like comments)
```

