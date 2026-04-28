# Unit testing Milady routes and `mock.module` pitfalls

This document explains **why** several Milady-related unit tests are structured the way they are, and how to avoid regressions that only show up when the **full** unit suite runs (not when a single file runs in isolation).

## Why partial `MILADY_PRICING` mocks broke the billing cron tests

`@/lib/constants/milady-pricing` exports a single object, `MILADY_PRICING`, with:

- Hourly rates (`RUNNING_HOURLY_RATE`, `IDLE_HOURLY_RATE`)
- Thresholds (`MINIMUM_DEPOSIT`, `LOW_CREDIT_WARNING`)
- Operational constants (`GRACE_PERIOD_HOURS`)
- Derived getters for display

Some route tests only care about **`MINIMUM_DEPOSIT`** (e.g. provisioning or create-agent flows). It is tempting to write:

```ts
mock.module("@/lib/constants/milady-pricing", () => ({
  MILADY_PRICING: { MINIMUM_DEPOSIT: 5 },
}));
```

**Why this fails:** In Bun, `mock.module` replaces the **entire** module for the process. Any **later** importer—including `app/api/cron/milady-billing/route.ts`—sees **only** `{ MINIMUM_DEPOSIT }`. Fields such as `RUNNING_HOURLY_RATE` and `LOW_CREDIT_WARNING` become `undefined`. The cron handler still returns HTTP 200 for many paths, but billing math and warning thresholds are wrong, so assertions on `sandboxesBilled`, `warningsSent`, etc. fail **after** another test file has loaded.

**Why the failure is order-dependent:** If you run only `z-milady-billing-route.test.ts`, no other file has replaced `milady-pricing` with a partial mock, so tests pass. Running `packages/tests/unit` loads many files; whichever partial mock is registered last “wins” until something else overrides it—so symptoms depend on discovery order.

**What we do instead:** Use `mockMiladyPricingMinimumDepositForRouteTests()` from `packages/tests/helpers/mock-milady-pricing-for-route-tests.ts`, which spreads the **real** `MILADY_PRICING` and overrides only `MINIMUM_DEPOSIT`. **Why:** One source of truth for numeric constants; tests stay focused on deposit behavior without stripping fields other modules need.

## Why the Milady billing cron test file is named `z-milady-billing-route.test.ts`

Repo scripts `test:repo-unit:bulk` and `test:repo-unit:special` split the unit corpus: bulk runs almost all files, special runs a short list. The billing cron test is intentionally listed in **special** and excluded from bulk so it can run in a predictable batch with other heavy or order-sensitive tests.

The **`z-` prefix** is only a mnemonic for “keep this file easy to spot / last in sorted lists” when curating `find` exclusions. **Why:** The important part is `package.json` explicitly listing the path, not the letter `z` itself.

## Why `registerMiladyBillingMocks()` uses inline functions (not `mock()` for `dbRead` / `dbWrite`)

Several API route tests call `mock.module("@/db/client", …)` with their own `dbRead` / `dbWrite` shapes. Re-registering mocks in `beforeEach` is meant to restore the cron test’s queues.

**Why `mock()` was fragile:** Bun’s mock instances can end up **decoupled** from what newly imported route modules call after another file’s `mock.module` runs, depending on order and cache behavior. Supplying **plain functions** that close over shared `readResultsQueue` / `txUpdateResultsQueue` arrays keeps each `mock.module("@/db/client", …)` registration wired to the same queue-backed behavior.

## Why `registerMiladyBillingMocks()` runs in `beforeEach`

**Why:** Any prior test file may have replaced `@/db/client`, `@/db/repositories`, or logger modules. Running registration before each test maximizes the chance the cron route under test sees **this** file’s doubles, without requiring every other test file to restore global mocks in `afterEach`.

## Related files

| File | Role |
|------|------|
| `packages/tests/helpers/mock-milady-pricing-for-route-tests.ts` | Safe `MILADY_PRICING` mock helper |
| `packages/tests/unit/z-milady-billing-route.test.ts` | Milady billing cron handler tests |
| `app/api/cron/milady-billing/route.ts` | Production cron (imports full `MILADY_PRICING`) |
| `packages/lib/constants/milady-pricing.ts` | Canonical pricing object |

## Commands

```bash
bun run test:unit              # Full unit tree (includes Milady billing test)
bun run test                   # Bulk + special scripts from package.json
```
