# Changelog

All notable engineering changes to this repository are recorded here. For **product-facing** release notes on the docs site, see `packages/content/changelog.mdx`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **`ANTHROPIC_COT_BUDGET`** — Optional deploy-wide Anthropic extended-thinking token budget, mapped to `providerOptions.anthropic.thinking` for eligible Claude models. **Why:** Enable chain-of-thought style reasoning through the gateway under explicit operator control, without per-request untrusted budgets.
- **`packages/lib/providers/cloud-provider-options.ts`** — Shared type for merged `providerOptions` aligned with AI SDK JSON expectations. **Why:** Type-safe merges across routes without `any`.
- **`mockMiladyPricingMinimumDepositForRouteTests`** — Test helper in `packages/tests/helpers/mock-milady-pricing-for-route-tests.ts`. **Why:** Route tests that only need a custom `MINIMUM_DEPOSIT` must not replace the entire `MILADY_PRICING` object; doing so broke Milady billing cron tests in full `bun run test:unit` runs.

### Changed

- **Milady billing cron unit tests** — Renamed to `z-milady-billing-route.test.ts` and wired in `package.json` bulk/special scripts; `registerMiladyBillingMocks()` uses queue-backed inline `dbRead`/`dbWrite` factories re-applied in `beforeEach`. **Why:** Partial pricing mocks and global `mock.module("@/db/client")` contention caused order-dependent failures; stable queues + full pricing constants fix that class of bug.

### Documentation

- **`docs/unit-testing-milady-mocks.md`** — WHY for Milady test layout and `mock.module` pitfalls.
- **`docs/anthropic-cot-budget.md`** — WHY for env-based thinking and merge helpers.
- **`docs/ROADMAP.md`** — Updated “Done” items for the above.
