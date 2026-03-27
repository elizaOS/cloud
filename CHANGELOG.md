# Changelog

All notable engineering changes to this repository are recorded here. For **product-facing** release notes on the docs site, see `packages/content/changelog.mdx`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Per-agent Anthropic extended thinking** — `user_characters.settings.anthropicThinkingBudgetTokens` (integer ≥ 0) controls thinking for **MCP** and **A2A** agent chat when the model is Anthropic. **`ANTHROPIC_COT_BUDGET_MAX`** optionally caps any effective budget (character or env default). **Why:** Agent owners set policy in stored character data; request bodies must not carry budgets (untrusted MCP/A2A callers). Env still supplies defaults where no character field exists and caps worst-case cost.
- **`ANTHROPIC_COT_BUDGET`** (existing) — Clarified role as **default** when the character omits `anthropicThinkingBudgetTokens` (or value is invalid), plus baseline for routes without a resolved character. **Why:** One deploy-level knob for generic chat; per-agent overrides stay in JSON.
- **`parseThinkingBudgetFromCharacterSettings`**, **`resolveAnthropicThinkingBudgetTokens`**, **`parseAnthropicCotBudgetMaxFromEnv`**, **`ANTHROPIC_THINKING_BUDGET_CHARACTER_SETTINGS_KEY`** — See `packages/lib/providers/anthropic-thinking.ts`. **Why:** Single resolution path and a stable settings key for dashboards/APIs.
- **`packages/lib/providers/cloud-provider-options.ts`** — Shared type for merged `providerOptions`. **Why:** Type-safe merges without `any`.
- **`mockMiladyPricingMinimumDepositForRouteTests`** — Test helper in `packages/tests/helpers/mock-milady-pricing-for-route-tests.ts`. **Why:** Partial `MILADY_PRICING` mocks broke Milady billing cron under full `bun run test:unit`.

### Changed

- **`POST /api/agents/{id}/mcp`** (`chat` tool) and **`POST /api/agents/{id}/a2a`** (`chat`) pass character `settings` into `mergeAnthropicCotProviderOptions`. **Why:** Those routes always resolve a `user_characters` row; other v1 routes remain env-only until a character is available on the request path.
- **Milady billing cron unit tests** — `z-milady-billing-route.test.ts`, queue-backed DB mocks, `package.json` script paths. **Why:** `mock.module` ordering and partial pricing objects caused flaky full-suite failures.

### Documentation

- **`docs/anthropic-cot-budget.md`** — Per-agent settings, env default/max, operator checklist, MCP/A2A scope.
- **`docs/unit-testing-milady-mocks.md`** — Milady `mock.module` pitfalls.
- **`docs/ROADMAP.md`** — Done / near-term items.
