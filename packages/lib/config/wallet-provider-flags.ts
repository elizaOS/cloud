/**
 * Feature flags for the Privy → Steward wallet migration.
 *
 * Controlled via environment variables. Defaults are conservative
 * (Privy remains the default) so the rollout is opt-in.
 *
 * Separate from the main feature-flags.ts to avoid coupling the
 * migration with the existing UI feature flag system.
 */
export const WALLET_PROVIDER_FLAGS = {
  /** When true, new agent wallets are created via Steward instead of Privy. */
  USE_STEWARD_FOR_NEW_WALLETS: process.env.USE_STEWARD_FOR_NEW_WALLETS === "true",

  /** When true, the migration script is allowed to convert Privy wallets to Steward. */
  ALLOW_PRIVY_MIGRATION: process.env.ALLOW_PRIVY_MIGRATION === "true",

  /** When true, Privy wallet creation is fully disabled (Phase 3). */
  DISABLE_PRIVY_WALLETS: process.env.DISABLE_PRIVY_WALLETS === "true",
} as const;
