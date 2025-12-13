# Build Mode Feature

## Overview

The Build Mode feature allows users to edit and build their AI characters directly within the chat interface. When enabled, the view splits into two panes:

- **Left Pane**: Character editor with both Form and JSON views
- **Right Pane**: AI Assistant chat interface (styled to match the main chat UI)

## Implementation

### Components Created

1. **CharacterBuildMode** (`components/chat/character-build-mode.tsx`)
   - Main component that orchestrates the build mode experience
   - Integrates the AI Assistant and Character Editor in a split-pane layout
   - Handles character loading, updating, and saving
   - Syncs with the selected character from the global store

2. **BuildModeAssistant** (`components/chat/build-mode-assistant.tsx`)
   - AI Assistant specifically styled for build mode
   - Uses the same chat UI styling as ElizaChatInterface
   - Maintains all AI assistant functionality (real-time character updates)
   - Consistent look and feel with the main chat interface

### Components Modified

3. **Chat Store** (`stores/chat-store.ts`)
   - Added `mode` state to track current mode ("chat" | "build")
   - Added `setMode` action to switch between modes
   - Exported `ChatMode` type for use across the application

4. **Chat Header** (`components/layout/chat-header.tsx`)
   - Updated to use `mode` and `setMode` from the global store
   - Removed local state management in favor of global state
   - Mode toggle buttons now properly update the global mode

5. **Eliza Page Client** (`components/chat/eliza-page-client.tsx`)
   - Added conditional rendering based on `mode` state
   - Renders `CharacterBuildMode` when mode is "build"
   - Renders `ElizaChatInterface` when mode is "chat"

## Usage

1. Navigate to `/dashboard/chat`
2. Select a character from the dropdown in the header (or use default Eliza)
3. Click "Build Mode" toggle in the header
4. The interface switches to Build Mode with:
   - Character editor on the left (shows JSON/Forms)
   - AI Assistant chat on the right (styled like main chat)
5. Make changes through either:
   - Chatting with the AI Assistant (it updates the character in real-time)
   - Editing the form fields directly
   - Editing the JSON directly
6. Click "Save" in the JSON editor to persist changes
7. Switch back to "Chat Mode" to test your character

## Features

### AI Assistant Chat

- Full chat interface styled to match the main ElizaChatInterface
- Provides conversational interface for character building
- Suggests improvements and additions
- Updates character JSON in real-time as it streams responses
- Shows quick prompt buttons for common actions (on first message)
- Contextual to whether you're creating new or editing existing character
- Same visual design: message bubbles, timestamps, avatars, animations
- Consistent user experience across chat and build modes

### Character Editor

- **Form View**: User-friendly forms organized into tabs:
  - Basics: name, username, bio, system prompt
  - Personality: topics, adjectives, post examples
  - Style: general, chat, and post style guidelines
  - Advanced: plugins and other settings
- **JSON View**: Direct JSON editing with:
  - Syntax validation
  - Error highlighting
  - Export functionality
  - Save button

### Synchronization

- Character selection in header is synced across modes
- Switching between characters updates the build mode editor
- Changes made in build mode are persisted to database
- Creating new character automatically updates selection

## Technical Details

### State Management

- Uses Zustand store (`useChatStore`) for global state
- Mode state is shared across all chat-related components
- Character selection is persisted and synced

### Character Loading

- Characters are loaded from the database on page load
- Selected character is loaded into the editor
- Switching characters triggers editor update
- Creating new character starts with default template

### Character Saving

- Save button validates required fields (name, bio)
- Updates existing character if ID is present
- Creates new character if no ID
- Shows toast notifications for success/error
- Updates global selection after creation

## Integration Points

1. **Character Creator Components**: Reuses existing components from `/components/character-creator/`:
   - `JsonEditor`: JSON editor with validation
   - `CharacterForm`: Form-based character editor

2. **Chat Components**: Uses chat interface styling from `/components/chat/`:
   - Message styling and layout from `ElizaChatInterface`
   - Same fonts, colors, and animations
   - ScrollArea and input components

3. **Character Actions**: Uses existing server actions from `/app/actions/characters.ts`:
   - `createCharacter`: Creates new character
   - `updateCharacter`: Updates existing character

4. **Chat Store**: Central state management for chat features:
   - Room management
   - Character selection
   - Mode switching
   - Entity ID tracking

## Future Enhancements

Potential improvements:

- Auto-save functionality
- Undo/redo for character changes
- Character version history
- Import character from file
- Character templates library
- Real-time preview of character in chat
- Collaborative character building
- Character comparison view
