# Troubleshooting Guide

## Common Issues and Solutions

---

## Issue 1: Agent Says Wrong Name

### Symptom
```
User selects "Ember" but agent responds:
"Hi! I'm Eliza, not Ember"
```

### Cause
Using default runtime instead of character-specific runtime

### Fix
```typescript
// WRONG ❌
const runtime = await agentRuntime.getRuntime();

// CORRECT ✅
const runtime = characterId
  ? await agentRuntime.getRuntimeForCharacter(characterId)
  : await agentRuntime.getRuntime();
```

**Location**: `app/api/eliza/rooms/route.ts` line ~218

---

## Issue 2: Can't See Any Rooms

### Symptom
Sessions sidebar shows "No recent chats" even though rooms exist

### Cause
Sessions filtered by characterId when it shouldn't be

### Debug
```typescript
// Check URL
console.log("URL characterId:", searchParams.get("characterId"));

// Check filter logic
console.log("Total rooms:", rooms.length);
console.log("Filtered rooms:", filteredRooms.length);
```

### Fix
Ensure filtering logic in `sessions-sidebar.tsx`:
```typescript
const filteredRooms = useMemo(() => {
  if (!urlCharacterId) {
    return rooms; // Show ALL when no character specified
  }
  return rooms.filter(room => room.characterId === urlCharacterId);
}, [rooms, urlCharacterId]);
```

---

## Issue 3: "Start Chatting" Button Not Working

### Symptom
Click button, nothing happens, see console error

### Common Errors

#### A) `createRoom is not defined`
```typescript
// Missing import in component
import { useChatStore } from "@/stores/chat-store";

const { createRoom } = useChatStore(); // ← Add this
```

#### B) `runtime is not defined`
```typescript
// Missing runtime initialization in API
const runtime = characterId
  ? await agentRuntime.getRuntimeForCharacter(characterId)
  : await agentRuntime.getRuntime();
```

#### C) Network error
```
Check console for API errors
Verify Next.js dev server is running
Check database connection
```

---

## Issue 4: Layout Looks Squeezed

### Symptom
Build mode panels don't have correct proportions

### Cause
Missing `shrink-0` or wrong width values

### Fix
```typescript
// Sessions Sidebar
<div className="w-[255px] shrink-0 ...">

// Agent DNA Panel  
<div className="w-[593px] shrink-0 ...">

// Chat Interface
<div className="flex-1 overflow-hidden min-h-0">
```

---

## Issue 5: Template Character Not Appearing

### Symptom
Added new template JSON but doesn't show in My Agents

### Checklist
- [ ] JSON file created in `lib/characters/templates/`
- [ ] ID starts with `"template-"`
- [ ] Imported in `template-loader.ts`
- [ ] Added to `TEMPLATE_CHARACTERS` object
- [ ] Dev server restarted
- [ ] No TypeScript errors

### Debug
```typescript
// In template-loader.ts
console.log("Loaded templates:", Object.keys(TEMPLATE_CHARACTERS));

// In demo-agents.ts
console.log("Demo agents:", DEMO_AGENTS.length);
```

---

## Issue 6: Avatar Not Showing

### Symptom
Agent card shows gradient placeholder instead of image

### Causes & Fixes

#### A) Wrong path in avatarUrl
```json
// Check template JSON
"avatarUrl": "/avatars/luna.png"  // ✅ Correct
"avatarUrl": "avatars/luna.png"   // ❌ Missing leading slash
```

#### B) Image doesn't exist
```bash
# Verify file exists
ls -la public/avatars/luna.png

# Add if missing
cp your-image.png public/avatars/luna.png
```

#### C) Next.js image optimization issue
```typescript
// Check console for image load errors
// Verify image format (PNG/JPG supported)
```

---

## Issue 7: Duplicate Headers/Sidebars

### Symptom
See two headers, two sidebars stacked

### Cause
Both layout.tsx and ElizaPageClient rendering layouts

### Fix
Ensure `app/dashboard/(chat-build)/layout.tsx` is simplified:
```typescript
export default function ChatBuildLayout({ children }) {
  return <>{children}</>;  // Just pass through!
}
```

---

## Issue 8: Agent Switching Doesn't Update Sessions

### Symptom
Switch from Ember to Zilo, still see Ember's rooms

### Cause
Not using URL characterId for filtering

### Fix
```typescript
// Use URL params as source of truth
const urlCharacterId = useSearchParams().get("characterId");

// Filter based on URL, not store
const filteredRooms = useMemo(() => {
  if (!urlCharacterId) return rooms;
  return rooms.filter(r => r.characterId === urlCharacterId);
}, [rooms, urlCharacterId]); // ← Depend on urlCharacterId
```

---

## Issue 9: TypeScript Errors

### Error: "Cannot find module './templates/X.json'"

**Fix**: Ensure JSON files are properly placed:
```bash
# Check file exists
ls lib/characters/templates/ember.json

# Verify import path
import emberTemplate from "./templates/ember.json";
```

### Error: "Property 'X' does not exist on type..."

**Fix**: Ensure types are correct:
```typescript
// Cast to ExtendedCharacter
"template-ember": emberTemplate as ExtendedCharacter,
```

---

## Issue 10: No Rooms Loading

### Symptoms
- Empty sessions sidebar
- Console shows API errors

### Debug Steps

```typescript
// 1. Check if API is being called
console.log("[Debug] Calling loadRooms");

// 2. Check response
const response = await fetch("/api/eliza/rooms?entityId=X");
console.log("API Response:", await response.json());

// 3. Check entityId
console.log("Entity ID:", localStorage.getItem("elizaEntityId"));

// 4. Check database
// Use Drizzle Studio to verify rooms table has data
```

### Common Fixes
- Clear localStorage
- Restart dev server
- Check database connection
- Verify authentication

---

## Console Commands for Debugging

```typescript
// Check chat store state
window.__CHAT_STORE__ = useChatStore.getState();
console.log(window.__CHAT_STORE__);

// Check mode store
window.__MODE_STORE__ = useModeStore.getState();
console.log(window.__MODE_STORE__);

// Check loaded templates
import { getAllTemplates } from "@/lib/characters/template-loader";
console.log("Templates:", getAllTemplates());

// Check localStorage
console.log("Entity ID:", localStorage.getItem("elizaEntityId"));
console.log("Room ID:", localStorage.getItem("elizaRoomId"));
```

---

## Reset Everything

### Clear All Data

```bash
# 1. Clear browser localStorage
localStorage.clear();
location.reload();

# 2. Reset database (development only!)
bun run db:push

# 3. Restart dev server
# Kill server, then:
bun run dev
```

---

## Performance Issues

### Slow Agent Switching

**Symptom**: Takes 2-3 seconds to switch agents

**Causes**:
- Multiple room reloads
- Unnecessary re-renders

**Fix**:
```typescript
// Debounce room loading
const debouncedLoadRooms = useMemo(() => 
  debounce(loadRooms, 300),
  [loadRooms]
);
```

### Slow Template Loading

**Symptom**: My Agents page loads slowly

**Fix**: Templates are in-memory, should be instant. Check:
- Network tab for unnecessary API calls
- React DevTools for re-renders
- Bundle size (ensure JSON files are tree-shaken)

---

## Getting Help

### When reporting issues, include:

1. **URL** when issue occurs
2. **Console errors** (full stack trace)
3. **Network tab** (failed requests)
4. **Steps to reproduce**
5. **Expected vs actual behavior**
6. **Browser and OS**

### Useful Debug Info

```typescript
// Add to component
console.log({
  mode: useModeStore.getState().mode,
  selectedCharacterId: useChatStore.getState().selectedCharacterId,
  roomId: useChatStore.getState().roomId,
  totalRooms: useChatStore.getState().rooms.length,
  urlParams: Object.fromEntries(new URLSearchParams(window.location.search)),
});
```

