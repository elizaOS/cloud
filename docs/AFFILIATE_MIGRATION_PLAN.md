# Affiliate Logic Migration Plan: feat/affiliate-logic → dev

## Executive Summary

This document details the differences between the `feat/affiliate-logic` branch and the `dev` branch, and provides a comprehensive plan for incorporating the missing affiliate logic, anonymous chat, and dynamic routes into the `dev` branch.

**Total Changes:** 181 files, +26,660 lines, -6,242 lines

---

## Part 1: Critical Missing Features in `dev` Branch

### 1.1 Missing API Routes

| Route | Purpose | Status in dev |
|-------|---------|---------------|
| `app/api/affiliate/create-character/route.ts` | Affiliate character creation API | ❌ Missing |
| `app/api/set-anonymous-session/route.ts` | Set anonymous session cookie | ❌ Missing |
| `app/chat/[characterId]/page.tsx` | Dynamic chat route with theming | ❌ Missing |

### 1.2 Missing Components

| Component | Purpose | Status in dev |
|-----------|---------|---------------|
| `components/chat/chat-interface.tsx` | Unified chat interface with theme support | ❌ Missing |
| `components/chat/character-intro-page.tsx` | Intro page for first-time visitors | ❌ Missing |
| `components/chat/character-intro-page-wrapper.tsx` | Wrapper for intro page | ❌ Missing |
| `components/chat/email-capture-modal.tsx` | Email capture for anonymous users | ❌ Missing |
| `components/chat/buy-credits-modal.tsx` | Credits purchase modal | ❌ Missing |
| `components/chat/credits-exhausted-modal.tsx` | Out of credits notification | ❌ Missing |
| `components/chat/chat-input-crush.tsx` | Themed chat input | ❌ Missing |
| `components/chat/chat-message-crush.tsx` | Themed chat messages | ❌ Missing |

### 1.3 Missing Configuration

| File | Purpose | Status in dev |
|------|---------|---------------|
| `lib/config/affiliate-themes.ts` | Affiliate theming system | ❌ Missing |

### 1.4 Missing Services/Utilities

| File | Purpose | Status in dev |
|------|---------|---------------|
| `lib/services/session-migration.ts` | Migrate anonymous sessions to users | ❌ Missing |
| `lib/eliza/user-api-key.ts` | User API key management | ❌ Missing |
| `lib/eliza/plugin-assistant/providers/affiliate-context.ts` | Affiliate context provider | ❌ Missing |
| `lib/eliza/plugin-assistant/providers/recent-messages.ts` | Recent messages provider | ❌ Missing |

### 1.5 Missing Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create-affiliate-key.ts` | Create affiliate API keys |
| `scripts/test-affiliate-api.sh` | Test affiliate API endpoint |

---

## Part 2: Detailed File-by-File Differences

### 2.1 API Routes

#### `app/api/affiliate/create-character/route.ts` (NEW - 369 lines)
```
Purpose: Allows external affiliates to create characters via API
Key Features:
  - Bearer token authentication
  - Rate limiting (100/hour)
  - Creates anonymous user + session
  - Creates character with affiliate metadata
  - Returns redirect URL with session token
```

#### `app/api/set-anonymous-session/route.ts` (NEW - 75 lines)
```
Purpose: Sets anonymous session cookie from URL token
Key Features:
  - Validates session token
  - Sets HTTP-only cookie
  - Used when redirecting from affiliate sites
```

#### `app/api/eliza/rooms/route.ts` (MODIFIED - 141 lines changed)
```
Changes:
  - Added better validation for entityId
  - Removed lastTime/lastText columns (schema mismatch fix)
  - Added character mapping creation
  - Better error handling
```

#### `app/api/eliza/rooms/[roomId]/messages/stream/route.ts` (MODIFIED - 418 lines changed)
```
Changes:
  - Enhanced message streaming
  - Better error handling
  - Conversation history tracking
```

### 2.2 Page Routes

#### `app/chat/[characterId]/page.tsx` (NEW - 160 lines)
```
Purpose: Dynamic chat route with theme resolution
Key Features:
  - Server-side theme resolution
  - Anonymous session handling
  - Intro page for first-time visitors
  - Authenticated user handling
  - SEO metadata with theme branding
```

### 2.3 Components

#### `components/chat/chat-interface.tsx` (NEW - 498 lines)
```
Purpose: Unified chat interface with dynamic theming
Key Features:
  - Theme prop for dynamic styling
  - CSS variables for colors
  - Anonymous user message tracking
  - Signup prompts at 5/10 messages
  - Paywall at message limit
  - Session cookie management
```

#### `components/chat/character-intro-page.tsx` (NEW - 298 lines)
```
Purpose: Intro page for character before chat
Key Features:
  - Displays character avatar, name, bio
  - Shows vibe label
  - CTA button to start chatting
  - Email capture flow
  - Dynamic theming support
```

#### `components/chat/email-capture-modal.tsx` (NEW - 170 lines)
```
Purpose: Modal for capturing email before chat
Key Features:
  - Email input with validation
  - Skip option for anonymous chat
  - Loading states
```

### 2.4 Configuration

#### `lib/config/affiliate-themes.ts` (NEW - 331 lines)
```
Purpose: Affiliate theming configuration system
Key Features:
  - Type-safe theme definitions
  - Color palettes (RGB format for alpha support)
  - Branding configuration
  - UI variant options
  - Feature flags
  - Helper functions:
    - getAffiliateTheme()
    - resolveCharacterTheme()
    - getThemeCSSVariables()
```

Themes defined:
- `clone-your-crush`: Pink/romantic theme
- `default`: Professional indigo theme

### 2.5 Eliza Runtime Changes

#### `lib/eliza/agent-runtime.ts` (HEAVILY MODIFIED - 812+ lines changed)
```
Changes from dev:
  - Significant restructuring
  - New character loading logic
  - Enhanced provider support
  - Better error handling
  
Note: This is a major refactor - need careful merge
```

#### `lib/eliza/plugin-assistant/index.ts` (MODIFIED - 741 lines changed)
```
Changes:
  - Enhanced template system
  - Added affiliate context injection
  - Modified message handling templates
  - Added recentMessages provider
```

#### `lib/eliza/plugin-assistant/providers/affiliate-context.ts` (NEW - 320 lines)
```
Purpose: Provides affiliate personality context to LLM
Key Features:
  - Extracts vibe from character metadata
  - Formats social media references
  - Provides behavioral instructions
  - Supports flirty, spicy, romantic vibes
```

#### `lib/eliza/plugin-assistant/providers/recent-messages.ts` (NEW - 112 lines)
```
Purpose: Provides conversation history to LLM
Key Features:
  - Fetches last 20 messages
  - Formats with timestamps
  - Filters agent thoughts
```

### 2.6 Services

#### `lib/services/characters.ts` (MODIFIED - 46 lines changed)
```
Changes:
  - Added toElizaCharacter() method
  - Enhanced affiliate data extraction
  - Added lore data passing
```

#### `lib/services/session-migration.ts` (NEW - 240 lines)
```
Purpose: Migrate anonymous sessions to authenticated users
Key Features:
  - Migrates chat history
  - Transfers credits
  - Links rooms to new user
```

### 2.7 Stores

#### `stores/chat-store.ts` (MODIFIED - 145 lines changed)
```
Changes:
  - Added avatarUrl to Character interface
  - Added loadRoomsPromise for deduplication
  - Enhanced entityId initialization (never empty)
  - Added force parameter to loadRooms()
  - Better error handling
```

### 2.8 Database

#### `db/schemas/eliza.ts` (MODIFIED - 15 lines changed)
```
Changes:
  - Schema updates for room-character mapping
```

#### New migration: `db/migrations/0002_natural_randall_flagg.sql`
```
New indexes for session summaries
```

---

## Part 3: Implementation Plan

### Phase 1: Core Infrastructure (2-3 hours)

1. **Create config directory and themes**
   ```
   mkdir -p lib/config
   ```
   - Copy `lib/config/affiliate-themes.ts`
   - Verify TypeScript types

2. **Add missing services**
   - Copy `lib/services/session-migration.ts`
   - Update `lib/services/characters.ts` with toElizaCharacter()

3. **Update chat store**
   - Merge changes from feat/affiliate-logic
   - Key changes:
     - avatarUrl in Character
     - loadRoomsPromise deduplication
     - entityId always initialized

### Phase 2: Eliza Runtime Updates (3-4 hours)

1. **Add new providers**
   - Copy `lib/eliza/plugin-assistant/providers/affiliate-context.ts`
   - Copy `lib/eliza/plugin-assistant/providers/recent-messages.ts`

2. **Update plugin-assistant/index.ts**
   - Register new providers
   - Add template variables for affiliate context
   - Update message handler template

3. **Carefully merge agent-runtime.ts**
   - This is a major refactor
   - Compare line-by-line
   - Consider using git cherry-pick for specific commits

4. **Add user-api-key.ts**
   - Copy `lib/eliza/user-api-key.ts`

### Phase 3: API Routes (2-3 hours)

1. **Create affiliate API route**
   ```
   mkdir -p app/api/affiliate/create-character
   ```
   - Copy route.ts
   - Verify all imports
   - Test with curl

2. **Create anonymous session API**
   ```
   mkdir -p app/api/set-anonymous-session
   ```
   - Copy route.ts
   - Verify cookie handling

3. **Update existing eliza routes**
   - Merge changes to `app/api/eliza/rooms/route.ts`
   - Merge changes to `app/api/eliza/rooms/[roomId]/messages/stream/route.ts`

### Phase 4: Chat Components (3-4 hours)

1. **Add new components**
   - Copy `components/chat/character-intro-page.tsx`
   - Copy `components/chat/character-intro-page-wrapper.tsx`
   - Copy `components/chat/chat-interface.tsx`
   - Copy `components/chat/email-capture-modal.tsx`
   - Copy `components/chat/buy-credits-modal.tsx`
   - Copy `components/chat/credits-exhausted-modal.tsx`

2. **Add themed components (optional)**
   - Copy `components/chat/chat-input-crush.tsx`
   - Copy `components/chat/chat-message-crush.tsx`

### Phase 5: Dynamic Chat Route (1-2 hours)

1. **Create chat route**
   ```
   mkdir -p app/chat/[characterId]
   ```
   - Copy page.tsx
   - Verify all imports
   - Test routing

### Phase 6: Scripts and Testing (1-2 hours)

1. **Add affiliate scripts**
   - Copy `scripts/create-affiliate-key.ts`
   - Copy `scripts/test-affiliate-api.sh`

2. **Run database migrations**
   - Check if migration 0002 is needed
   - Apply if necessary

3. **End-to-end testing**
   - Create affiliate API key
   - Test character creation via API
   - Test redirect to chat
   - Test anonymous session flow
   - Test authenticated user flow

---

## Part 4: Risk Assessment

### High Risk
- **agent-runtime.ts**: Major refactor, potential breaking changes
- **plugin-assistant/index.ts**: Template changes may affect existing chats

### Medium Risk
- **Database migrations**: May need schema updates
- **Chat store**: State management changes

### Low Risk
- **New components**: Additive, no breaking changes
- **New API routes**: Isolated functionality
- **Theme config**: Pure addition

---

## Part 5: Recommended Approach

### Option A: Cherry-Pick Commits (Recommended for granular control)
```bash
# List commits on feat/affiliate-logic not in dev
git log dev..feat/affiliate-logic --oneline

# Cherry-pick specific commits
git cherry-pick <commit-hash>
```

### Option B: Merge Branch (Faster but less control)
```bash
git merge feat/affiliate-logic
# Resolve conflicts manually
```

### Option C: File-by-File Copy (Most controlled)
```bash
# Use git show to copy files
git show feat/affiliate-logic:path/to/file > path/to/file
```

---

## Part 6: Testing Checklist

After migration, verify:

- [ ] Affiliate API creates characters correctly
- [ ] Anonymous sessions work with message limits
- [ ] Theme resolution works for clone-your-crush
- [ ] Default theme works for other affiliates
- [ ] Intro page displays correctly
- [ ] Chat interface uses correct theme
- [ ] Email capture modal works
- [ ] Session migration on signup works
- [ ] Conversation history persists
- [ ] Agent responds with correct personality
- [ ] All existing authenticated chat still works

---

## Part 7: Files to Copy (Quick Reference)

### New Files to Add
```
lib/config/affiliate-themes.ts
lib/services/session-migration.ts
lib/eliza/user-api-key.ts
lib/eliza/plugin-assistant/providers/affiliate-context.ts
lib/eliza/plugin-assistant/providers/recent-messages.ts
app/api/affiliate/create-character/route.ts
app/api/set-anonymous-session/route.ts
app/chat/[characterId]/page.tsx
components/chat/chat-interface.tsx
components/chat/character-intro-page.tsx
components/chat/character-intro-page-wrapper.tsx
components/chat/email-capture-modal.tsx
components/chat/buy-credits-modal.tsx
components/chat/credits-exhausted-modal.tsx
scripts/create-affiliate-key.ts
scripts/test-affiliate-api.sh
```

### Files to Merge/Update
```
stores/chat-store.ts
lib/services/characters.ts
lib/eliza/agent-runtime.ts
lib/eliza/plugin-assistant/index.ts
app/api/eliza/rooms/route.ts
app/api/eliza/rooms/[roomId]/messages/stream/route.ts
db/schemas/eliza.ts
```

---

## Estimated Total Time: 12-18 hours

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Core Infrastructure | 2-3 hours |
| Phase 2: Eliza Runtime | 3-4 hours |
| Phase 3: API Routes | 2-3 hours |
| Phase 4: Chat Components | 3-4 hours |
| Phase 5: Dynamic Route | 1-2 hours |
| Phase 6: Testing | 1-2 hours |


