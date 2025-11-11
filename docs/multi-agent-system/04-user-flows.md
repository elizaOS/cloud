# User Flows

## Complete User Journey Documentation

---

## Flow 1: First Time User

### Starting Point: Landing Page

```
1. User clicks "Get Started"
   ↓
2. Creates account / logs in
   ↓
3. Redirected to /dashboard
   ↓
4. Clicks "My Agents" in sidebar
```

### My Agents View

```
URL: /dashboard/my-agents

Display:
┌────────────────────────────────────────────┐
│ My Agents          [🔶 New Agent]         │
│ Explore Agents that you have...           │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │Ember │  │ Zilo │  │Pixel │            │
│  │ 🔥   │  │      │  │      │            │
│  │[💬][<>]│  │[💬][<>]│  │[💬][<>]│            │
│  └──────┘  └──────┘  └──────┘            │
│  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │Luna  │  │Code  │  │Creative│          │
│  │[💬][<>]│  │[💬][<>]│  │[💬][<>]│            │
│  └──────┘  └──────┘  └──────┘            │
└────────────────────────────────────────────┘

User Actions:
- Click 💬 → Go to Chat Mode
- Click <> → Go to Build Mode  
- Click "New Agent" → Go to Build Mode (empty)
```

---

## Flow 2: Starting Chat with Template Agent

### User clicks 💬 on "Ember"

```
Step 1: Navigation
  URL: /dashboard/chat?mode=chat&characterId=template-ember
  
Step 2: Backend Processing
  - Detect "template-" prefix
  - Check if user has Ember character
  - If not: Create from ember.json
  - Get character ID: "fb22ae63-0491..."
  
Step 3: Runtime Loading
  - Load Ember's runtime (not default Eliza!)
  - runtime.character.name = "Ember"
  
Step 4: Room Creation
  - Auto-create first room for Ember
  - Save character mapping
  - Generate greeting message
  
Step 5: UI Update
  ┌─────────────┬────────────────────────────┐
  │[← Back]     │ [Ember ▼]  [💬] [<>]      │
  ├─────────────┴────────────────────────────┤
  │Recent Chats │ 🔥 Eliza                   │
  │             │ Hello! I'm Ember, your...  │
  │[+ New Chat] │ Just now                   │
  │             │                            │
  │ Ember Chat  │ [Type your message...]     │
  │ (Just now)  │                            │
  └─────────────┴────────────────────────────┘
  
User can now type and chat with Ember!
```

---

## Flow 3: Switching Between Agents

### User clicks Agent Dropdown

```
Current: Chatting with Ember
Action: Click "Ember ▼" in header

Dropdown Opens:
┌──────────────────────────┐
│ [+] New Agent            │
├──────────────────────────┤
│ 🟠 Ember                 │ ← Currently selected
│    Wellness coach...     │
├──────────────────────────┤
│    Zilo                  │
│    Marketing strateg...  │
├──────────────────────────┤
│    Pixel                 │
│    E-commerce optim...   │
├──────────────────────────┤
│    Luna                  │
│    Anime enthusiast...   │
└──────────────────────────┘
```

### User selects "Zilo"

```
Step 1: Frontend
  - setSelectedCharacterId("template-zilo")
  - Clear current room (setRoomId(null))
  - Navigate to ?characterId=template-zilo
  
Step 2: Backend
  - Check if user has Zilo
  - Create from template if needed
  - Load Zilo's runtime
  
Step 3: Room Management
  - Load all rooms
  - Filter to Zilo's rooms only
  - If no rooms: Auto-create first one
  - If has rooms: Clear selection, show list
  
Step 4: UI Update
  Sessions sidebar now shows:
  - "No chats with this agent yet" OR
  - List of Zilo's previous conversations
  - "+ New Chat" always available
  
User sees Zilo's sessions and can start chatting!
```

---

## Flow 4: Creating New Chat

### Method 1: "+ New Chat" Button (in sidebar header)

```
User clicks [+] button

Backend:
→ createRoom(currentCharacterId || null)
→ If template: Auto-create character
→ Create room with correct runtime
→ Return roomId

Frontend:
→ setRoomId(newRoomId)
→ Room appears in sidebar
→ Chat interface ready

User can immediately start typing!
```

### Method 2: "Start Chatting" Button (empty state)

```
User has no chats with selected agent
Display: "No chats with this agent yet"
Button: [Start Chatting]

User clicks button:
→ Same as "+ New Chat" flow
→ Creates first room for agent
→ Ready to chat
```

---

## Flow 5: Build Mode

### User clicks <> on agent card

```
URL: /dashboard/chat?mode=build&characterId=template-zilo

Layout:
┌──────────────────┬───────────────────────┐
│   Chat (593px)   │ Agent DNA (593px)     │
│                  │                       │
│ Test messages    │ ┌─────────────────┐  │
│ appear here      │ │   Settings      │  │
│ while you        │ │  [General]      │  │
│ configure        │ │                 │  │
│                  │ │  Name: Zilo     │  │
│                  │ │  Username: zilo │  │
│                  │ │  System: [...]  │  │
│                  │ │  Voice: [▼]    │  │
│                  │ └─────────────────┘  │
└──────────────────┴───────────────────────┘

Features:
✅ Test changes in real-time (left panel)
✅ Edit properties (right panel)
✅ Switch between tabs
✅ JSON mode for advanced users
✅ Export/Save functionality
```

---

## Flow 6: Returning User

### User returns to `/dashboard/chat`

```
Scenario A: Has existing rooms
  ↓
Shows ALL rooms in sessions sidebar:
  - Eliza conversations
  - Ember conversations  
  - Zilo conversations
  - etc.
  ↓
User clicks any room → Resume that conversation
```

```
Scenario B: First visit (no rooms)
  ↓
Shows empty state:
  "No recent chats"
  [+ New Chat] button
  ↓
User clicks:
  - "+ New Chat" → Creates room with default Eliza
  - Agent dropdown → Switch to template agent
  - "My Agents" → Go back to agent library
```

---

## Flow 7: Building Custom Agent

### User clicks "New Agent" button (in My Agents or dropdown)

```
URL: /dashboard/chat?mode=build

Opens Build Mode with empty form:
┌──────────────────┬───────────────────────┐
│   Chat           │ Agent DNA             │
│                  │                       │
│ Empty initially  │ Name: [Empty]         │
│                  │ Username: [Empty]     │
│ User can test    │ System: [Empty]       │
│ as they build    │ ...                   │
│                  │                       │
│                  │ [Export]  [Save]      │
└──────────────────┴───────────────────────┘

Workflow:
1. User fills in agent details
2. Tests responses in left panel
3. Adjusts personality/system prompt
4. Saves when satisfied
5. Agent added to their library
```

---

## Flow 8: Session Management

### Deleting a Session

```
User hovers over session in list
→ Delete icon appears (🗑️)
→ User clicks delete
→ Confirm dialog: "Delete this conversation?"
→ If yes: 
  - Room deleted from database
  - Removed from sidebar
  - If was active room: Clear selection
```

### Creating Multiple Sessions with Same Agent

```
User has 3 Ember conversations:
  1. "Burnout Recovery Tips" (3 days ago)
  2. "Creative Block Help" (Yesterday)
  3. "Morning Motivation" (Active)
  
Sessions sidebar shows all 3 (filtered to Ember)
User can:
  - Click any to resume
  - Click "+ New Chat" for 4th conversation
  - Delete old ones
```

---

## Flow 9: Mode Switching

### From Chat Mode to Build Mode

```
User in chat mode with Ember
↓
Clicks [<> Build Mode] button
↓
URL changes: ?mode=build&characterId=X
↓
Layout transforms:
  - Sessions sidebar disappears
  - Agent DNA panel appears (right)
  - Chat stays visible (left)
  - Conversation preserved

User can now:
  - Continue chatting (testing)
  - Edit agent properties
  - See changes in real-time
```

### From Build Mode to Chat Mode

```
User in build mode
↓
Clicks [💬 Chat Mode] button
↓
URL changes: ?mode=chat&characterId=X
↓
Layout transforms:
  - Agent DNA panel disappears
  - Sessions sidebar appears (left)
  - Chat stays visible
  
User can now:
  - See all sessions
  - Start new chats
  - Switch agents
```

---

## Error Scenarios

### No Internet Connection
```
Rooms fail to load
→ Show error state
→ "Failed to load conversations"
→ [Retry] button
```

### Template Character Not Found
```
Invalid template ID in URL
→ API returns 404
→ Redirect to /dashboard/my-agents
→ Toast: "Character not found"
```

### Room Creation Fails
```
API error during room creation
→ Log error to console
→ Toast: "Failed to create room"
→ User can retry with "+ New Chat"
```

---

## Navigation Paths

### Quick Reference

```
From My Agents:
├─ Click 💬 → /dashboard/chat?mode=chat&characterId=X
├─ Click <> → /dashboard/chat?mode=build&characterId=X
└─ Click "New Agent" → /dashboard/chat?mode=build

From Chat:
├─ Click "Back" → /dashboard/my-agents
├─ Agent dropdown → Switch character (stay in mode)
├─ Mode toggle → Switch mode (keep character)
└─ "+ New Chat" → New room (same agent)

From Build:
├─ Click "Back" → /dashboard/my-agents
├─ Agent dropdown → Switch character (stay in build)
├─ Mode toggle → Switch to chat (keep character)
└─ "Save" → Save agent & stay in build
```

