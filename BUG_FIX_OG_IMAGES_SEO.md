# Bug Fix: OG Image & SEO Issues - Deep Analysis

**Date:** November 3, 2025  
**Issue URL:** https://www.elizacloud.ai/dashboard/eliza?characterId=6a901d1f-c1e5-4e22-a7f9-6e1a77028a0d  
**Status:** ✅ FIXED

---

## Executive Summary

Three critical bugs were affecting OG images and character avatars:

1. **Authentication Blocking OG Image Endpoint** - The `/api/og` endpoint was protected by authentication middleware, returning 401 errors to social media crawlers
2. **Static Metadata on Dynamic Pages** - The dashboard/eliza page was using static metadata instead of character-specific metadata when a characterId parameter was present
3. **Character Avatar Not Loading in Chat** - The room API was returning the default agent's avatar instead of the character-specific avatar

---

## Detailed Analysis

### Bug #1: OG Image API Endpoint Authentication Issue

#### **The Problem**

The `/api/og` route was being blocked by the authentication middleware (`proxy.ts`), causing a **401 Unauthorized** response when accessed.

#### **Root Cause**

In `proxy.ts` (lines 12-29), the `publicPaths` array defines which API routes don't require authentication. The `/api/og` endpoint was NOT included in this list:

```typescript
const publicPaths = [
  "/",
  "/api/models",
  "/api/fal/proxy",
  "/auth/error",
  "/auth/cli-login",
  "/api/auth/cli-session",
  "/api/v1/generate-image",
  "/api/v1/generate-video",
  "/api/v1/chat",
  "/api/v1/chat/completions",
  "/api/v1/embeddings",
  "/api/v1/models",
  "/api/stripe/webhook",
  "/api/privy/webhook",
  "/api/cron",
  "/api/v1/cron",
];
```

The middleware logic (lines 59-63) states:

```typescript
// If not a protected path and not public, allow through
// This handles static files, etc.
if (!isProtectedPath && !pathname.startsWith("/api/")) {
  return NextResponse.next();
}
```

This means ANY `/api/*` route not explicitly in `publicPaths` requires authentication, which blocks social media crawlers.

#### **Impact**

- Social media platforms (Twitter, Facebook, LinkedIn, Discord, Slack, etc.) cannot authenticate
- When crawlers try to fetch OG images, they receive 401 errors
- Links shared on social media show no preview images, only text
- Poor user experience when sharing links

#### **Test Evidence**

```bash
curl -I "https://www.elizacloud.ai/api/og?type=default&title=Eliza%20Agent&description=..."
# Returns: HTTP/2 401 Unauthorized
```

#### **The Fix**

Added `/api/og` to the `publicPaths` array in `proxy.ts`:

```typescript
const publicPaths = [
  "/",
  "/api/models",
  "/api/fal/proxy",
  "/api/og", // ✅ OG image generation (must be public for social media crawlers)
  // ... rest of paths
];
```

**File Modified:** `proxy.ts` (line 16)

---

### Bug #2: Static Metadata on Character-Specific URLs

#### **The Problem**

When sharing a URL like `/dashboard/eliza?characterId=6a901d1f-c1e5-4e22-a7f9-6e1a77028a0d`, the page was using generic "Eliza Agent" metadata instead of character-specific metadata.

#### **Root Cause**

The `app/dashboard/eliza/page.tsx` file was using a static `metadata` export:

```typescript
// OLD CODE ❌
export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.eliza,
  path: "/dashboard/eliza",
  noIndex: true,
});
```

This static metadata couldn't read URL parameters, so ALL dashboard/eliza URLs had the same generic metadata, regardless of which character was being viewed.

#### **Impact**

- When users share links to specific character conversations, the OG image and metadata showed generic information
- Lost opportunity for personalized social sharing
- Character names, avatars, and bios weren't displayed in social media previews
- Reduced engagement on shared links

#### **The Fix**

Converted to dynamic metadata generation using `generateMetadata()` function:

```typescript
// NEW CODE ✅
export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const characterId = params.characterId;

  // If no characterId, use default metadata
  if (!characterId) {
    return generatePageMetadata({
      ...ROUTE_METADATA.eliza,
      path: "/dashboard/eliza",
      noIndex: true,
    });
  }

  // Fetch character for dynamic metadata
  try {
    const [character] = await db
      .select()
      .from(userCharacters)
      .where(eq(userCharacters.id, characterId))
      .limit(1);

    if (character) {
      const bio = Array.isArray(character.bio)
        ? character.bio[0]
        : character.bio;
      const metadata = generateCharacterMetadata(
        character.id,
        character.name,
        bio,
        character.avatar_url,
        character.tags || [],
      );

      // Override path and add noIndex for dashboard pages
      return {
        ...metadata,
        alternates: {
          canonical: `/dashboard/eliza?characterId=${characterId}`,
        },
        robots: {
          index: false,
          follow: false,
        },
      };
    }
  } catch (error) {
    console.error("Error fetching character for metadata:", error);
  }

  // Fallback to default metadata
  return generatePageMetadata({
    ...ROUTE_METADATA.eliza,
    path: "/dashboard/eliza",
    noIndex: true,
  });
}
```

**File Modified:** `app/dashboard/eliza/page.tsx`

#### **Key Improvements**

1. ✅ Reads `characterId` from URL query parameters
2. ✅ Fetches character data from database
3. ✅ Generates character-specific OG images with avatar, name, and bio
4. ✅ Falls back to default metadata if no character is found
5. ✅ Maintains `noIndex: true` for dashboard pages (proper SEO practice)
6. ✅ Dynamic canonical URL includes the characterId parameter

---

### Bug #3: Character Avatar Not Loading in Chat Interface

#### **The Problem**

When visiting a URL like `/dashboard/eliza?characterId=6a901d1f-c1e5-4e22-a7f9-6e1a77028a0d`, the character's avatar was NOT displaying in the chat interface. Instead, the default Eliza avatar was shown.

#### **Root Cause**

The `/api/eliza/rooms/[roomId]` endpoint was loading the default agent's avatar instead of the character-specific avatar.

**Original code (lines 58-59):**

```typescript
// OLD CODE ❌
const agent = await runtime.getAgent(runtime.agentId);
const avatarUrl = agent?.settings?.avatarUrl as string | undefined;
```

Even though the API correctly identified the `characterId` for the room (lines 62-76), it still used the default runtime's avatar.

#### **Impact**

- When users selected a custom character, the default Eliza avatar appeared instead
- Character personality wasn't visually represented in the UI
- Confusing user experience when chatting with different characters
- All characters looked the same regardless of their actual avatar

#### **The Fix**

Modified the API endpoint to load the character-specific runtime when a `characterId` is present:

```typescript
// NEW CODE ✅
if (characterId) {
  // Load character-specific runtime to get character's avatar and name
  try {
    const characterRuntime =
      await agentRuntime.getRuntimeForCharacter(characterId);
    agent = await characterRuntime.getAgent(characterRuntime.agentId);
    avatarUrl = agent?.settings?.avatarUrl as string | undefined;
    agentName = agent?.name;
    logger.debug("[Eliza Room API] Loaded character avatar:", {
      name: agentName,
      avatarUrl,
    });
  } catch (err) {
    logger.warn(
      "[Eliza Room API] Failed to load character runtime, using default:",
      err,
    );
    // Fall back to default agent
    agent = await runtime.getAgent(runtime.agentId);
    avatarUrl = agent?.settings?.avatarUrl as string | undefined;
    agentName = agent?.name;
  }
} else {
  // Use default agent
  agent = await runtime.getAgent(runtime.agentId);
  avatarUrl = agent?.settings?.avatarUrl as string | undefined;
  agentName = agent?.name;
}
```

**File Modified:** `app/api/eliza/rooms/[roomId]/route.ts`

#### **Key Improvements**

1. ✅ Detects when a room has a specific character assigned
2. ✅ Loads the character's runtime using `getRuntimeForCharacter(characterId)`
3. ✅ Returns the character's actual avatar URL and name
4. ✅ Falls back gracefully to default agent if character loading fails
5. ✅ Logs debug information for troubleshooting

---

## Technical Details

### How OG Images Work

1. **Metadata Generation**
   - Next.js generates `<meta>` tags in the HTML `<head>`
   - These tags include `og:image`, `og:title`, `og:description`, etc.

2. **Social Media Crawlers**
   - When a URL is shared, platforms send HTTP requests to fetch the page
   - They parse the HTML to extract OG meta tags
   - They fetch the image URL specified in `og:image`

3. **Dynamic OG Images**
   - The app uses `/api/og` route to generate images on-the-fly
   - URL parameters control the image content: type, title, description, name, etc.
   - Example: `/api/og?type=character&name=Eliza&description=AI%20Character`

### The Flow (After Fix)

```
User shares link
    ↓
Social media crawler requests URL
    ↓
Next.js generateMetadata() runs
    ↓
Fetches character from database
    ↓
Generates metadata with OG image URL
    ↓
Returns HTML with meta tags
    ↓
Crawler parses meta tags
    ↓
Crawler requests /api/og?... (NOW PUBLIC ✅)
    ↓
OG image generated and returned
    ↓
Social media displays preview with image
```

---

## Files Changed

| File                                    | Lines Modified | Purpose                                         |
| --------------------------------------- | -------------- | ----------------------------------------------- |
| `proxy.ts`                              | Line 16        | Added `/api/og` to public paths                 |
| `app/dashboard/eliza/page.tsx`          | Lines 1-79     | Converted static metadata to dynamic generation |
| `app/api/eliza/rooms/[roomId]/route.ts` | Lines 57-116   | Load character-specific avatar in room API      |

---

## Testing Recommendations

### 1. Test OG Endpoint Accessibility

```bash
# Should return 200 OK (not 401)
curl -I "https://www.elizacloud.ai/api/og?type=default&title=Test"
```

### 2. Test Social Media Sharing

Use these tools to verify OG images load correctly:

- **Facebook Debugger:** https://developers.facebook.com/tools/debug/
- **Twitter Card Validator:** https://cards-dev.twitter.com/validator
- **LinkedIn Post Inspector:** https://www.linkedin.com/post-inspector/
- **OpenGraph Check:** https://www.opengraph.xyz/

Test URLs:

```
https://www.elizacloud.ai/dashboard/eliza?characterId=6a901d1f-c1e5-4e22-a7f9-6e1a77028a0d
https://www.elizacloud.ai/marketplace/characters/6a901d1f-c1e5-4e22-a7f9-6e1a77028a0d
```

### 3. Verify Dynamic Metadata

- Share a character-specific URL
- Verify the OG image shows the character's avatar/name
- Verify the title includes the character name
- Verify the description includes the character bio

### 4. Test Fallback Behavior

- Share `/dashboard/eliza` (no characterId)
- Should show generic "Eliza Agent" metadata
- Should still return 200 OK for OG image

---

## SEO Best Practices Maintained

✅ **noIndex for Dashboard Pages** - Dashboard pages properly have `robots: { index: false, follow: false }` to prevent search engine indexing (these are authenticated pages)

✅ **Proper Canonical URLs** - Each page variation has a unique canonical URL including query parameters

✅ **OG Image Dimensions** - All OG images are 1200x630px (optimal for social media)

✅ **Error Handling** - Graceful fallbacks if character data can't be fetched

✅ **Public Marketplace Pages** - The `/marketplace/characters/[id]` pages remain properly indexed with SEO-friendly metadata

---

## Related Files & Context

### Existing Metadata Infrastructure

The app already had excellent SEO infrastructure:

1. **`lib/seo/metadata.ts`** - Helper functions for generating metadata
2. **`lib/seo/constants.ts`** - Route metadata definitions
3. **`app/api/og/route.tsx`** - Dynamic OG image generation
4. **`app/marketplace/characters/[id]/page.tsx`** - Example of proper dynamic metadata

### Why This Bug Existed

The dashboard/eliza page was likely created early in development when URL parameters weren't considered, or it was intentionally kept simple since it's an authenticated page with `noIndex: true`.

However, even non-indexed pages should have good OG metadata for social sharing purposes.

---

## Prevention

To prevent similar issues in the future:

1. **Public API Checklist**
   - When creating API routes that need to be accessed by external services (webhooks, social crawlers, etc.), add them to `publicPaths` in `proxy.ts`
   - Document why each path is public

2. **Dynamic Metadata Checklist**
   - When pages accept URL parameters that affect content, use `generateMetadata()` instead of static `metadata` export
   - Always include fallback behavior
   - Test with social media debuggers

3. **Testing Protocol**
   - Test all shareable URLs with at least one social media debugger
   - Verify OG images load (200 OK, not 401)
   - Check that dynamic content appears correctly

---

## Conclusion

All three bugs have been fixed:

✅ **OG Image Endpoint** - Now publicly accessible to social media crawlers  
✅ **Dynamic Metadata** - Character-specific information now shows in social previews  
✅ **Character Avatars** - Character-specific avatars now display correctly in chat interface

**No breaking changes** - All existing functionality preserved, only enhanced social sharing and chat experience.

**Deploy ASAP** - These fixes significantly improve:

- Social media sharing (OG images now work)
- User experience (correct character avatars in chat)
- Character personality representation (visual consistency)
