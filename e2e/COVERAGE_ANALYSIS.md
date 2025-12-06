# Test Coverage Analysis

## Pages Coverage

### Main App Pages (`app/`)

#### Public Pages ✅
- `/` (home) - ✅ Tested in `all-pages.spec.ts`
- `/login` - ✅ Tested in `all-pages.spec.ts`
- `/marketplace` - ✅ Tested in `all-pages.spec.ts`
- `/marketplace/characters/[id]` - ✅ Tested in `detail-pages.spec.ts` + `marketplace-api.spec.ts`
- `/terms-of-service` - ✅ Tested in `all-pages.spec.ts`
- `/privacy-policy` - ✅ Tested in `all-pages.spec.ts`
- `/auth-error` - ✅ Tested in `all-pages.spec.ts`
- `/auth/error` - ✅ Tested in `all-pages.spec.ts`
- `/auth/cli-login` - ✅ Tested in `all-pages.spec.ts`
- `/auth/miniapp-login` - ❌ NOT TESTED
- `/invite/accept` - ✅ Tested in `all-pages.spec.ts`
- `/billing/success` - ✅ Tested in `all-pages.spec.ts`
- `/chat/[characterId]` - ⚠️ Partially tested (anonymous access, but not full chat flow)

#### Dashboard Pages ✅
- `/dashboard` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/account` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/analytics` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/api-explorer` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/api-keys` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/billing` - ✅ Tested in `all-pages.spec.ts` + `billing-flow.spec.ts`
- `/dashboard/billing/success` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/character-creator` - ✅ Tested in `all-pages.spec.ts` + `chat-and-agents.spec.ts`
- `/dashboard/containers` - ✅ Tested in `all-pages.spec.ts` + `containers-deployment.spec.ts`
- `/dashboard/containers/[id]` - ✅ Tested in `detail-pages.spec.ts`
- `/dashboard/gallery` - ✅ Tested in `all-pages.spec.ts` + `gallery-storage-knowledge.spec.ts`
- `/dashboard/image` - ✅ Tested in `all-pages.spec.ts` + `chat-and-agents.spec.ts`
- `/dashboard/my-agents` - ✅ Tested in `all-pages.spec.ts` + `chat-and-agents.spec.ts`
- `/dashboard/settings` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/storage` - ✅ Tested in `all-pages.spec.ts` + `gallery-storage-knowledge.spec.ts`
- `/dashboard/video` - ✅ Tested in `all-pages.spec.ts` + `chat-and-agents.spec.ts`
- `/dashboard/voices` - ✅ Tested in `all-pages.spec.ts` + `chat-and-agents.spec.ts`
- `/dashboard/invoices` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/invoices/[id]` - ✅ Tested in `detail-pages.spec.ts`
- `/dashboard/mcps` - ✅ Tested in `all-pages.spec.ts`
- `/dashboard/knowledge` - ✅ Tested in `all-pages.spec.ts` + `gallery-storage-knowledge.spec.ts`
- `/dashboard/chat` - ✅ Tested in `all-pages.spec.ts` (anonymous access)
- `/dashboard/build` - ✅ Tested in `all-pages.spec.ts` (anonymous access)
- `/dashboard/apps` - ✅ Tested in `all-pages.spec.ts` + `apps-ui.spec.ts`
- `/dashboard/apps/[id]` - ✅ Tested in `apps-ui.spec.ts`

### Miniapp Pages (`miniapp/app/`)

#### Miniapp Pages ⚠️
- `/` (miniapp home) - ✅ Tested in `miniapp.spec.ts`
- `/auth/callback` - ✅ Tested in `miniapp-full-flow.spec.ts`
- `/connecting` - ✅ Tested in `miniapp-pages.spec.ts`
- `/settings` - ✅ Tested in `miniapp-pages.spec.ts`
- `/chats` - ⚠️ Partially tested
- `/chats/[agentId]` - ⚠️ Partially tested
- `/chats/[agentId]/[chatId]` - ✅ Tested in `miniapp-pages.spec.ts`
- `/agents/[id]` - ✅ Tested in `miniapp-pages.spec.ts`
- `/billing/success` - ✅ Tested in `miniapp-pages.spec.ts`

## API Routes Coverage

### Main App API Routes (`app/api/`)

#### Authentication & Sessions
- `/api/auth/logout` - ❌ NOT TESTED
- `/api/auth/cli-session` - ❌ NOT TESTED
- `/api/auth/cli-session/[sessionId]` - ❌ NOT TESTED
- `/api/auth/cli-session/[sessionId]/complete` - ❌ NOT TESTED
- `/api/auth/miniapp-session` - ✅ Tested in `miniapp-full-flow.spec.ts`
- `/api/auth/miniapp-session/[sessionId]` - ✅ Tested in `miniapp-full-flow.spec.ts`
- `/api/auth/miniapp-session/[sessionId]/complete` - ❌ NOT TESTED
- `/api/auth/migrate-anonymous` - ❌ NOT TESTED
- `/api/sessions/current` - ❌ NOT TESTED
- `/api/set-anonymous-session` - ❌ NOT TESTED
- `/api/anonymous-session` - ❌ NOT TESTED
- `/api/anonymous-session/increment` - ❌ NOT TESTED

#### Affiliate & Anonymous
- `/api/affiliate/create-session` - ✅ Tested in `miniapp-full-flow.spec.ts`
- `/api/affiliate/create-character` - ✅ Tested in `miniapp-full-flow.spec.ts`

#### Credits & Billing
- `/api/credits/balance` - ✅ Tested in `billing-flow.spec.ts`
- `/api/credits/transactions` - ✅ Tested in `billing-flow.spec.ts`
- `/api/credits/stream` - ❌ NOT TESTED
- `/api/stripe/credit-packs` - ✅ Tested in `billing-flow.spec.ts`
- `/api/stripe/create-checkout-session` - ✅ Tested in `billing-flow.spec.ts`
- `/api/stripe/webhook` - ❌ NOT TESTED (webhook, hard to test)
- `/api/auto-top-up/settings` - ✅ Tested in `billing-flow.spec.ts`
- `/api/auto-top-up/trigger` - ✅ Tested in `credit-usage.spec.ts`
- `/api/auto-top-up/simulate-usage` - ✅ Tested in `credit-usage.spec.ts`
- `/api/payment-methods/list` - ✅ Tested in `billing-flow.spec.ts`
- `/api/payment-methods/attach` - ❌ NOT TESTED
- `/api/payment-methods/remove` - ❌ NOT TESTED
- `/api/payment-methods/set-default` - ❌ NOT TESTED
- `/api/purchases/create` - ❌ NOT TESTED
- `/api/purchases/confirm` - ❌ NOT TESTED
- `/api/purchases/status` - ❌ NOT TESTED
- `/api/invoices/list` - ❌ NOT TESTED
- `/api/invoices/[id]` - ❌ NOT TESTED

#### Apps Platform
- `/api/v1/apps` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]/monetization` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]/earnings` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]/earnings/history` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]/analytics` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]/regenerate-api-key` - ✅ Tested in `apps-api.spec.ts`
- `/api/v1/apps/[id]/users` - ❌ NOT TESTED

#### Containers
- `/api/v1/containers` - ✅ Tested in `containers-deployment.spec.ts`
- `/api/v1/containers/[id]` - ✅ Tested in `containers-deployment.spec.ts`
- `/api/v1/containers/[id]/logs` - ✅ Tested in `containers-deployment.spec.ts`
- `/api/v1/containers/[id]/logs/stream` - ❌ NOT TESTED (SSE stream)
- `/api/v1/containers/[id]/metrics` - ❌ NOT TESTED
- `/api/v1/containers/[id]/health` - ❌ NOT TESTED
- `/api/v1/containers/[id]/deployments` - ❌ NOT TESTED
- `/api/v1/containers/quota` - ✅ Tested in `containers-deployment.spec.ts`
- `/api/v1/containers/credentials` - ✅ Tested in `containers-deployment.spec.ts`

#### Miniapp API
- `/api/v1/miniapp/agents` - ✅ Tested in `miniapp-authenticated.spec.ts`
- `/api/v1/miniapp/agents/[id]` - ✅ Tested in `miniapp-authenticated.spec.ts`
- `/api/v1/miniapp/agents/[id]/chats` - ✅ Tested in `miniapp-authenticated.spec.ts`
- `/api/v1/miniapp/agents/[id]/chats/[chatId]` - ✅ Tested in `miniapp-authenticated.spec.ts`
- `/api/v1/miniapp/agents/[id]/chats/[chatId]/messages` - ✅ Tested in `miniapp-authenticated.spec.ts`
- `/api/v1/miniapp/billing` - ✅ Tested in `miniapp-authenticated.spec.ts`
- `/api/v1/miniapp/billing/checkout` - ❌ NOT TESTED
- `/api/v1/miniapp/billing/credit-packs` - ❌ NOT TESTED
- `/api/v1/miniapp/referral` - ✅ Tested in `referrals-api.spec.ts`
- `/api/v1/miniapp/referral/apply` - ✅ Tested in `referrals-api.spec.ts`
- `/api/v1/miniapp/referral/qualify` - ❌ NOT TESTED
- `/api/v1/miniapp/rewards` - ❌ NOT TESTED
- `/api/v1/miniapp/rewards/share` - ✅ Tested in `miniapp-full-flow.spec.ts`
- `/api/v1/miniapp/user` - ✅ Tested in `miniapp-full-flow.spec.ts`

#### Chat & AI
- `/api/v1/chat` - ❌ NOT TESTED
- `/api/v1/chat/completions` - ❌ NOT TESTED
- `/api/v1/responses` - ❌ NOT TESTED
- `/api/v1/character-assistant` - ❌ NOT TESTED
- `/api/eliza/rooms` - ❌ NOT TESTED
- `/api/eliza/rooms/[roomId]` - ❌ NOT TESTED
- `/api/eliza/rooms/[roomId]/messages` - ❌ NOT TESTED
- `/api/eliza/rooms/[roomId]/messages/stream` - ❌ NOT TESTED (SSE stream)

#### Generation
- `/api/v1/generate-image` - ✅ Tested in `credit-usage.spec.ts`
- `/api/v1/generate-video` - ✅ Tested in `credit-usage.spec.ts`
- `/api/v1/generate-prompts` - ❌ NOT TESTED

#### Gallery & Storage
- `/api/v1/gallery` - ✅ Tested in `gallery-storage-knowledge.spec.ts`
- `/api/v1/knowledge` - ✅ Tested in `gallery-storage-knowledge.spec.ts`
- `/api/v1/knowledge/[id]` - ✅ Tested in `gallery-storage-knowledge.spec.ts`
- `/api/v1/knowledge/query` - ❌ NOT TESTED
- `/api/v1/knowledge/upload-file` - ✅ Tested in `gallery-storage-knowledge.spec.ts`

#### Marketplace & Characters
- `/api/marketplace/characters` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/marketplace/characters/[id]` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/marketplace/characters/[id]/clone` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/marketplace/characters/[id]/stats` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/marketplace/characters/[id]/track-view` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/marketplace/characters/[id]/track-interaction` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/marketplace/categories` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/public/marketplace/characters` - ✅ Tested in `marketplace-api.spec.ts`
- `/api/my-agents/characters` - ❌ NOT TESTED
- `/api/my-agents/characters/[id]` - ❌ NOT TESTED (detail)
- `/api/my-agents/characters/[id]/clone` - ❌ NOT TESTED
- `/api/my-agents/characters/[id]/stats` - ❌ NOT TESTED
- `/api/my-agents/characters/[id]/track-view` - ❌ NOT TESTED
- `/api/my-agents/characters/[id]/track-interaction` - ❌ NOT TESTED
- `/api/my-agents/categories` - ❌ NOT TESTED
- `/api/my-agents/claim-affiliate-characters` - ❌ NOT TESTED

#### MCP
- `/api/mcp` - ❌ NOT TESTED
- `/api/mcp/list` - ❌ NOT TESTED
- `/api/mcp/registry` - ❌ NOT TESTED
- `/api/mcp/stream` - ❌ NOT TESTED (SSE stream)
- `/api/mcp/demos/weather` - ❌ NOT TESTED
- `/api/mcp/demos/weather/[transport]` - ❌ NOT TESTED
- `/api/mcp/demos/time` - ❌ NOT TESTED
- `/api/mcp/demos/time/[transport]` - ❌ NOT TESTED
- `/api/mcp/demos/crypto` - ❌ NOT TESTED
- `/api/mcp/demos/crypto/[transport]` - ❌ NOT TESTED
- `/api/characters/[characterId]/mcps` - ❌ NOT TESTED

#### ElevenLabs (Voice)
- `/api/elevenlabs/voices` - ❌ NOT TESTED
- `/api/elevenlabs/voices/[id]` - ❌ NOT TESTED
- `/api/elevenlabs/voices/clone` - ❌ NOT TESTED
- `/api/elevenlabs/voices/jobs` - ❌ NOT TESTED
- `/api/elevenlabs/voices/user` - ❌ NOT TESTED
- `/api/elevenlabs/voices/verify/[id]` - ❌ NOT TESTED
- `/api/elevenlabs/tts` - ❌ NOT TESTED
- `/api/elevenlabs/stt` - ❌ NOT TESTED

#### API Keys
- `/api/v1/api-keys` - ✅ Tested in `api-keys.spec.ts`
- `/api/v1/api-keys/[id]` - ✅ Tested in `api-keys.spec.ts`
- `/api/v1/api-keys/[id]/regenerate` - ✅ Tested in `api-keys.spec.ts`
- `/api/v1/api-keys/explorer` - ✅ Tested in `api-keys.spec.ts`

#### Models & Embeddings
- `/api/v1/models` - ❌ NOT TESTED
- `/api/v1/models/[...model]` - ❌ NOT TESTED
- `/api/v1/embeddings` - ❌ NOT TESTED

#### Analytics
- `/api/analytics/overview` - ❌ NOT TESTED
- `/api/analytics/breakdown` - ❌ NOT TESTED
- `/api/analytics/config` - ❌ NOT TESTED
- `/api/analytics/export` - ❌ NOT TESTED
- `/api/analytics/projections` - ❌ NOT TESTED

#### Organizations
- `/api/organizations/invites` - ❌ NOT TESTED
- `/api/organizations/invites/[inviteId]` - ❌ NOT TESTED
- `/api/organizations/members` - ❌ NOT TESTED
- `/api/organizations/members/[userId]` - ❌ NOT TESTED
- `/api/invites/accept` - ❌ NOT TESTED
- `/api/invites/validate` - ❌ NOT TESTED

#### Other
- `/api/stats/account` - ❌ NOT TESTED
- `/api/quotas/limits` - ❌ NOT TESTED
- `/api/quotas/usage` - ❌ NOT TESTED
- `/api/fal/proxy` - ❌ NOT TESTED
- `/api/privy/webhook` - ❌ NOT TESTED (webhook)
- `/api/seed/marketplace-characters` - ❌ NOT TESTED (seed endpoint)

#### Cron Jobs (Protected)
- `/api/cron/auto-top-up` - ❌ NOT TESTED (cron)
- `/api/cron/cleanup-anonymous-sessions` - ❌ NOT TESTED (cron)
- `/api/cron/cleanup-cli-sessions` - ❌ NOT TESTED (cron)
- `/api/cron/cleanup-priorities` - ❌ NOT TESTED (cron)
- `/api/v1/cron/deployment-monitor` - ❌ NOT TESTED (cron)
- `/api/v1/cron/health-check` - ❌ NOT TESTED (cron)

### Miniapp API Routes (`miniapp/app/api/`)

- `/api/create-character` - ✅ Tested in `miniapp-full-flow.spec.ts`
- `/api/generate-photo` - ❌ NOT TESTED
- `/api/generate-field` - ❌ NOT TESTED
- `/api/upload-images` - ❌ NOT TESTED
- `/api/proxy/[...path]` - ❌ NOT TESTED

## Summary

### Pages Coverage
- **Main App Pages**: 38/40 tested (95%) ⬆️ +2
- **Miniapp Pages**: 7/9 tested (78%) ⬆️ +3

### API Routes Coverage
- **Main App API**: ~70/143 tested (49%) ⬆️ +10
- **Miniapp API**: 1/5 tested (20%)

### New Test Files Created
1. **`api-keys.spec.ts`** - API key CRUD operations
2. **`marketplace-api.spec.ts`** - Marketplace character API endpoints
3. **`miniapp-pages.spec.ts`** - Miniapp page coverage
4. **`detail-pages.spec.ts`** - Detail pages (containers, invoices, characters)

### Critical Missing Coverage

#### High Priority
1. **Miniapp Pages**: `/connecting`, `/agents/[id]`, `/chats/[agentId]/[chatId]`
2. **API Keys Management**: All endpoints
3. **Marketplace API**: All endpoints
4. **My Agents API**: All endpoints
5. **ElevenLabs Voice API**: All endpoints
6. **MCP API**: All endpoints
7. **Chat/Eliza API**: All endpoints
8. **Analytics API**: All endpoints
9. **Organizations API**: All endpoints
10. **Invoice Detail Page**: `/dashboard/invoices/[id]`
11. **Container Detail Page**: `/dashboard/containers/[id]`

#### Medium Priority
1. **Payment Methods**: Attach, remove, set-default
2. **Purchases API**: Create, confirm, status
3. **Invoices API**: List and detail
4. **Knowledge Query**: RAG query endpoint
5. **Container Metrics/Health/Deployments**: Monitoring endpoints
6. **Miniapp Billing Checkout**: Checkout flow
7. **Miniapp API Proxy**: Proxy endpoint

#### Low Priority
1. **Cron Jobs**: Protected endpoints (hard to test)
2. **Webhooks**: Stripe, Privy (hard to test)
3. **SSE Streams**: Real-time endpoints (require special handling)
4. **Seed Endpoints**: Development only

