# Eliza Cloud V2

## Stack
- **Runtime**: Bun
- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL + Drizzle ORM
- **Deployment**: Vercel Serverless
- **UI**: React + Tailwind CSS

## Commands
```bash
bun install          # Install dependencies
bun run dev          # Start dev server
bun run build        # Production build
bun run db:migrate   # Apply database migrations
bun run db:generate  # Generate migration from schema
bun run db:studio    # Open Drizzle Studio
```

## Database Migrations

**Never use `db:push` - it's removed. All schema changes go through migrations.**

### Schema Change Workflow
1. Edit schema in `db/schemas/`
2. `bun run db:generate`
3. Review SQL in `db/migrations/`
4. `bun run db:migrate`
5. Commit both schema + migration

### Custom Migrations
```bash
npx drizzle-kit generate --custom --name=descriptive_name
```

### Rules
- No `CREATE INDEX CONCURRENTLY` (runs in transaction)
- Use `IF NOT EXISTS` / `IF EXISTS`
- Never edit applied migrations
- See `docs/database-migrations.md` for details

## Project Structure
```
app/           # Next.js App Router pages
lib/           # Business logic, services
db/
  schemas/     # Drizzle schema definitions
  migrations/  # SQL migration files
  repositories/# Data access layer
components/    # React components
scripts/       # CLI utilities
docs/          # Internal technical docs
```

## Authentication

Two parallel auth paths:

- **Privy** -- Web users (OAuth, email, embedded wallets). Session/cookie-based. Handled by `lib/auth.ts`.
- **SIWE** -- Programmatic agents (any EOA wallet). Returns an API key. See `docs/siwe-authentication.md`.

Both produce a `UserWithOrganization` that the rest of the app consumes. API endpoints use `requireAuthOrApiKeyWithOrg(req)` to accept either Privy sessions or API keys.

### SIWE Endpoints
- `GET  /api/auth/siwe/nonce`  -- Returns nonce + SIWE message params
- `POST /api/auth/siwe/verify` -- Verifies signature, handles sign-up/sign-in, returns API key

### Key Implementation Details
- Addresses: `getAddress()` for comparison, `.toLowerCase()` for DB lookups
- Nonces: single-use, 5-min TTL, stored in Redis (`CacheKeys.siwe.nonce`)
- New users get org + initial credits + API key in one request
- Race conditions on concurrent signup handled via 23505 duplicate key detection
