# UI Components

## Overview

All UI components are built with exact Figma specifications using pixel-perfect measurements extracted via Figma MCP tools.

## Layout Proportions (from Figma)

### Chat Mode
```
Total: 1440px
├── Sidebar: 88px (collapsed) or 255px (expanded)
├── Sessions: 255px
└── Chat: ~930px (flexible)
```

### Build Mode
```
Total: 1440px
├── Sidebar: 88px (collapsed)
├── Chat: ~593px (flexible)
└── Agent DNA Panel: 593px
```

## Component Tree

```
ElizaPageClient
├── ChatHeader
│   ├── Back Button
│   ├── AgentSwitcher (dropdown)
│   └── ModeToggle (Chat/Build)
│
├── [Chat Mode]
│   ├── SessionsSidebar
│   │   ├── Header with "+ New Chat"
│   │   └── Session List (filtered by agent)
│   └── ElizaChatInterface
│
└── [Build Mode]
    ├── ElizaChatInterface
    └── AgentDNAPanel
        ├── Main Tabs (Settings/Model Calls/Memories/Uploads)
        ├── Sub-tabs (General/Content/Style/Avatar)
        ├── JSON Toggle
        └── Export/Save Buttons
```

## Component Details

### ChatHeader
**File**: `components/chat/chat-header.tsx`

**Layout**:
```
[← Back] [Agent Switcher ▼]           [💬 Chat Mode] [<> Build Mode]
```

**Features**:
- Back button navigates to `/dashboard/my-agents`
- Agent switcher shows all available agents
- Mode toggle switches between chat and build
- Exact Figma styling with Roboto Mono font

**Dimensions**:
- Height: `64px`
- Padding: `24px` horizontal
- Border: `1px solid #3e3e43` bottom

### AgentSwitcher
**File**: `components/chat/agent-switcher.tsx`

**Features**:
- Shows currently selected agent with avatar
- Dropdown lists all agents (templates + user's)
- "New Agent" option at top
- Highlights selected agent
- Auto-creates room when switching

**Behavior**:
```typescript
When agent selected:
1. Update selectedCharacterId
2. Clear current room
3. Navigate to new URL with characterId
4. Load rooms for new agent
5. If no rooms → Auto-create first room
6. If has rooms → Show list
```

### SessionsSidebar
**File**: `components/chat/sessions-sidebar.tsx`

**Dimensions**:
- Width: `255px` (exact Figma spec)
- Shrink: `shrink-0` (prevents squeezing)

**Features**:
- Header with "+ New Chat" button
- Filtered list of rooms by URL characterId
- Delete button per session
- "Start Chatting" CTA when empty

**Filtering Logic**:
```typescript
If URL has ?characterId=X:
  → Show only X's rooms
  
If no characterId in URL:
  → Show ALL rooms (default Eliza + others)
```

### AgentDNAPanel
**File**: `components/chat/agent-dna-panel.tsx`

**Dimensions**:
- Width: `593px` (exact Figma spec)
- Shrink: `shrink-0` (prevents squeezing)

**Structure**:
```
┌─────────────────────────────────┐
│ Agent DNA 🧬    [Export] [Save] │
├─────────────────────────────────┤
│ [Settings] [Model] [Mem] [Up]   │ ← Main tabs
├─────────────────────────────────┤
│ [General] [Content] [Style]     │ ← Sub-tabs (Settings)
│                     [Avatar]     │
│                      [JSON 🔘]   │ ← JSON toggle
├─────────────────────────────────┤
│                                  │
│  Name: [___________________]     │
│  Username: [______________]     │
│  System: [________________]     │
│  Voice: [▼ Dropdown______]     │
│  Visibility: [▼ Public___]     │
│                                  │
└─────────────────────────────────┘
```

### ModeToggle
**File**: `components/chat/mode-toggle.tsx`

**Design**:
```
[💬 Chat Mode] [<> Build Mode]
   ↑ active        ↑ inactive
```

**States**:
- **Chat Mode Active**: White text, transparent bg
- **Build Mode Active**: Orange text, `rgba(255,88,0,0.25)` bg
- Border: `1px solid #3e3e43`

## Design Tokens

### Colors (Exact Figma Values)

```css
/* Backgrounds */
--bg-primary: #0a0a0a;
--bg-secondary: #1d1d1d;
--bg-tertiary: #161616;

/* Borders */
--border-primary: #3e3e43;
--border-secondary: #2e2e2e;

/* Text */
--text-primary: #e1e1e1;
--text-secondary: #858585;
--text-tertiary: #727272;

/* Orange Accent */
--accent-orange: #ff5800;
--accent-orange-bg: rgba(255,88,0,0.25);
--accent-orange-hover: rgba(255,88,0,0.3);

/* Status */
--status-active: #22c55d;
--status-inactive: #adadad;
```

### Typography

```css
/* Headings & Labels */
font-family: 'Roboto Mono', monospace;
font-weight: 500 (medium) or 700 (bold);

/* Body Text & Descriptions */
font-family: 'Roboto Flex', sans-serif;
font-weight: 400 (normal);

/* Font Variation Settings (Roboto Flex) */
fontVariationSettings: "'GRAD' 0, 'XOPQ' 96, 'XTRA' 468, 
  'YOPQ' 79, 'YTAS' 750, 'YTDE' -203, 'YTFI' 738, 
  'YTLC' 514, 'YTUC' 712, 'wdth' 100";
```

### Spacing

```css
/* Standard gaps from Figma */
gap-[4px]   /* 4px - tight spacing */
gap-[8px]   /* 8px - small spacing */
gap-[12px]  /* 12px - medium spacing */
gap-[16px]  /* 16px - large spacing */
gap-[24px]  /* 24px - extra large */

/* Padding */
p-[12px]    /* 12px - tight */
p-[16px]    /* 16px - standard */
p-[24px]    /* 24px - comfortable */

/* Component Dimensions */
w-[28px]    /* Icon button container */
w-[255px]   /* Sessions sidebar */
w-[593px]   /* Agent DNA panel */
h-[347px]   /* Agent card image */
h-[64px]    /* Header height */
```

## Responsive Behavior

### Breakpoints

```typescript
// Agent Library Grid
grid-cols-1      // Mobile: 1 column
md:grid-cols-2   // Tablet: 2 columns  
lg:grid-cols-3   // Desktop: 3 columns

// Chat/Build Layouts
// Currently desktop-only
// Mobile: TODO - Convert to full-screen with bottom sheets
```

## Corner Brackets (Brand Element)

Used throughout for visual identity:

```jsx
<div className="absolute top-0 left-0 w-2 h-2">
  <svg width="8" height="8">
    <path d="M8 0L0 0L0 8" stroke="#FF5800" strokeWidth="1"/>
  </svg>
</div>
// Repeat for all 4 corners with rotations
```

## Icon Specifications

### Action Icons (from Figma)
- **Container**: `28x28px` rounded-[8px]
- **Icon**: `18x18px` 
- **Color**: `#adadad` (inactive), `#ffffff` (hover)
- **Padding**: `10px` (center aligned)

### Common Icons
- **MessageSquare** - Chat mode
- **Code/Code2** - Build mode
- **Plus** - New chat/agent
- **ChevronDown** - Dropdown indicators
- **Trash2** - Delete actions
- **ArrowLeft** - Back navigation

## Component Interactions

### Agent Switcher Dropdown

**Open State**:
```
Trigger: Click agent name/avatar
Display: Dropdown menu (280px wide)
Position: Absolute, below trigger
Z-index: 50
Backdrop: Full-screen click-to-close
```

**Dropdown Content**:
```
┌──────────────────────────────┐
│ [+] New Agent                │ ← Top option
├──────────────────────────────┤
│ 🟠 Ember                     │ ← Selected (orange bar)
│    Wellness coach...          │
├──────────────────────────────┤
│    Zilo                      │
│    Marketing...              │
└──────────────────────────────┘
```

### Session Item

**Layout**:
```
[Selected Bar] [Avatar] [Title        ] [Delete]
               [Avatar] [Preview text ] [🗑️]
```

**States**:
- **Normal**: Transparent
- **Hover**: `bg-white/5`
- **Selected**: `bg-white/5` + left orange bar
- **Delete hover**: Red icon

## Accessibility

- All buttons have `title` attributes
- Proper ARIA roles (to be added)
- Keyboard navigation (to be implemented)
- Screen reader support (to be enhanced)

## Performance Optimizations

- `useMemo` for filtered rooms
- Lazy loading of template characters
- Image optimization with Next.js Image
- Virtualized lists (to be added for long session lists)

