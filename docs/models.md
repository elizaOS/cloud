# AI Models (Chat / Text)

Curated list of LLM models for the chat interface and API. Model IDs are aligned with [Vercel AI Gateway](https://vercel.com/ai-gateway/models); the platform routes requests through the gateway so a single API key and endpoint can target multiple providers.

## Why a curated model list?

- **Security and cost**: We allow only models we explicitly support. Letting arbitrary model IDs through would risk abuse, unknown costs, or gateway errors. The allowlist is the single place we control what users can select.
- **UX**: The chat UI and API docs show a stable, human-readable set of options (names, tiers, “fast” flags) instead of a raw gateway dump that changes often.
- **Backward compatibility**: Existing customers may have saved preferences or automation using older model IDs (e.g. `claude-3-5-sonnet-20241022`). We keep legacy models in the list as long as the gateway still supports them so those configs keep working.

## Why Vercel AI Gateway?

- **Single integration**: One key and base URL instead of managing OpenAI, Anthropic, Google, etc. separately. Billing and routing are centralized.
- **Stable IDs**: Gateway uses a consistent `provider/model-id` format (e.g. `anthropic/claude-opus-4.6`). We use these exact IDs so our list matches what the gateway accepts.
- **Docs as source of truth**: [Vercel AI Gateway models](https://vercel.com/ai-gateway/models) is the reference for available models and naming. When adding or updating entries, check that page so IDs and availability stay in sync.

## Where the list lives

| Location | Purpose |
|--------|---------|
| `lib/fragments/models.ts` | **Display list**: Full model records (id, name, provider, tier, multiModal, fast) for the chat UI and any dropdowns. This is the canonical list of “what we show.” |
| `lib/eliza/config.ts` → `ALLOWED_CHAT_MODELS` | **Allowlist**: Plain list of model IDs. Used to validate that a chosen model is permitted (e.g. before starting a chat or proxy request). Every ID here should exist in `lib/fragments/models.ts` and on the gateway. |
| `GET /api/v1/models` | **API**: Returns the list of models (from the provider/gateway). Response is cached; the curated display list is still driven by `lib/fragments/models.ts` for the dashboard. |

**Why two lists (fragments + config)?** Fragments hold rich metadata for UI (name, tier, provider); the allowlist is a simple tuple for fast “is this ID allowed?” checks. Keeping them in sync (same IDs, same source of truth: gateway) avoids drift.

## Design decisions (WHYs)

| Decision | Why |
|----------|-----|
| **IDs match Vercel AI Gateway exactly** | Gateway is the actual backend. Wrong or outdated IDs cause failed requests. We copy IDs from [vercel.com/ai-gateway/models](https://vercel.com/ai-gateway/models). |
| **Keep legacy models when still on gateway** | Users and integrations store model IDs in DB, configs, or API calls. Removing a model that the gateway still supports would break them without benefit. |
| **Dot version for Anthropic (e.g. 4.6 not 4-6)** | Gateway exposes Anthropic models with dots (e.g. `claude-opus-4.6`). We use that format so requests succeed. |
| **Tiers and “fast” in fragments only** | Tier (e.g. $ / $$ / $$$) and `fast` are for UI only (sorting, badges). They are not sent to the gateway; only the `id` is. |
| **No removal without deprecation path** | If we must drop a model (e.g. gateway deprecates it), we document it and give advance notice before removing from the list. |

## Adding or changing models

1. **Check gateway**: Confirm the model exists and note the exact ID on [Vercel AI Gateway models](https://vercel.com/ai-gateway/models).
2. **Update `lib/fragments/models.ts`**: Add (or edit) the entry with `id`, `name`, `provider`, `providerId`, and optionally `tier`, `multiModal`, `fast`.
3. **Update `lib/eliza/config.ts`**: Add the same `id` to `ALLOWED_CHAT_MODELS` so the model is allowed in chat and API.
4. **Optional**: If the model is used as a default elsewhere (e.g. app builder, eliza-app config, model tiers), update those to the new ID only if you intend to change the default; otherwise leave defaults as-is for stability.

Do not remove an existing model ID from either list unless the gateway has deprecated it and you have a deprecation/communication plan.

## Roadmap

See [docs/roadmap.md](roadmap.md) for planned changes to the model list and gateway usage.
