# Roadmap

Planned and possible changes, with WHYs where they affect design.

## AI models and gateway

- **Model list as single source of truth**: Keep `lib/fragments/models.ts` and `lib/eliza/config.ts` (ALLOWED_CHAT_MODELS) in sync with [Vercel AI Gateway models](https://vercel.com/ai-gateway/models). When the gateway adds or deprecates models, we update the curated list and allowlist so the UI and API stay valid.
- **Deprecation process**: If the gateway retires a model we currently list, we will (1) document the deprecation and date, (2) keep the ID in the list until the gateway stops accepting it (to avoid breaking saved configs), (3) remove it only after it is no longer available. No silent removals of still-available models.
- **New providers**: Adding a new provider (e.g. another LLM vendor on the gateway) follows the same steps as in [docs/models.md](models.md): add to fragments with correct gateway ID, then add that ID to ALLOWED_CHAT_MODELS.

## Platform (possible future)

- **Dynamic model list from gateway**: Today the display list is code-defined. A future option is to fetch available models from the gateway and merge with our allowlist (show only allowed IDs, enrich with our tier/fast metadata where we have it). **Why consider**: Fewer code deploys when new models appear; **why not yet**: Gateway list shape and our UX (tiers, ordering) may differ; current approach gives full control and clarity.
- **Per-org or per-app model restrictions**: Allow limiting which models an org or app can use (e.g. cost or compliance). **Why**: Enterprise and reseller use cases; **blocker**: Product and billing design, not only engineering.

## How to use this doc

- Add items when we agree on a direction or a “we might do this later” idea.
- When something is done or abandoned, move it to the changelog or mark it cancelled with a short reason.
- Prefer linking to detailed WHYs in feature docs (e.g. [models.md](models.md)) instead of duplicating long rationale here.
