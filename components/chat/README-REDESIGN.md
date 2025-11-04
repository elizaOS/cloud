# Chat Interface Redesign

This document outlines the new chat interface components based on the Figma designs.

## Figma Designs

- **Main Chat**: https://www.figma.com/design/64xmxXKnD8cATGW2D0Zm17/Eliza-Cloud-App?node-id=313-2036&m=dev&focus-id=435-4259
- **Settings Panel**: https://www.figma.com/design/64xmxXKnD8cATGW2D0Zm17/Eliza-Cloud-App?node-id=313-2036&m=dev&focus-id=435-4468
- **Agent DNA Panel**: https://www.figma.com/design/64xmxXKnD8cATGW2D0Zm17/Eliza-Cloud-App?node-id=313-2036&m=dev&focus-id=435-4798

## New Components Created

### Layout Components

#### 1. `chat-sidebar.tsx` ✅
**Purpose**: Left sidebar with agent list and conversation history

**Features**:
- "All Agents" back button
- Current agent card with avatar and interaction count
- Search and edit icons
- Conversation list with icons
- Active state highlighting
- Width: 255px

#### 2. `chat-header.tsx` ✅
**Purpose**: Top header showing agent info and actions

**Features**:
- Agent avatar (48px) with online indicator
- Agent name and subtitle
- Settings button
- More options (three dots) button
- Matches Figma exactly

### Message Components

#### 3. `chat-message-redesigned.tsx` ✅
**Purpose**: Redesigned message bubbles for user and agent

**Features**:
- User messages: Right-aligned, white/10 background
- Agent messages: Left-aligned with avatar and name
- Thinking state: "Zilo is thinking..."
- Image grid support (3 images max in preview)
- Feedback buttons integration
- "Edit in Pro Studio" button with gradient
- Timestamps

#### 4. `tool-progress-indicators.tsx` ✅
**Purpose**: Show agent's current tasks/tools being used

**Features**:
- Icon-based progress items
- Active/inactive states (opacity)
- Supports puzzle, image, message icons
- Clean minimal design

#### 5. `message-feedback-buttons.tsx` ✅
**Purpose**: Like, dislike, regenerate buttons

**Features**:
- Thumbs up button
- Thumbs down button
- Regenerate (refresh) button
- Backdrop blur on buttons
- Rounded pill shape

#### 6. `approve-reject-bar.tsx` ✅
**Purpose**: Shows when agent is running with approve/reject actions

**Features**:
- "Agent Running ..." status text
- Reject button (subtle)
- Approve button (highlighted)
- Small 10px font size
- Minimal design

### Input Components

#### 7. `chat-input-redesigned.tsx` ✅
**Purpose**: Redesigned bottom input area

**Features**:
- Textarea for multi-line input
- Model selector dropdown (Gemini, GPT-4, Claude)
- Attachment button (Plus icon)
- Voice input button (Mic icon)
- Send button (Arrow up, orange when ready)
- Progress indicator decoration
- Dark background #1d1d1d

### Panel Components

#### 8. `agent-settings-panel.tsx` ✅
**Purpose**: Right panel for agent configuration (Settings view)

**Features**:
- Title and close button
- 3 main tabs: Settings, Model Calls, Memories
- 5 sub-tabs: General, Content, Style, File Upload, Avatar
- Form fields: Name, Username, System prompt, Voice Model
- JSON toggle switch
- Width: 587px

#### 9. `agent-dna-panel.tsx` ✅
**Purpose**: Right panel showing JSON configuration (Agent DNA view)

**Features**:
- Title and close button
- 4 tabs: Settings, Model Calls, Memories, File Upload
- JSON syntax highlighting
- Line numbers
- Color-coded:
  - Keys: #fe9f6d (orange)
  - Strings: #d4d4d4 (light gray)
  - Special: #00ffcc (cyan)
- Bottom fade overlay
- Width: 587px

## Layout Structure

```
┌────────────────────────────────────────────────────────────┐
│                    Global Header                            │
├──────────┬────────────────────────────┬────────────────────┤
│          │                            │                    │
│ Sidebar  │      Chat Messages         │  Settings/DNA      │
│ 255px    │      (Main Area)           │  Panel (587px)     │
│          │                            │  [Optional]        │
│ - Agent  │  - User messages (right)   │                    │
│ - Convos │  - Agent messages (left)   │  - Tabs            │
│          │  - Tool progress           │  - Forms/JSON      │
│          │  - Images grid             │  - Controls        │
│          │  - Feedback buttons        │                    │
│          │                            │                    │
│          │  ┌──────────────────────┐  │                    │
│          │  │  Approve/Reject Bar  │  │                    │
│          │  ├──────────────────────┤  │                    │
│          │  │  Input Area          │  │                    │
│          │  │  - Model selector    │  │                    │
│          │  │  - Actions           │  │                    │
│          │  └──────────────────────┘  │                    │
└──────────┴────────────────────────────┴────────────────────┘
```

## Design System Match

### Colors
- ✅ Background: `bg-neutral-950` (#0a0a0a)
- ✅ Borders: `#3e3e43`, `#252527`
- ✅ Orange accent: `#FF5800`
- ✅ Text: White, `#a1a1a1`, `zinc-400`

### Typography
- ✅ Font: Roboto Mono for labels, Roboto Flex for content
- ✅ Sizes: 10px (status), 12px (small), 14px (default), 16px (headers)

### Spacing
- ✅ Sidebar: 255px width
- ✅ Right panels: 587px width
- ✅ Chat area: Flexible (remaining space)
- ✅ Padding: Consistent with Figma (px-4, px-6, etc.)

## Next Steps

To complete the integration:

1. **Create main wrapper component** that combines:
   - ChatSidebar
   - Chat messages area with ChatHeader
   - Optional right panel (Settings or DNA)

2. **Wrap existing ElizaChatInterface** with new UI components while preserving all functionality:
   - Keep all existing API calls
   - Keep room management
   - Keep audio recording/playback
   - Keep character selection
   - Just update the UI layer

3. **Add panel state management**:
   - Toggle Settings panel
   - Toggle DNA panel
   - Only one panel open at a time

4. **Integration points**:
   - Use existing `messages` state
   - Use existing `isLoading`, `isThinking` states
   - Connect feedback buttons to existing handlers
   - Connect model selector to existing logic

## File Changes Required

### New Files ✅
- `components/chat/chat-sidebar.tsx`
- `components/chat/chat-header.tsx`
- `components/chat/chat-message-redesigned.tsx`
- `components/chat/tool-progress-indicators.tsx`
- `components/chat/message-feedback-buttons.tsx`
- `components/chat/approve-reject-bar.tsx`
- `components/chat/chat-input-redesigned.tsx`
- `components/chat/agent-settings-panel.tsx`
- `components/chat/agent-dna-panel.tsx`

### Files to Modify
- `components/chat/eliza-chat-interface.tsx` - Update to use new components
- Keep all existing logic, just swap UI components

## Testing Checklist

- [ ] Sidebar renders with agent info
- [ ] Conversation list shows and is clickable
- [ ] Chat messages display correctly (user + agent)
- [ ] Tool progress indicators show during agent thinking
- [ ] Feedback buttons work (like, dislike, regenerate)
- [ ] Approve/Reject bar shows when needed
- [ ] Input area accepts text and sends messages
- [ ] Model selector changes model
- [ ] Settings panel opens/closes
- [ ] Agent DNA panel opens/closes with JSON view
- [ ] All existing features still work (audio, rooms, etc.)

## Preserving Existing Functionality

The redesign MUST preserve:
- ✅ Real-time message streaming
- ✅ Audio recording/playback (STT/TTS)
- ✅ Room management and history
- ✅ Character selection
- ✅ Knowledge drawer
- ✅ Anonymous user support
- ✅ Voice selection
- ✅ All API integrations

We're only changing the visual layer, not the functionality.

