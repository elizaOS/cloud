# Technical Implementation

## File Structure

```
app/
├── api/eliza/rooms/
│   └── route.ts              # Room creation with template auto-creation
├── dashboard/
│   ├── (chat-build)/
│   │   ├── layout.tsx        # Simplified wrapper
│   │   └── chat/
│   │       └── page.tsx      # Main chat page with mode support
│   └── my-agents/
│       ├── page.tsx          # Agent library page
│       └── my-agents.tsx     # Agent library wrapper

components/
├── chat/
│   ├── agent-dna-panel.tsx   # Build mode right panel
│   ├── agent-switcher.tsx    # Agent dropdown selector
│   ├── chat-header.tsx       # Header with back/agent/mode
│   ├── eliza-chat-interface.tsx # Core chat UI
│   ├── eliza-page-client.tsx # Main layout orchestrator
│   ├── mode-toggle.tsx       # Chat/Build toggle
│   └── sessions-sidebar.tsx  # Chat mode left panel
├── marketplace/
│   ├── character-card.tsx    # Agent cards with routing
│   ├── character-grid.tsx    # Grid layout
│   └── character-marketplace.tsx # Agent library view
└── my-agents/
    ├── character-library-card.tsx # Alternative card design
    └── (other files...)

lib/
├── characters/
│   ├── templates/            # Template JSON files
│   │   ├── ember.json
│   │   ├── zilo.json
│   │   └── (others...)
│   └── template-loader.ts    # Template utilities
└── data/
    └── demo-agents.ts        # Loads templates for display

stores/
├── chat-store.ts             # Chat state management
└── mode-store.ts             # Mode (chat/build) state

public/
├── demo-agents/              # Figma demo images
│   ├── ember.jpg
│   ├── zilo.jpg
│   └── pixel.jpg
└── avatars/                  # Production avatars
    ├── luna.png
    ├── codementor.png
    └── (others...)
```

---

## State Management

### Chat Store (`stores/chat-store.ts`)

**Purpose**: Manages chat sessions, rooms, and agent selection

**State**:
```typescript
interface ChatState {
  rooms: RoomItem[];              // All user's rooms
  roomId: string | null;          // Currently active room
  isLoadingRooms: boolean;        // Loading indicator
  entityId: string;               // User's entity ID
  availableCharacters: Character[]; // User's characters
  selectedCharacterId: string | null; // Currently selected agent
}
```

**Key Actions**:
```typescript
loadRooms() → Promise<RoomItem[]>
  // Fetches all rooms for user
  // Returns array for filtering

createRoom(characterId?) → Promise<string | null>
  // Creates new room
  // Returns roomId

deleteRoom(roomId) → Promise<void>
  // Deletes room
  // Updates local state

setSelectedCharacterId(id)
  // Updates current agent selection
```

### Mode Store (`stores/mode-store.ts`)

**Purpose**: Manages chat vs build mode

**State**:
```typescript
interface ModeState {
  mode: 'chat' | 'build';
  setMode: (mode) => void;
  toggleMode: () => void;
}
```

---

## API Routes

### POST `/api/eliza/rooms`

**Purpose**: Create new conversation room

**Request**:
```typescript
{
  entityId: string;      // User's entity ID
  characterId?: string;  // Optional character ID
}
```

**Template Auto-Creation Logic**:
```typescript
if (characterId && isTemplateCharacter(characterId)) {
  const template = getTemplate(characterId);
  
  // Check if user already has this character
  const existing = await findByUsername(template.username);
  
  if (existing) {
    characterId = existing.id; // Use existing
  } else {
    const created = await createCharacter(template);
    characterId = created.id; // Use newly created
  }
}

// CRITICAL: Get character-specific runtime
const runtime = characterId
  ? await agentRuntime.getRuntimeForCharacter(characterId)
  : await agentRuntime.getRuntime();
```

**Response**:
```typescript
{
  success: true,
  roomId: string,
  message?: object  // Initial greeting
}
```

### GET `/api/eliza/rooms`

**Purpose**: List user's conversation rooms

**Query Params**:
```typescript
{
  entityId: string  // Required
}
```

**Response**:
```typescript
{
  success: true,
  rooms: [
    {
      id: string,
      characterId?: string,
      lastText?: string,
      lastTime?: number,
      title?: string
    }
  ]
}
```

---

## Database Schema

### user_characters Table

**Used for both template and user-created characters**

```sql
CREATE TABLE user_characters (
  id UUID PRIMARY KEY,
  organization_id UUID,
  user_id UUID,
  name TEXT,
  username TEXT,
  system TEXT,
  bio JSONB,
  topics JSONB,
  adjectives JSONB,
  plugins JSONB,
  settings JSONB,
  style JSONB,
  character_data JSONB,
  is_template BOOLEAN,      -- true for templates
  is_public BOOLEAN,
  avatar_url TEXT,
  category TEXT,
  tags JSONB,
  featured BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### eliza_room_characters Table

**Maps rooms to characters**

```sql
CREATE TABLE eliza_room_characters (
  room_id UUID,
  character_id UUID,
  user_id UUID,
  created_at TIMESTAMP
);
```

---

## Component Props

### ElizaPageClient

```typescript
interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
  initialRoomId?: string;
  initialCharacterId?: string;
  initialMode?: "chat" | "build";
}
```

### SessionsSidebar

```typescript
// No props - uses hooks
const { 
  rooms,                    // From useChatStore
  roomId,
  selectedCharacterId,
  createRoom,
  deleteRoom
} = useChatStore();

const urlCharacterId = useSearchParams().get("characterId");
```

### AgentSwitcher

```typescript
// No props - uses hooks
const { 
  selectedCharacterId,
  availableCharacters,
  setSelectedCharacterId,
  setRoomId,
  loadRooms,
  createRoom
} = useChatStore();

const { mode } = useModeStore();
```

---

## Routing

### URL Structure

```
/dashboard/my-agents
  → Agent library view

/dashboard/chat
  → Chat mode, default Eliza, all rooms visible

/dashboard/chat?characterId=template-ember
  → Chat mode with Ember, filtered to Ember's rooms

/dashboard/chat?mode=build
  → Build mode, empty form for new agent

/dashboard/chat?mode=build&characterId=template-ember
  → Build mode with Ember, can edit Ember configuration
```

### URL Parameters

| Parameter | Values | Purpose |
|-----------|--------|---------|
| `mode` | `chat` \| `build` | Determines layout |
| `characterId` | UUID or `template-*` | Selects agent |
| `roomId` | UUID | Selects specific conversation |

---

## Data Flow

### Template Character Lifecycle

```
1. Developer creates JSON
   ↓
2. Imported in template-loader.ts
   ↓
3. Visible in My Agents view (DEMO_AGENTS)
   ↓
4. User clicks chat icon
   ↓
5. API detects template ID
   ↓
6. Check DB for existing character
   ↓
7. If not exists: Create from JSON
   ↓
8. Get character-specific runtime
   ↓
9. Create room with that runtime
   ↓
10. User chats with template personality!
```

### Room Selection Flow

```
1. User lands on /dashboard/chat
   ↓
2. ElizaPageClient renders
   ↓
3. SessionsSidebar mounts
   ↓
4. Calls loadRooms()
   ↓
5. Fetches rooms from API
   ↓
6. Filters by URL characterId (if present)
   ↓
7. Displays filtered list
   ↓
8. User clicks room
   ↓
9. setRoomId(selectedRoom.id)
   ↓
10. ElizaChatInterface loads messages
```

---

## Key Utilities

### isTemplateCharacter()

```typescript
export function isTemplateCharacter(characterId: string): boolean {
  return characterId.startsWith("template-");
}
```

**Usage**:
- Detect if ID is a template
- Trigger auto-creation logic
- Used in API routes

### getAllTemplates()

```typescript
export function getAllTemplates(): ExtendedCharacter[] {
  return Object.values(TEMPLATE_CHARACTERS);
}
```

**Usage**:
- Load all templates for display
- Used in My Agents view
- Used in agent switcher dropdown

### templateToDbFormat()

```typescript
export function templateToDbFormat(
  template: ExtendedCharacter,
  userId: string,
  organizationId: string
)
```

**Usage**:
- Converts template JSON to DB format
- Adds user/organization IDs
- Sets is_template = true
- Used during auto-creation

---

## Performance Optimizations

### 1. Memoization

```typescript
// Filter rooms only when dependencies change
const filteredRooms = useMemo(() => {
  if (!urlCharacterId) return rooms;
  return rooms.filter(r => r.characterId === urlCharacterId);
}, [rooms, urlCharacterId]);
```

### 2. Lazy Loading

- Templates loaded from JSON (fast)
- DB creation only on first use
- Runtime initialized per-character (cached)

### 3. Efficient Queries

```typescript
// Check existing character with specific query
const existing = await db.query.userCharacters.findFirst({
  where: and(
    eq(userCharacters.user_id, user.id),
    eq(userCharacters.username, template.username)
  ),
});
```

---

## Error Handling

### Template Not Found

```typescript
const template = getTemplate(characterId);
if (!template) {
  return NextResponse.json(
    { error: "Template character not found" },
    { status: 404 }
  );
}
```

### Runtime Initialization

```typescript
try {
  const runtime = await agentRuntime.getRuntimeForCharacter(characterId);
} catch (error) {
  logger.error("Failed to load character runtime:", error);
  // Fallback to default runtime
  const runtime = await agentRuntime.getRuntime();
}
```

### Room Creation Failure

```typescript
try {
  const roomId = await createRoom(characterId);
  if (!roomId) throw new Error("Room creation failed");
} catch (error) {
  toast.error("Failed to create chat");
  console.error(error);
}
```

---

## Testing

### Manual Testing Checklist

- [ ] My Agents view displays all templates
- [ ] Click chat icon → Opens chat mode
- [ ] Click code icon → Opens build mode
- [ ] Agent switcher shows all agents
- [ ] Switching agents filters sessions
- [ ] "+ New Chat" creates room
- [ ] "Start Chatting" creates room
- [ ] Template auto-creates on first use
- [ ] Correct agent personality in responses
- [ ] Sessions persist across page reloads
- [ ] Delete session works
- [ ] Mode toggle works
- [ ] Layout proportions match Figma

### Integration Tests (To Be Added)

```typescript
describe("Template Character System", () => {
  it("should auto-create template character on first use");
  it("should reuse existing template character");
  it("should create room with correct runtime");
  it("should filter sessions by agent");
});
```

---

## Logging

### Important Log Points

```typescript
// Template detection
console.log("[Room API] Template character detected:", characterId);

// Character creation
console.log("[Room API] Created template character:", id);

// Runtime selection
console.log("[Room API] Using runtime for character:", name);

// Agent switching
console.log("[AgentSwitcher] Switching to agent:", agentId);

// Session filtering
console.log("[SessionsSidebar] Filtered rooms:", count);
```

### Debug Mode

Enable detailed logging:
```typescript
// In template-loader.ts
console.debug("[TemplateLoader] Loading template:", id);

// In agent-switcher.tsx
console.debug("[AgentSwitcher] Available agents:", allAgents);
```

