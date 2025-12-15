# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## PROJECT OVERVIEW

Eliza Cloud V2 is a full-stack AI agent development platform built with Next.js 15, featuring multi-model text generation, AI image creation, enterprise authentication, and production-ready cloud infrastructure. The platform provides a SaaS interface for AI generation services with credit-based billing, organization management, and usage tracking.

- **Framework:** Next.js 15.5.4 with App Router and Turbopack
- **Package Manager:** bun (ALWAYS use `bun` for all package management)
- **Database:** Neon Serverless PostgreSQL with Drizzle ORM
- **Authentication:** WorkOS AuthKit with SSO support
- **Main Branch:** main

---

## COMMON COMMANDS

```bash
# Development
bun run dev              # Start dev server with Turbopack (fast HMR)
bun run build            # Create production build with Turbopack
bun start                # Start production server (requires build first)

# Code Quality
bun run lint             # Run ESLint
bun run lint:fix         # Run ESLint with auto-fix
bun run format           # Format code with Prettier
bun run format:check     # Check code formatting
bun run check-types      # Run TypeScript type checking (no emit)

# Database (Drizzle)
bun run db:generate      # Generate migration files from schema changes
bun run db:migrate       # Apply pending migrations
bun run db:push          # Push schema changes directly (dev only)
bun run db:studio        # Open Drizzle Studio database browser

# Local Database (Docker PostgreSQL - See LOCAL_DATABASE.md for full guide)
bun run db:local:setup   # Complete automated setup (one command to rule them all)
bun run db:local:start   # Start database container
bun run db:local:stop    # Stop database container
bun run db:local:clean   # Complete cleanup (removes all data and networks)
bun run db:local:logs    # View database logs
bun run db:local:seed    # Re-run seed data
```

---

## ARCHITECTURE & STRUCTURE

### Dual Database Schema Architecture

The project uses TWO separate database schemas that coexist in the same PostgreSQL database:

1. **SaaS Schema** (`db/sass/schema.ts`): Multi-tenant platform layer
   - Organizations, users, API keys, billing, credits
   - Usage records, generations tracking, jobs queue
   - Conversations and conversation messages
   - Model pricing and provider health monitoring

2. **Eliza Schema** (`db/eliza/schema.ts`): AI agent core functionality
   - Agents, rooms, worlds, entities, components
   - Memories with multi-dimensional vector embeddings (dim384-dim3072)
   - Relationships, participants, tasks, cache
   - Message servers, channels, and central messaging

**Important:** When modifying database schemas, both schemas are processed together by Drizzle. The `drizzle.config.ts` specifies both schema files, and migrations apply to both schemas simultaneously.

### Authentication Flow

The platform supports **dual authentication**: session-based (WorkOS) and API key-based.

1. **Session Auth (Dashboard Users)**:
   - Middleware intercepts all requests → checks WorkOS session
   - Protected routes redirect unauthenticated users to `/login`
   - `getCurrentUser()` retrieves user from DB via WorkOS email
   - Caching with `unstable_cache` (5min TTL) for performance

2. **API Key Auth (Programmatic Access)**:
   - API routes check `Authorization: Bearer <key>` header
   - `requireAuthOrApiKey()` handles both auth methods
   - API key validation includes active status, expiration, rate limits
   - Automatic usage count increment on each request

3. **Middleware Configuration** (`middleware.ts`):
   - Unauthenticated paths: `/`, `/api/models`, `/api/v1/*` public endpoints
   - Matcher excludes static files: `_next/static`, `_next/image`, image files
   - All `/dashboard/*` routes protected by default

### Cost & Credit System

The platform uses a **credit-based billing system** where costs are tracked in credits (not dollars):

- **Cost Calculation**: `lib/pricing.ts` handles all pricing logic
  - Database-driven pricing via `model_pricing` table
  - Fallback pricing for common models (GPT-4, Claude, etc.)
  - Costs stored as integers (credits × 100 for precision)
  - Provider detection from model name prefix

- **Credit Management**: `lib/queries/credits.ts`
  - `deductCredits()`: Atomic credit deduction with balance checking
  - `creditTransactions` table tracks all credit operations
  - Organizations have `credit_balance` (default: 10,000 credits)

- **Usage Tracking**: `lib/queries/usage.ts`
  - Every AI request creates a `usageRecords` entry
  - Tracks tokens, costs, model, provider, success/failure
  - Links to user, organization, API key, and optional error info

### API Route Pattern

All API routes follow this structure:

```typescript
export const maxDuration = 60; // Required for streaming/long operations

export async function POST(req: NextRequest) {
  // 1. Authenticate (session or API key)
  const { user, apiKey } = await requireAuthOrApiKey(req);

  // 2. Extract request body
  const body = await req.json();

  // 3. Process request with AI/database operations
  const result = await processRequest();

  // 4. In onFinish callback:
  //    - Calculate costs
  //    - Deduct credits
  //    - Create usage records
  //    - Store results in database

  // 5. Return streaming or JSON response
  return result.toUIMessageStreamResponse();
}
```

### Key Libraries & Patterns

- **AI SDK**: Vercel AI SDK for streaming responses
  - `streamText()` for chat completions
  - `convertToModelMessages()` for message format conversion
  - `onFinish` callback for persistence and billing

- **Database Access**:
  - Import via `import { db, schema, eq, and } from "@/lib/db"`
  - Query builders in `lib/queries/*` for reusable operations
  - Use Drizzle relations for joins (defined in schema files)
  - Always use prepared statements via Drizzle for security

- **Styling**: Tailwind CSS v4 with utility-first approach
  - `cn()` utility in `lib/utils.ts` for conditional classes
  - shadcn/ui components in `components/ui/`
  - Radix UI primitives for accessibility

- **State Management**:
  - Server Components by default (async/await)
  - Client Components only when needed (form interactions, real-time updates)
  - React 19 features: use server actions for mutations

---

## DEVELOPMENT GUIDELINES

### Database Changes

1. **Schema Modifications**: Edit `db/sass/schema.ts` or `db/eliza/schema.ts`
2. **Generate Migration**: `bun run db:generate` (review files in `db/migrations/`)
3. **Apply Migration**: `bun run db:migrate` (production) or `bun run db:push` (dev only)
4. **Never use `db:push` in production** - always generate migrations for version control

### Adding New AI Models

1. Update `lib/pricing.ts` fallback pricing map if not in database
2. Add provider mapping in `getProviderFromModel()` if new provider
3. Optionally seed `model_pricing` table for accurate cost tracking

### Authentication Patterns

**In Server Components:**

```typescript
import { requireAuth } from "@/lib/auth";
const user = await requireAuth(); // Auto-redirects if not authenticated
```

**In API Routes:**

```typescript
import { requireAuthOrApiKey } from "@/lib/auth";
const { user, apiKey, authMethod } = await requireAuthOrApiKey(req);
```

**Organization Check:**

```typescript
import { requireOrganization } from "@/lib/auth";
const user = await requireOrganization(orgId); // Validates org access
```

### Vector Embeddings (Eliza Schema)

The `embeddings` table supports multiple vector dimensions for different embedding models:

- `dim384` (SMALL), `dim512` (MEDIUM), `dim768` (LARGE)
- `dim1024` (XL), `dim1536` (XXL), `dim3072` (XXXL)

Use `DIMENSION_MAP` constant to map from `VECTOR_DIMS` enum to column names.

### Environment Variables

Required variables in `.env.local` (see `example.env.local`):

```bash
DATABASE_URL                        # Neon PostgreSQL connection string
WORKOS_CLIENT_ID                    # WorkOS authentication
WORKOS_API_KEY
WORKOS_COOKIE_PASSWORD              # Min 32 characters, cryptographically random
NEXT_PUBLIC_WORKOS_REDIRECT_URI     # OAuth callback URL
AI_GATEWAY_API_KEY                  # AI SDK Gateway access
```

---

## IMPORTANT PATTERNS

### Credit Deduction Pattern

Always deduct credits in the `onFinish` callback of streaming operations:

```typescript
onFinish: async ({ text, usage }) => {
  const { totalCost } = await calculateCost(
    model,
    provider,
    usage.inputTokens,
    usage.outputTokens,
  );
  const result = await deductCredits(
    user.organization_id,
    totalCost,
    description,
    user.id,
  );

  if (!result.success) {
    console.error("Insufficient balance");
    // Handle failure - log but don't block response
  }

  await createUsageRecord({
    /* usage details */
  });
};
```

### Error Handling for API Routes

Always create failed usage records for observability:

```typescript
try {
  // Success path
} catch (error) {
  await createUsageRecord({
    /* ... */,
    is_successful: false,
    error_message: error instanceof Error ? error.message : "Unknown error"
  });
  throw error; // or return error response
}
```

### Query Organization

Reusable database queries live in `lib/queries/`:

- `api-keys.ts`: API key validation, creation, regeneration
- `conversations.ts`: Chat history management
- `credits.ts`: Credit operations (deduct, add, check balance)
- `organizations.ts`: Organization CRUD
- `usage.ts`: Usage record creation and analytics
- `users.ts`: User lookups with organization data

### Type Safety

- All database types inferred from Drizzle schema
- Custom types in `lib/types.ts` for composite data
- Use `UserWithOrganization` type for joined user+org data
- API request/response types defined inline or in route files

---

## TESTING & VALIDATION

Before considering any task complete:

1. Run `bun run check-types` to ensure TypeScript validity
2. Run `bun run lint` to check for linting errors
3. Test authentication flows (both session and API key)
4. Verify database queries execute successfully
5. Check credit deduction and usage tracking work correctly
6. Test in browser with dev server running

---

## NOTES

- **Turbopack**: Enabled by default for fast HMR; remove `--turbopack` flag if issues occur
- **Streaming**: Always set `maxDuration` export for routes using AI streaming
- **Security**: Never commit `.env.local`, always use server-side validation for API keys
- **Multi-tenancy**: All queries must filter by `organization_id` for data isolation
- **Caching**: Use `unstable_cache` sparingly; revalidate with tags when data changes
- **Git**: Use `gh` CLI for GitHub operations (PRs, issues, workflows)
