```
# Database Migrations

This document outlines the proper workflow for managing database migrations with Drizzle ORM.

## Overview

We use [Drizzle ORM](https://orm.drizzle.team/) for database management. Migrations are stored in `db/migrations/` and tracked in `db/migrations/meta/_journal.json`.

**IMPORTANT**: As of this PR, `db:push` is deprecated. All schema changes MUST go through migrations.

## Why Migrations Matter

**The Problem**: Without proper migration tracking, you lose visibility into:
- What schema changes have been applied to production
- Whether local and production databases are in sync
- The order changes need to be applied in

**The Solution**: Drizzle tracks migrations via:
1. **SQL files** in `db/migrations/` - the actual DDL statements
2. **Journal** (`_journal.json`) - metadata about which migrations exist
3. **Database table** (`__drizzle_migrations`) - record of what's been applied

When these three sources are in sync, `db:migrate` reliably applies only pending changes.

## Key Principles

1. **Always use `db:generate`** to create migrations from schema changes
   - WHY: It generates proper journal entries and snapshots automatically
2. **Never manually create migration files** - they need proper snapshots and journal entries
   - WHY: Manual files won't be tracked and `db:migrate` will skip them
3. **Never use `db:push` in production** - it bypasses migration tracking
   - WHY: You won't know what's applied, making rollbacks impossible
4. **Review generated migrations** before committing
   - WHY: Auto-generated SQL may include unintended changes or destructive operations

## Workflow

### Making Schema Changes

1. **Modify the schema** in `db/schemas/`
2. **Generate migration**:
   ```bash
   bun run db:generate
   ```
3. **Review the generated migration** in `db/migrations/`
4. **Test locally**:
   ```bash
   bun run db:migrate
   ```
5. **Commit** both the schema change and migration

## Rules
- No `CREATE INDEX CONCURRENTLY` (runs in transaction)
- Use `IF NOT EXISTS` / `IF EXISTS`
- Never edit applied migrations
- See `docs/database-migrations.md` for details
```
