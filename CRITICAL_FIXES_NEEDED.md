# 🚨 CRITICAL FIXES NEEDED BEFORE SHIPPING

## ⚠️ ISSUES FOUND

### Issue #1: Missing Type Import ❌ HIGH PRIORITY
**File:** `app/api/affiliate/create-character/route.ts`  
**Line:** ~170  
**Problem:** Uses `affiliateOrg` as `Organization` type but it's not imported

**Fix:**
```typescript
// Add this import at the top of the file (line ~8)
import type { Organization } from "@/db/schemas/organizations";
```

---

### Issue #2: Server Actions in Client Component ❌ HIGH PRIORITY  
**File:** `app/chat/[characterId]/page.tsx`  
**Lines:** 47-57  
**Problem:** Can't pass server functions as props to client components

**Current (Broken):**
```typescript
return (
  <CharacterIntroPage
    character={character}
    onEmailSubmit={async (email) => {
      "use server";  // ❌ This doesn't work as prop
      // ...
    }}
    onSkip={async () => {
      "use server";  // ❌ This doesn't work as prop
      redirect(...);
    }}
  />
);
```

**Fix: Refactor to use client-side routing**
See Fix #2 below for complete solution.

---

### Issue #3: Chat Interface is Placeholder 🚧 MEDIUM PRIORITY
**File:** `components/chat/chat-interface.tsx`  
**Line:** 145-155  
**Problem:** Shows placeholder, needs your existing chat components

**Action:** Integrate your existing Eliza chat system

---

### Issue #4: Alert Component May Not Exist ⚠️ LOW PRIORITY
**File:** `components/chat/chat-interface.tsx`  
**Line:** 7  
**Problem:** Imports `Alert` from `@/components/ui/alert` - verify this exists

---

### Issue #5: Progress Component May Not Exist ⚠️ LOW PRIORITY
**File:** `components/chat/chat-interface.tsx`  
**Line:** 8  
**Problem:** Imports `Progress` from `@/components/ui/progress` - verify this exists

---

## 🔧 REQUIRED FIXES

### Fix #1: Add Organization Import

```bash
# Edit: app/api/affiliate/create-character/route.ts
```

Add this import near the top (around line 8):
```typescript
import type { Organization } from "@/db/schemas/organizations";
```

---

### Fix #2: Refactor Chat Page (Complete Solution)

Replace `app/chat/[characterId]/page.tsx` with this:

```typescript
import { redirect, notFound } from "next/navigation";
import { charactersService, anonymousSessionsService } from "@/lib/services";
import { getCurrentUser } from "@/lib/auth";
import { CharacterIntroPageWrapper } from "@/components/chat/character-intro-page-wrapper";
import { ChatInterface } from "@/components/chat/chat-interface";
import { logger } from "@/lib/utils/logger";

interface ChatPageProps {
  params: Promise<{
    characterId: string;
  }>;
  searchParams: Promise<{
    source?: string;
    session?: string;
    vibe?: string;
    intro?: string;
  }>;
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { characterId } = await params;
  const { source, session: sessionId, vibe, intro } = await searchParams;

  // Load character
  const character = await charactersService.getById(characterId);

  if (!character) {
    logger.warn(`[Chat Page] Character not found: ${characterId}`);
    notFound();
  }

  // Check authentication
  const user = await getCurrentUser();

  // Show intro page if first visit or explicitly requested
  if ((!user && !sessionId) || intro === "true") {
    logger.info(`[Chat Page] Showing intro page for character ${characterId}`);
    
    return (
      <CharacterIntroPageWrapper
        character={character}
        characterId={characterId}
        source={source}
      />
    );
  }

  // Anonymous user with session
  if (!user && sessionId) {
    const anonSession = await anonymousSessionsService.getByToken(sessionId);

    if (!anonSession || anonSession.expires_at < new Date()) {
      redirect(`/chat/${characterId}?intro=true&source=${source || "direct"}`);
    }

    const messagesRemaining = anonSession.messages_limit - anonSession.message_count;
    const shouldShowSignupPrompt = anonSession.message_count >= 5;

    return (
      <ChatInterface
        character={character}
        session={{
          id: anonSession.id,
          token: sessionId,
          userId: anonSession.user_id,
          messageCount: anonSession.message_count,
          messagesLimit: anonSession.messages_limit,
          messagesRemaining,
        }}
        showSignupPrompt={shouldShowSignupPrompt}
        source={source}
      />
    );
  }

  // Authenticated user
  return (
    <ChatInterface
      character={character}
      user={{
        id: user.id,
        name: user.name || undefined,
        email: user.email || undefined,
      }}
      source={source}
    />
  );
}

export async function generateMetadata({ params }: ChatPageProps) {
  const { characterId } = await params;
  const character = await charactersService.getById(characterId);

  if (!character) {
    return { title: "Character Not Found" };
  }

  const bioText = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio;

  return {
    title: `Chat with ${character.name} | ElizaOS Cloud`,
    description: bioText.slice(0, 160),
    openGraph: {
      title: `Chat with ${character.name}`,
      description: bioText.slice(0, 160),
      images: character.avatar_url ? [character.avatar_url] : [],
    },
  };
}
```

Create new wrapper component `components/chat/character-intro-page-wrapper.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { CharacterIntroPage } from "./character-intro-page";
import type { UserCharacter } from "@/db/schemas";
import { randomUUID } from "crypto";

interface CharacterIntroPageWrapperProps {
  character: UserCharacter;
  characterId: string;
  source?: string;
}

export function CharacterIntroPageWrapper({
  character,
  characterId,
  source,
}: CharacterIntroPageWrapperProps) {
  const router = useRouter();

  async function handleEmailSubmit(email: string) {
    // Privy handles the auth
    // After successful auth, user will be redirected back with auth token
    // The page will reload and detect authenticated user
    router.refresh();
  }

  function handleSkip() {
    // Create new session ID and redirect to chat
    const newSessionId = crypto.randomUUID();
    router.push(`/chat/${characterId}?session=${newSessionId}&source=${source || "direct"}`);
  }

  return (
    <CharacterIntroPage
      character={character}
      onEmailSubmit={handleEmailSubmit}
      onSkip={handleSkip}
      source={source}
    />
  );
}
```

---

### Fix #3: Add Missing UI Components

If `Alert` or `Progress` don't exist, install shadcn components:

```bash
# Check if Alert exists
ls components/ui/alert.tsx

# If not, add it:
bunx shadcn@latest add alert

# Check if Progress exists
ls components/ui/progress.tsx

# If not, add it:
bunx shadcn@latest add progress
```

---

## 🧪 TESTING CHECKLIST

Before shipping, test each scenario:

### 1. Test API Endpoint

```bash
# Make script executable
chmod +x scripts/test-affiliate-api.sh

# Run tests (will test invalid requests)
./scripts/test-affiliate-api.sh

# Test with valid API key (after creating one)
API_KEY=your_key_here ./scripts/test-affiliate-api.sh
```

### 2. Test Character Creation

```bash
# First, create API key
bun run create-affiliate-key "test-affiliate"

# Copy the key and test
curl -X POST http://localhost:3000/api/affiliate/create-character \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY_HERE" \
  -d '{
    "character": {
      "name": "Test Luna",
      "bio": ["A test character"]
    },
    "affiliateId": "test-affiliate"
  }'

# Expected response:
# {
#   "success": true,
#   "characterId": "abc-123...",
#   "sessionId": "xyz-789...",
#   "redirectUrl": "http://localhost:3000/chat/abc-123?..."
# }
```

### 3. Test Intro Page

```bash
# Start dev server
bun run dev

# Open browser
open http://localhost:3000/chat/CHARACTER_ID?intro=true

# Verify:
# - Character info displays
# - "Start Chatting" button appears
# - Email modal opens on click
# - Skip creates anonymous session
```

### 4. Test Chat Flow

```bash
# With anonymous session
open "http://localhost:3000/chat/CHARACTER_ID?session=SESSION_ID"

# Verify:
# - Free message counter shows
# - Can send messages
# - Counter decrements
# - Soft prompt appears at 5 messages
# - Hard paywall at 10 messages
```

---

## 📝 MANUAL FIX CHECKLIST

- [ ] Fix #1: Add `Organization` type import
- [ ] Fix #2: Refactor chat page with wrapper component
- [ ] Fix #3: Install Alert component if missing
- [ ] Fix #3: Install Progress component if missing
- [ ] Test API endpoint with curl
- [ ] Test character creation
- [ ] Test intro page
- [ ] Test anonymous chat flow
- [ ] Test signup flow
- [ ] Test session migration

---

## 🚀 DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] All fixes applied
- [ ] All tests passing
- [ ] API key generated for CloneUrCrush
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Affiliate organization created
- [ ] Rate limits configured
- [ ] CORS configured for production domain
- [ ] Error monitoring enabled (Sentry, etc.)
- [ ] Analytics tracking added

---

## 📞 NEXT STEPS

1. Apply Fix #1 (Organization import)
2. Apply Fix #2 (Refactor chat page)  
3. Run `bun install` (in case packages missing)
4. Run `bun run dev`
5. Test with curl script
6. Test in browser
7. Fix any remaining issues
8. Deploy!

---

**Status:** 🔴 **NEEDS FIXES BEFORE SHIPPING**  
**Priority:** Fix #1 and #2 are **CRITICAL** - must be done before testing

