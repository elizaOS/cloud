```
   1 | /**
   2 |  * Database error utilities for handling common Postgres error cases.
   3 |  * These utilities are the canonical implementations used across the codebase.
   4 |  */
   5 | 
   6 | /**
   7 |  * PostgreSQL unique violation (23505)
   8 |  * Detects when a database insert fails due to a unique constraint violation.
   9 |  * 
  10 |  * This function checks:
  11 |  * 1. Error message for "unique constraint" or "duplicate key"
  12 |  * 2. Postgres error code 23505 
  13 |  * 3. Recursively follows error.cause chain to handle wrapped DB errors
  14 |  * 
  15 |  * IMPORTANT: This is the single source of truth for unique constraint checking.
  16 |  * Do not create local implementations - import and use this function instead.
  17 |  * (Previous duplicate in user-service.ts has been consolidated here)
  18 |  */
  19 | export function isUniqueConstraintError(error: unknown): boolean {
  20 |   if (error instanceof Error) {
  21 |     const code = (error as { code?: string }).code;
  22 |     const cause = (error as { cause?: unknown }).cause;
  23 |     return (
  24 |       error.message.includes("unique constraint") ||
  25 |       error.message.includes("duplicate key") ||
  26 |       code === "23505" ||
  27 |       (cause !== undefined && isUniqueConstraintError(cause))
  28 |     );
  29 |   }
  30 |   return false;
  31 | }
  32 | 
```
