import { mock } from "bun:test";

import { MILADY_PRICING as realMiladyPricing } from "@/lib/constants/milady-pricing";

/**
 * Registers `mock.module("@/lib/constants/milady-pricing", …)` for tests that only need a different
 * {@link realMiladyPricing.MINIMUM_DEPOSIT}.
 *
 * **Why not** `MILADY_PRICING: { MINIMUM_DEPOSIT: n }` alone? `mock.module` replaces the whole module.
 * Any later importer (notably `app/api/cron/milady-billing/route.ts`) would lose `RUNNING_HOURLY_RATE`,
 * `LOW_CREDIT_WARNING`, `GRACE_PERIOD_HOURS`, etc., so full `bun run test:unit` can fail while a
 * single-file run passes. Spreading `realMiladyPricing` keeps one source of truth.
 *
 * @see docs/unit-testing-milady-mocks.md
 */
export function mockMiladyPricingMinimumDepositForRouteTests(minimumDeposit = 5): void {
  mock.module("@/lib/constants/milady-pricing", () => ({
    MILADY_PRICING: {
      ...realMiladyPricing,
      MINIMUM_DEPOSIT: minimumDeposit,
    },
  }));
}
