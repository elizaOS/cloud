# Product roadmap

High-level direction and rationale. Dates are targets, not commitments.

---

## Done

### Anthropic Messages API compatibility (Jan 2026)

- **What:** POST `/api/v1/messages` with Anthropic request/response format, tools, streaming SSE.
- **Why:** Claude Code and many integrations are built for Anthropic’s API. Supporting it lets users point those tools at elizaOS Cloud with a single API key and credit balance, instead of maintaining a separate Anthropic key and proxy.
- **Outcomes:** Claude Code works with `ANTHROPIC_BASE_URL` + Cloud API key; same billing and safety as chat completions.

---

## Near term

### Messages API: extended compatibility

- **Streaming tool_use blocks** — Emit `content_block_delta` for tool_use (partial JSON) so clients can stream tool calls. *Why: some SDKs expect incremental tool payloads.*
- **Ping interval** — Optional periodic `ping` events during long streams. *Why: proxies and clients often use pings to detect dead connections.*
- **anthropic-version** — Validate or document supported `anthropic-version` header values. *Why: avoid breakage when Anthropic adds new fields.*

### API surface

- **Consistent error envelope** — Align OpenAI-style endpoints with a shared `{ type, code, message }` shape where possible. *Why: one client-side error handler for all Cloud APIs.*
- **OpenAPI tags** — Tag Messages and Chat in OpenAPI so generators produce separate clients. *Why: clearer SDKs and docs.*

---

## Later

### Multi-provider parity

- **Google Gemini REST compatibility** — If demand exists, a Gemini-style route (e.g. `generateContent`) could reuse the same credits and gateway. *Why: same “one key, one bill” story for Gemini-native tools.*

### Platform

- **Usage alerts** — Notify when credits or usage cross thresholds. *Why: avoid surprise exhaustion for high-volume or app credits.*
- **Rate limit headers** — Return `X-RateLimit-*` on relevant endpoints. *Why: clients can back off or show “N requests left” without guessing.*

---

## Not planned (for now)

- **Direct Anthropic key passthrough** — We do not forward to Anthropic with the user’s key; we always use our gateway and bill Cloud credits. *Why: single billing, consistent safety and routing.*
