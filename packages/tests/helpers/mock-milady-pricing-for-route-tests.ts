import { mock } from "bun:test";

import { MILADY_PRICING as realMiladyPricing } from "@/lib/constants/milady-pricing";

/** Partial `MILADY_PRICING` mocks break other Milady modules in the same Bun process (e.g. billing cron). */
export function mockMiladyPricingMinimumDepositForRouteTests(minimumDeposit = 5): void {
  mock.module("@/lib/constants/milady-pricing", () => ({
    MILADY_PRICING: {
      ...realMiladyPricing,
      MINIMUM_DEPOSIT: minimumDeposit,
    },
  }));
}
