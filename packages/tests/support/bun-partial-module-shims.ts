/**
 * Bun 1.3.9+ validates `mock.module` factories: runtime named exports must match the source module.
 * Partial mocks that omit `UsersRepository` / `CreditsService` / etc. break `export *` re-exports
 * (e.g. `@/db/repositories`) and later imports in the same process.
 */

const COST_BUFFER = Number(process.env.CREDIT_COST_BUFFER) || 1.5;
const MIN_RESERVATION = 0.000001;

/** Minimal interface for stubbing usersRepository in tests. */
interface UsersRepositoryStub {
  listByOrganization?: (...args: unknown[]) => Promise<unknown[]>;
  [key: string]: unknown;
}

/** Shape returned by stubUsersRepositoryModule matching the real module exports. */
interface UsersRepositoryModuleStub {
  UsersRepository: new () => object;
  usersRepository: UsersRepositoryStub;
}

export function stubUsersRepositoryModule(overrides: {
  usersRepository: UsersRepositoryStub;
}): UsersRepositoryModuleStub {
  class UsersRepository {}
  return {
    UsersRepository,
    usersRepository: overrides.usersRepository,
  };
}

export const creditsModuleRuntimeShim = {
  COST_BUFFER,
  MIN_RESERVATION,
  EPSILON: MIN_RESERVATION * 0.1,
  DEFAULT_OUTPUT_TOKENS: 500,
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    public readonly required: number;
    public readonly available: number;
    public readonly reason?: string;

    constructor(required: number, available: number, reason?: string) {
      super(
        `Insufficient credits. Required: $${required.toFixed(4)}, Available: $${available.toFixed(4)}`,
      );
      this.name = "InsufficientCreditsError";
      this.required = required;
      this.available = available;
      this.reason = reason;
    }
  },
  CreditsService: class CreditsService {},
};
