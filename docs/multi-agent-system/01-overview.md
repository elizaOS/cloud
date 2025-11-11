# Multi-Agent System - Overview

## What is the Multi-Agent System?

The multi-agent system allows users to create, manage, and interact with multiple AI personalities through a unified interface. Each agent has unique characteristics, conversation styles, and capabilities.

## Key Concepts

### 1. Template Characters

Pre-built AI personalities stored as JSON files in the codebase. Examples:

- **Ember** - Wellness & burnout recovery coach
- **Zilo** - Marketing strategist
- **Pixel** - E-commerce & UX optimizer
- **Luna** - Anime enthusiast
- **Code Mentor** - Programming expert
- **Creative Spark** - Creative writing muse

### 2. Modes

#### Chat Mode

- **Purpose**: Have conversations with agents
- **Layout**: Sessions sidebar (left) + Chat interface (center)
- **Features**:
  - View conversation history
  - Switch between agents
  - Start new chats
  - Delete old conversations

#### Build Mode

- **Purpose**: Configure and test agents simultaneously
- **Layout**: Chat interface (left) + Agent DNA panel (right)
- **Features**:
  - Edit agent properties
  - Test changes in real-time
  - Configure personality, voice, visibility
  - Export/save agent configuration

### 3. Sessions/Rooms

Each conversation with an agent is stored as a "room":

- Unique ID per conversation
- Associated with specific agent
- Contains message history
- Auto-generated title from first message

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   My Agents View                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │
│  │ Ember  │  │  Zilo  │  │ Pixel  │  │  Luna  │        │
│  │ [💬][<>]│  │ [💬][<>]│  │ [💬][<>]│  │ [💬][<>]│        │
│  └────────┘  └────────┘  └────────┘  └────────┘        │
└─────────────────────────────────────────────────────────┘
         💬 Click          <>Click
         │                 │
         ▼                 ▼
┌──────────────────┐  ┌──────────────────────────────────┐
│   Chat Mode      │  │         Build Mode                │
│ ┌──────┬────────┐│  │ ┌────────┬─────────────────────┐│
│ │Recent│ Chat   ││  │ │ Chat   │   Agent DNA Panel   ││
│ │Chats │Messages││  │ │Messages│   ┌──────────────┐  ││
│ │      │        ││  │ │        │   │   Settings   │  ││
│ │Ember │        ││  │ │        │   │  Model Calls │  ││
│ │Chat1 │        ││  │ │        │   │   Memories   │  ││
│ │Zilo  │        ││  │ │        │   │   Uploads    │  ││
│ │Chat1 │        ││  │ │        │   └──────────────┘  ││
│ └──────┴────────┘│  │ └────────┴─────────────────────┘│
└──────────────────┘  └──────────────────────────────────┘
```

## Design Principles

1. **Lazy Loading**: Template characters are only created in the database when users first interact with them
2. **Per-User Instances**: Each user gets their own copy of template characters
3. **Session Isolation**: Each agent's conversations are isolated and filterable
4. **Real-Time Testing**: Build mode allows testing while configuring
5. **Seamless Switching**: Users can switch between agents without losing context

## Core Features

### ✅ Agent Library

- Grid view of all available agents
- Pixel-perfect Figma design implementation
- Visual-first approach with large agent images
- Quick actions: Chat or Build mode

### ✅ Chat Mode

- **Sessions Sidebar (255px)**: List of recent conversations
- **Chat Interface (flexible)**: Full ElizaOS chat functionality
- **Header**: Agent switcher + mode toggle + back button
- **Features**:
  - Filter sessions by agent
  - Create new chats
  - Delete conversations
  - Switch agents seamlessly

### ✅ Build Mode

- **Chat Interface (~593px)**: Test agent while building
- **Agent DNA Panel (593px)**: Configure agent properties
- **Tabs**: Settings, Model Calls, Memories, Uploads
- **Sub-tabs**: General, Content, Style, Avatar
- **JSON Toggle**: Switch to raw JSON editing
- **Actions**: Export and Save buttons

### ✅ Template System

- **Storage**: JSON files in `lib/characters/templates/`
- **Auto-Creation**: First interaction triggers DB creation
- **Single Source of Truth**: Git-versioned character definitions
- **Easy Extension**: Add new JSON file + import

## Benefits

1. **No Database Seeding Required** - Templates exist in codebase
2. **Version Controlled** - Character definitions tracked in Git
3. **Consistent Experience** - All users start with same templates
4. **Easy Customization** - Users can modify their copies
5. **Scalable** - Easy to add new characters

## Current Template Characters

| Name           | Username      | Category  | Featured | Avatar Source              |
| -------------- | ------------- | --------- | -------- | -------------------------- |
| Ember          | ember         | assistant | ✅       | /demo-agents/ember.jpg     |
| Zilo           | zilo          | assistant | ❌       | /demo-agents/zilo.jpg      |
| Pixel          | pixel         | assistant | ❌       | /demo-agents/pixel.jpg     |
| Luna           | luna_anime    | anime     | ❌       | /avatars/luna.png          |
| Code Mentor    | codementor    | assistant | ❌       | /avatars/codementor.png    |
| Creative Spark | creativespark | creative  | ❌       | /avatars/creativespark.png |

## Next Steps

- Read detailed documentation in numbered files
- Review Figma designs for reference
- See [06-adding-characters.md](./06-adding-characters.md) to add new agents
- Check [07-troubleshooting.md](./07-troubleshooting.md) for common issues
