# Project Configuration

<!-- PRR_LESSONS_START -->
## PRR Lessons Learned

> Auto-synced from `.prr/lessons.md` - edit there for full history.

### Global

- codex with gpt-5.2-codex made no changes: Issue 1 already handled with 401 responses on auth errors in `app/api/v1/voice/tts/route.ts` and `app/api/v1/voice/stt/route.ts`; Issue 2 already extracted to `isAuthenticationError` in `app/api/v1/billing/settings/route.ts`; Issue 3 docs already match `limit`/`hours` and `{ transactions, total, period }` in `content/api/credits.mdx`; Issue 4 already scopes API key support and lists session-only routes in `README.md`; Issue 5 already clarifies `/api/v1/voice/*` API key support and `/api/elevenlabs/*` session-only in `content/api/voice.mdx`; Issue 6 response uses `transcript`/`duration_ms` in `content/api/voice.mdx`; Issue 7 examples already use UUIDs in `content/api/voice.mdx`.
- Fix for README.md:null - When a comment requests enumeration or specific examples, adding a qualifier word alone won't suffice—must list actual routes or narrow scope significantly.
- Fix for app/api/v1/billing/settings/route.ts:null - Extract the duplicated `isAuthenticationError()` check directly into both call sites instead of creating a wrapper function—reuse the existing helper, don't add layers.
- Fix for README.md:null - When adding qualifiers like "excluding X listed below," you must actually provide the list or remove the qualifier entirely.
- Fix for content/api/voice.mdx:null rejected: The change only adds clarification about response format but completely ignores the main review comment about misleading API key authentication claims in the table
- Fix for content/api/voice.mdx:null rejected: The diff shown is identical to the first fix and does not update any voice ID examples from `voice_xyz789` to UUID format as requested
- Fix for content/api/voice.mdx:null rejected: The fix replaces example UUIDs and adds a response description, but completely ignores the main review comment about clarifying that API key support is only available on `/api/v1/voice/*` endpoints and that `/api/elevenlabs/*` routes remain session-based legacy routes. The misleading table comparison is not addressed.

### By File

**content/api/voice.mdx**
- Fix for content/api/voice.mdx:28 rejected: The README change softens the claim about "all" endpoints supporting API keys but doesn't explicitly list which routes still require session-based auth only, leaving some ambiguity about coverage

**app/api/my-agents/characters/[id]/stats/route.ts**
- Fix for app/api/my-agents/characters/[id]/stats/route.ts:15 rejected: The fix adds both old and new field names as placeholders, but this creates API inconsistency and doesn't fully address the core issue. The comment acknowledges these are placeholders, but returning duplicate field names (viewCount/views, interactionCount/interactions, etc.) will confuse API consumers. A better solution would be to either: (1) commit to one field naming convention and update docs/clients accordingly, or (2) clearly document this as a beta/stub endpoint with deprecation timeline for old fields.

**content/api/credits.mdx**
- Fix for content/api/credits.mdx:314 - When updating API documentation, must also update the example response block to match the actual API output format, not just the parameter descriptions.

<!-- PRR_LESSONS_END -->
