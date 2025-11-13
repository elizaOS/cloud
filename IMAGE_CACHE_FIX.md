# Image Cache Issue - Diagnosis & Fix

## 🔍 Where Images Are Loaded (Complete Flow)

```
DATABASE (PostgreSQL)
user_characters.avatar_url = "/avatars/creative-spark.png"
         ↓
db/repositories/user-characters.ts
userCharactersRepository.search()
         ↓
lib/services/my-agents.ts (line 641)
toExtendedCharacter() maps: avatar_url → avatarUrl
         ↓
app/dashboard/my-agents/my-agents.tsx (line 39)
Server component passes avatarUrl to client
         ↓
components/my-agents/my-agents-client.tsx
Receives initialCharacters with avatarUrl
         ↓
components/my-agents/character-library-card.tsx (line 106-110)
Gets avatarUrl from character prop + adds cache-buster
         ↓
Next.js <Image> Component (line 127-132)
<Image src={avatarUrl} /> renders the image
         ↓
⚠️ CACHED: .next/cache/images/ + Browser Cache
```

## 🎯 Root Causes

1. **Next.js Image Optimization Cache** (.next/cache/images/)
   - Next.js caches optimized images by URL
   - Survives server restarts
   - Not cleared by Redis cache clears

2. **Browser HTTP Cache**
   - Browser caches images with HTTP headers
   - Persists across page reloads

3. **Redis Marketplace Cache** 
   - Caches search results with avatar URLs
   - ✅ Fixed by running clear-all-caches script

## ✅ Solutions Applied

### 1. Removed Duplicate Database Entries
```bash
bun run remove-duplicates.ts
```
- Removed older duplicate entries for: eliza, ember, zilo

### 2. Cleared All Caches
```bash
rm -rf .next/cache          # Next.js optimization cache
bun run clear-all-caches.ts # Redis marketplace cache
```

### 3. Added Cache-Busting Parameter
**File**: `components/my-agents/character-library-card.tsx`
```typescript
const avatarUrl = baseAvatarUrl ? `${baseAvatarUrl}?v=2024-11-13` : undefined;
```
- Forces browsers to fetch fresh images
- Update the version date when avatars change

## 🚀 How To Apply This Fix Again

When you update avatars in the future:

1. **Update Database**
   ```bash
   bun run scripts/update-avatar-urls.ts
   ```

2. **Clear All Caches**
   ```bash
   rm -rf .next/cache
   ```

3. **Update Cache-Buster Version**
   In `components/my-agents/character-library-card.tsx`:
   ```typescript
   const avatarUrl = baseAvatarUrl ? `${baseAvatarUrl}?v=YYYY-MM-DD` : undefined;
   ```
   Change the date to today's date.

4. **Restart Server & Hard Refresh Browser**
   ```bash
   bun run dev
   # Then in browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   ```

## 📋 Verification Commands

Check database has correct URLs:
```bash
bun run check-db.ts
```

Check for duplicates:
```bash
# Should show no duplicates
psql $DATABASE_URL -c "SELECT username, COUNT(*) FROM user_characters WHERE is_template = true GROUP BY username HAVING COUNT(*) > 1;"
```
