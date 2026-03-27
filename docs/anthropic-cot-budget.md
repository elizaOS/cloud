# Anthropic extended thinking (`ANTHROPIC_COT_BUDGET`)

Deploy-wide optional control for **Anthropic “extended thinking”** (chain-of-thought style reasoning) when using Claude models through the AI SDK / gateway.

## What it does

When set to a **positive integer**, eligible Anthropic model calls receive `providerOptions.anthropic.thinking` with `{ type: "enabled", budgetTokens: <n> }`, consistent with `@ai-sdk/anthropic` and gateway expectations.

When **unset**, **empty**, or **0**, thinking is **not** injected—behavior matches a normal request with no thinking budget.

## Why env-based (not per-request)

**Why a single env var:**

- **Operational simplicity:** Enable or disable thinking for the whole deployment without changing every route or client.
- **Cost predictability:** Thinking consumes extra tokens; a deploy-level switch avoids accidental enablement from arbitrary client payloads.
- **Safety:** Per-request user-controlled thinking budgets would complicate billing, abuse review, and support. Env keeps the contract “platform policy,” not “untrusted input.”

**Why `ANTHROPIC_COT_BUDGET` is validated strictly (non-empty must be digits, fail-fast on garbage):** Mis-set env vars should **fail at startup / validation** rather than silently producing `NaN` or partial provider options that the gateway rejects at runtime.

## Why merge helpers exist (`mergeProviderOptions`, `mergeAnthropicCotProviderOptions`, …)

Different call sites already set other `providerOptions` keys:

- **Google image** flows need `google.responseModalities`.
- **Forwarded chat** bodies may set `gateway.order` (e.g. prefer Groq).

**Why not overwrite:** Replacing the entire `providerOptions` object would drop unrelated keys. **Deep-merge helpers** (see `packages/lib/providers/anthropic-thinking.ts`) combine nested `gateway`, `anthropic`, and `google` fragments so thinking can be added **without** clobbering existing options.

## Why `cloud-provider-options.ts`

`CloudMergedProviderOptions` is typed as `Record<string, JSONObject>` to align with AI SDK shared provider option shapes. **Why:** Keeps merged objects assignable where the SDK expects JSON-serializable nested records, and avoids `any` at merge boundaries.

## Where it is applied

Thinking merges are threaded through server routes and services that forward to the gateway (e.g. chat, completions, messages, responses, image generation paths) **only when** the resolved model provider is Anthropic—see `getProviderFromModel` checks in `anthropicThinkingProviderOptions`.

## Configuration

| Variable | Required | Meaning |
|----------|----------|---------|
| `ANTHROPIC_COT_BUDGET` | No | Positive integer string → enable with that token budget; unset / `0` → off |

Documented in `.env.example` and validated in `packages/lib/config/env-validator.ts`.

## Related code

- `packages/lib/providers/anthropic-thinking.ts` — parse env, build fragments, merge helpers
- `packages/lib/providers/cloud-provider-options.ts` — shared merged options type
- `packages/tests/unit/anthropic-thinking.test.ts` — unit tests for parsing and merges
