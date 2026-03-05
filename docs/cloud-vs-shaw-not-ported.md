# What's in cloud but not (fully) in cloud-shaw

High-level list of **cloud** features or areas that are **not ported** or differ in cloud-shaw. Use this when deciding what to port next. For referral/affiliate/signup-code details see [affiliate-referral-comparison.md](./affiliate-referral-comparison.md) and [signup-codes-port-checklist.md](./signup-codes-port-checklist.md).

---

## Ported (done)

- **Signup codes**: Config-driven one-time bonus per org; redeem API; **Discord** and **Telegram** signup — optional `signup_code` in auth body, applied in `createUserWithOrganization` for new users only.

---

## Not ported / different

- **Referral model**: Cloud uses commission tiers (`pct_5` / `pct_50`) and `processReferralCommission` in Stripe. Shaw uses revenue splits (50/40/10) and multi-tier; no commission tiers. Intentional difference.
- **Affiliate (revenue)**: Cloud has no separate affiliate revenue system (only character/miniapp "affiliate"). Shaw has full affiliate system (codes, markup, top-up/MCP). Shaw-only.
- **App signup tracking / referral_bonus_credits**: Cloud has app-level signup tracking and `referral_bonus_credits`; if cloud added more here (e.g. app-signup-tracking with referralCode/affiliateCode), that flow isn't ported.
- **Config / env**: Cloud has various config and env updates (e.g. `lib/eliza/config.ts`, `lib/services/eliza-app/config.ts`, model tiers, fragments). Port only as needed.
- **Other API surface**: See [API surface: cloud vs shaw](#api-surface-cloud-vs-shaw) below for what differs and why.
- **SIWE (Sign-In With Ethereum)**: Cloud has full EIP-4361 flow (GET nonce, POST verify → create/find user, return API key). Shaw has **no** SIWE routes; wallet auth is header-based (X-Wallet-Address + timestamp + signature) for **existing** users only, and wallet signup only happens implicitly in top-up. See [siwe-cloud-vs-shaw.md](./siwe-cloud-vs-shaw.md) for full comparison and port notes.
- **Telegram / other eliza-app signup**: Signup code is wired for **Discord** and **Telegram** in shaw (optional `signup_code` in auth body; applied in `createUserWithOrganization` for new users only). Other paths (e.g. phone-only, email) could be wired the same way if needed.

---

## API surface: cloud vs shaw

This section clarifies **what actually differs** between the two repos' API routes and **why**. (Many areas exist in both; the earlier one-line summary was inaccurate.)

### In both repos (overlap)

These exist in **both** cloud and cloud-shaw with the same or similar purpose:

- **Auth / eliza-app**: `eliza-app/auth/discord`, `eliza-app/auth/telegram`, `eliza-app/user/me`, `eliza-app/user/phone`, `signup-code/redeem`
- **Billing / credits**: `credits/balance`, `credits/transactions` (top-level); `v1/credits/*` and `v1/app-credits/*` (shaw has both top-level and v1; cloud has top-level + app-credits)
- **Stripe**: `stripe/webhook` in both
- **Dashboard / account**: `stats/account` (generations + API call stats), `quotas/usage`, `my-agents/*` (saved, characters, clone, share, stats, etc.), `invoices/list`, `invoices/[id]`
- **Internal / ops**: `internal/discord/gateway/*` (status, heartbeat, shutdown, failover, assignments), `internal/auth/*`, `cron/compute-metrics`, `cron/deployment-monitor`
- **Apps / builders**: `v1/apps/*`, `v1/app-builder/*` (sessions, terminal, rollback, snapshots, prompts, etc.), `v1/agents/[agentId]/n8n/*`
- **Integrations**: `v1/advertising/*` (campaigns, accounts, analytics), `eliza/rooms/*`, `a2a`, `agents/[id]/a2a`, `mcp/*` (route, stream, info, registry, list, proxy), **`mcps/*`** (both repos have the same set: linear, github, zoom, weather, twitter, time, salesforce, notion, microsoft, linkedin, jira, google, dropbox, crypto, asana, airtable)
- **Voice / elevenlabs**: Both have elevenlabs (cloud: `elevenlabs/voices`; shaw: more sub-routes — verify, jobs, user, clone, tts, stt)
- **Redemptions**: Both have `v1/redemptions` and `v1/redemptions/quote`; shaw adds `v1/redemptions/status` and `v1/redemptions/balance`

So **stats/account**, **quotas/usage**, **my-agents/\***, **invoices/\***, **internal/discord/gateway/\***, **cron/compute-metrics**, and **v1/advertising/\*** are **not** cloud-only — they are in shaw too.

### Shaw-only (why: product focus)

Routes that exist in **cloud-shaw** but **not** in cloud, and the reason:

| Area | Purpose | Why shaw has it |
|------|---------|-----------------|
| `v1/affiliates`, `v1/affiliates/link` | Affiliate codes, markup, link user to code | Shaw product has a **revenue-share affiliate system**; cloud does not (see affiliate-referral-comparison). |
| `v1/topup/10`, `v1/topup/50`, `v1/topup/100` | Fixed-amount credit top-up (e.g. wallet/x402) | Shaw supports **wallet-based top-up** at fixed amounts; cloud has `auto-top-up/trigger` but not these fixed topup routes. |
| `v1/user/wallets/provision`, `v1/user/wallets/rpc` | Server-side wallet provisioning (e.g. Privy) | Shaw supports **provisioned wallets** for orgs/users; cloud does not expose this API. |
| `v1/track/pageview` | Page-view tracking for embedded apps | Shaw has **app analytics** for embeddable apps (any domain); security via API key / app ownership. |
| `v1/redemptions/status`, `v1/redemptions/balance` | Redemption status and balance | Shaw's **crypto/token redemption** product; quote exists in both, status/balance are shaw additions. |
| `v1/credits/checkout`, `v1/credits/verify`, `v1/credits/summary` | Credits checkout and summary (v1) | Shaw uses **v1-prefixed credits API** for balance + checkout + verify + summary; cloud uses top-level `credits/balance` and `credits/transactions` only. |
| `v1/models`, `v1/models/status`, `v1/models/[...model]` | Model listing and status | Shaw exposes **model catalog and status** under v1. |
| `v1/dashboard`, `v1/character-assistant` | Dashboard and character assistant | Shaw-specific **product surfaces**. |
| `v1/generate-video`, `v1/generate-prompts`, `v1/gallery` | Video generation, prompts, gallery | Shaw has **extra generation/gallery** endpoints beyond `v1/generate-image`. |
| `v1/telegram/chats` | Telegram chats | Shaw-specific **Telegram** support. |
| `v1/knowledge/submit`, `upload-file`, `check`, `pre-upload`, `[id]` | Knowledge base management | Shaw has **richer knowledge API** (submit, upload, check, pre-upload, by id). |
| **Cron** | Many cron routes | Shaw has **more cron jobs**: e.g. `process-redemptions`, `sample-eliza-price`, `release-pending-earnings`, `social-automation`, `container-billing`, `cleanup-*`, `agent-budgets`, `auto-top-up`, plus `compute-metrics` and `deployment-monitor`. Cloud has fewer (e.g. `compute-metrics`, `deployment-monitor`). So shaw has **more ops/automation**. |

**Why this split:** Shaw is the product with **crypto redemptions**, **affiliate revenue**, **wallet-based top-up**, **app analytics**, and **heavier ops automation** (crons). Cloud is the other deployment with a different product mix; MCP set is the same in both.

### Cloud-only (or cloud has more)

**None.** Both repos have the same **`mcps/*`** transports (linear, github, zoom, weather, twitter, time, salesforce, notion, microsoft, linkedin, jira, google, dropbox, crypto, asana, airtable). No need to port MCPs from cloud to shaw — they are already present.

The two repos are largely aligned for core auth, billing, apps, app-builder, internal gateway, cron, and MCP transports; the main difference is **shaw-only** features (affiliates, top-up, redemptions, wallets, track, models, dashboard, extra crons).

### Summary

- **Don't** treat “stats/account”, “quotas/usage”, “my-agents”, “invoices”, “internal/discord/gateway”, “cron/compute-metrics”, “v1/advertising” as cloud-only — they exist in shaw.
- **Do** treat as **shaw-only**: affiliates, v1 topup, user/wallets, track/pageview, redemptions/status|balance, v1 credits checkout/verify/summary, models, dashboard, character-assistant, generate-video/prompts/gallery, extra knowledge routes, and the larger set of cron jobs.
- **MCPs**: **Both** have the same `mcps/*` set; no port needed.

No single “port list” — the two codebases are **separate products with overlapping ideas**: same platform concepts (apps, credits, agents, eliza-app), different feature emphasis (shaw adds: crypto, affiliates, wallets, analytics, extra crons; MCP set is the same).

---

## Optional next steps

- Wire **signup_code** into **phone-only** or **email** eliza-app signup if you want parity (same pattern: optional param on findOrCreate, pass to `createUserWithOrganization`).
- Re-sync **config/docs** from cloud only where relevant (e.g. model tiers, roadmap).
- Keep this doc updated when porting more cloud-only areas.
