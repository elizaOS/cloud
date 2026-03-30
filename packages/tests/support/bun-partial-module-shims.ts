/**
 * Bun 1.3.9+ validates `mock.module` factories: runtime named exports must match the source module.
 * Partial mocks that omit `UsersRepository` / `CreditsService` / etc. break `export *` re-exports
 * (e.g. `@/db/repositories`) and later imports in the same process.
 */

const MIN_RESERVATION = 0.000001;

export function stubUsersRepositoryModule(overrides: {
  usersRepository: object;
}): Record<string, unknown> {
  class UsersRepository {}
  return {
    UsersRepository,
    usersRepository: overrides.usersRepository,
  };
}

export const creditsModuleRuntimeShim = {
  COST_BUFFER: 1.5,
  MIN_RESERVATION,
  EPSILON: MIN_RESERVATION * 0.1,
  DEFAULT_OUTPUT_TOKENS: 500,
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    override name = "InsufficientCreditsError";
  },
  CreditsService: class CreditsService {},
} as const;
