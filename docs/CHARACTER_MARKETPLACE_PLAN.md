# Character Marketplace Implementation Plan

**Document Version:** 1.0
**Created:** October 2025
**Status:** Ready for Implementation
**Target Route:** `/dashboard/eliza`

---

## Executive Summary

This document provides a comprehensive implementation plan for adding a **Character Marketplace** to Eliza Cloud v2, inspired by Character.AI's discovery and interaction model. The marketplace will enable users to discover, preview, and interact with pre-existing template characters alongside their custom-created characters at the `/dashboard/eliza` route.

**Key Objectives:**
1. Create a discoverable character marketplace with filtering, search, and categories
2. Integrate seamlessly with existing ElizaOS agent runtime and character system
3. Provide Character.AI-inspired UI/UX with character cards, previews, and instant interaction
4. Maintain backward compatibility with current character creation workflow
5. Support both template characters (pre-made) and user-created characters

**Feasibility Assessment:** ✅ **HIGHLY FEASIBLE** - All required infrastructure exists, minimal breaking changes needed.

---

## Table of Contents

1. [Character.AI Marketplace Analysis](#character-ai-analysis)
2. [Current System Architecture](#current-architecture)
3. [Existing Infrastructure Analysis](#existing-infrastructure)
4. [Proposed Marketplace Architecture](#proposed-architecture)
5. [Database Schema Changes](#database-changes)
6. [UI/UX Design Specification](#ui-ux-design)
7. [Implementation Phases](#implementation-phases)
8. [API Endpoints](#api-endpoints)
9. [Component Structure](#component-structure)
10. [Feasibility Assessment](#feasibility)
11. [Meaningful Improvements & Innovations](#improvements)
12. [Technical Risks & Mitigation](#risks)
13. [Testing Strategy](#testing)
14. [Timeline & Resource Estimates](#timeline)

---

## <a name="character-ai-analysis"></a>1. Character.AI Marketplace Analysis

### 1.1 Character.AI Platform Features (2025)

Based on research, Character.AI's marketplace includes:

#### **Discovery Mechanisms**

1. **Category-Based Navigation**
   - Assistants, Anime, Creativity & Writing, Entertainment & Gaming
   - History, Humor, Learning, Lifestyle, Parody, RPG & Puzzles
   - Pre-curated collections for easy browsing

2. **Advanced Search & Filters (Aug 2025 Update)**
   - Search by: Relevance, Likes, Popularity, Newest
   - Creator sorting: By popularity, follower count
   - Tag-based filtering (improved tagging system)
   - Scene search (roleplay discovery)

3. **Community Feed**
   - Dynamic scrollable feed aggregating:
     - New characters
     - Popular scenes
     - Stream highlights
     - Creator-driven content
   - React, follow, and start chats directly from feed

#### **Character Presentation**

1. **Character Cards**
   - Character name and avatar/image
   - Brief bio/description
   - Visual style indicators (3D, anime, cyberpunk, etc.)
   - Engagement metrics (likes, chat count)
   - Creator attribution

2. **Character Intro Videos** (Creator Tool, 2025)
   - Custom video introductions for characters
   - Brings characters to life before interaction

3. **Chat Images** (Creator Tool, 2025)
   - Capture special chat moments
   - Share to community feed

#### **Interaction Model**

1. **Instant Chat Initiation**
   - One-click to start conversation from marketplace
   - Persistent conversation history per character
   - Voice interaction support (experimental)

2. **Creator Engagement**
   - Follow creators
   - Discover more characters from same creator
   - Creator updates in feed

#### **UI/UX Characteristics**

1. **Modern, Visual Design**
   - Dark/light mode themes
   - Card-based layout
   - Scrollable feeds
   - Experimental navigation with sidebar

2. **Mobile-Optimized**
   - Responsive design
   - Touch-friendly interactions
   - Mobile app parity

### 1.2 Key Takeaways for Our Implementation

**Must-Have Features:**
- Category-based character organization
- Search with multiple filters (popularity, newest, category)
- Character cards with avatar, bio, metrics
- One-click chat initiation
- Template vs. user-created character distinction

**Nice-to-Have Features:**
- Community feed (future phase)
- Character intro videos (future phase)
- Social features (likes, follows) (future phase)
- Advanced analytics per character

**Our Differentiation:**
- **ElizaOS Runtime Integration:** Full plugin support, voice (ElevenLabs), memory
- **Credit-Based System:** Usage tracking and billing integration
- **Deployment:** Characters can be deployed as containers
- **Enterprise Features:** Organization-level character sharing

---

## <a name="current-architecture"></a>2. Current System Architecture

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Eliza Cloud v2 - Current                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌──────────────────┐         │
│  │ /dashboard/     │         │ /dashboard/      │         │
│  │ character-      │         │ eliza            │         │
│  │ creator         │         │                  │         │
│  ├─────────────────┤         ├──────────────────┤         │
│  │ • Form editor   │         │ • Chat interface │         │
│  │ • JSON editor   │         │ • Room manager   │         │
│  │ • AI assistant  │         │ • Voice (STT/TTS)│         │
│  │ • Load/save     │         │ • Character      │         │
│  │   characters    │         │   selector       │         │
│  └─────────────────┘         │   (dropdown)     │         │
│         │                    └──────────────────┘         │
│         │                             │                    │
│         v                             v                    │
│  ┌──────────────────────────────────────────────┐        │
│  │        Character System (DB + Services)       │        │
│  ├──────────────────────────────────────────────┤        │
│  │ • user_characters table                      │        │
│  │ • is_template, is_public flags               │        │
│  │ • charactersService                          │        │
│  │ • listByUser(), listTemplates()              │        │
│  └──────────────────────────────────────────────┘        │
│                           │                               │
│                           v                               │
│  ┌──────────────────────────────────────────────┐        │
│  │         ElizaOS Agent Runtime                 │        │
│  ├──────────────────────────────────────────────┤        │
│  │ • character-loader.ts                        │        │
│  │ • agent-runtime.ts                           │        │
│  │ • Plugin resolution (ElevenLabs, OpenAI)     │        │
│  │ • Room-based conversations                   │        │
│  │ • Memory management                          │        │
│  └──────────────────────────────────────────────┘        │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 2.2 Current User Flow

**Character Creation:**
1. User visits `/dashboard/character-creator`
2. Creates character via form/JSON editor or AI assistant
3. Saves character (stored with `user_id`, `organization_id`)
4. Character appears in dropdown at `/dashboard/eliza`

**Character Usage:**
1. User visits `/dashboard/eliza`
2. Selects character from dropdown (or uses default)
3. Creates room (conversation)
4. Chats with character using ElizaOS runtime
5. Character's plugins (ElevenLabs voice) activate

### 2.3 Limitations of Current System

**Discovery Issues:**
- No way to discover pre-made template characters
- Dropdown hides character descriptions, personalities
- No visual representation (avatars, images)
- No categorization or filtering
- No preview before selection

**Engagement Issues:**
- Can't browse characters before committing to chat
- No character ratings or popularity metrics
- No way to see what others are creating
- Limited discoverability of organization-shared characters

**UX Issues:**
- Dropdown UI not engaging for character selection
- No preview of character personality/style
- Character switching requires knowing character exists
- No visual feedback on character capabilities (plugins, voice)

---

## <a name="existing-infrastructure"></a>3. Existing Infrastructure Analysis

### 3.1 Database Schema (Current)

**`user_characters` table** (`/db/schemas/user-characters.ts`)

```typescript
{
  id: uuid (primary key)
  organization_id: uuid (FK to organizations)
  user_id: uuid (FK to users)
  name: text (not null)
  username: text (nullable)
  system: text (nullable)
  bio: jsonb (string | string[], not null)
  message_examples: jsonb (default [])
  post_examples: jsonb (default [])
  topics: jsonb (string[], default [])
  adjectives: jsonb (string[], default [])
  knowledge: jsonb (default [])
  plugins: jsonb (string[], default [])
  settings: jsonb (default {})
  secrets: jsonb (default {})
  style: jsonb (default {})
  character_data: jsonb (full character object)

  // ✅ MARKETPLACE-READY FLAGS (Already exist!)
  is_template: boolean (default false)  // System templates
  is_public: boolean (default false)    // User-shared characters

  created_at: timestamp
  updated_at: timestamp
}

Indexes:
- organization_idx
- user_idx
- name_idx
```

**`eliza_room_characters` table** (`/db/schemas/eliza-room-characters.ts`)

```typescript
{
  room_id: uuid (primary key, FK to rooms)
  character_id: uuid (FK to user_characters, cascade delete)
  user_id: uuid (not null)
  created_at: timestamp
  updated_at: timestamp
}
```

**Verdict:** ✅ **EXCELLENT** - `is_template` and `is_public` flags already exist for marketplace functionality!

### 3.2 Repository Layer (Current)

**`UserCharactersRepository`** (`/db/repositories/user-characters.ts`)

```typescript
class UserCharactersRepository {
  findById(id: string)
  listByUser(userId: string)
  listByOrganization(organizationId: string)

  // ✅ MARKETPLACE-READY METHODS
  listPublic()      // Get all is_public=true characters
  listTemplates()   // Get all is_template=true characters

  create(data: NewUserCharacter)
  update(id: string, data: Partial<NewUserCharacter>)
  delete(id: string)
}
```

**Verdict:** ✅ **READY** - Already has `listPublic()` and `listTemplates()` methods!

### 3.3 Service Layer (Current)

**`CharactersService`** (`/lib/services/characters.ts`)

```typescript
class CharactersService {
  getById(id: string)
  getByIdForUser(characterId: string, userId: string)

  listByUser(userId: string, options?: {
    limit?: number;
    includeTemplates?: boolean;  // ✅ Already supports templates!
  })

  listByOrganization(organizationId: string)
  listPublic()      // ✅ Public character support
  listTemplates()   // ✅ Template support

  create(data: NewUserCharacter)
  update(id: string, data: Partial<NewUserCharacter>)
  updateForUser(characterId: string, userId: string, updates)
  delete(id: string)
  deleteForUser(characterId: string, userId: string)

  toElizaCharacter(character: UserCharacter): ElizaCharacter
}
```

**Verdict:** ✅ **EXCELLENT** - Full support for public and template characters already implemented!

### 3.4 Agent Discovery Service (Current)

**`AgentDiscoveryService`** (`/lib/services/agent-discovery.ts`)

```typescript
class AgentDiscoveryService {
  // ✅ MARKETPLACE-LIKE FUNCTIONALITY ALREADY EXISTS!

  listAgents(
    organizationId: string,
    userId: string,
    filters?: {
      deployed?: boolean;
      template?: boolean;   // ✅ Template filtering
      owned?: boolean;
    },
    includeStats?: boolean
  ): Promise<AgentListResult>

  getAgentStatistics(agentId: string): Promise<AgentStats> {
    // Returns: messageCount, lastActiveAt, uptime, status
  }

  invalidateAgentListCache(organizationId: string)
}

interface AgentInfo {
  id: string
  name: string
  bio: string[]
  plugins: string[]
  status: "deployed" | "draft" | "stopped"
  avatarUrl?: string
  messageCount?: number
  lastActiveAt?: Date
  deploymentUrl?: string
  isTemplate?: boolean    // ✅ Template indicator
  ownerId?: string
}
```

**Verdict:** ✅ **AMAZING** - Already has agent discovery with filtering, statistics, and caching!

### 3.5 Integration Points (Current)

**ElizaOS Integration** (`/lib/eliza/`)

```typescript
// character-loader.ts
class CharacterLoaderService {
  loadCharacter(characterId: string): Promise<{
    character: Character;
    plugins: Plugin[];
  }>

  buildCharacter(elizaCharacter: ElizaCharacter): Character
  resolvePlugins(pluginNames: string[]): Plugin[]
}

// agent-runtime.ts
class AgentRuntimeService {
  getRuntimeForCharacter(characterId?: string): Promise<AgentRuntime>
  handleMessage(roomId, entityId, content, characterId?)
}
```

**Chat Interface** (`/components/chat/eliza-chat-interface.tsx` - 965 lines)

```typescript
function ElizaChatInterface({ availableCharacters }) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Character selector dropdown (current implementation)
  <Select
    value={selectedCharacterId || "default"}
    onValueChange={(value) => setSelectedCharacterId(value === "default" ? null : value)}
  >
    <SelectItem value="default">Default (Eliza)</SelectItem>
    {availableCharacters.map((char) => (
      <SelectItem key={char.id} value={char.id!}>{char.name}</SelectItem>
    ))}
  </Select>
}
```

**Verdict:** ✅ **READY** - Character loading and runtime switching fully implemented and tested.

### 3.6 Infrastructure Summary

| Component | Status | Marketplace Readiness | Notes |
|-----------|--------|---------------------|-------|
| **Database Schema** | ✅ Complete | **100%** | `is_template`, `is_public` flags exist |
| **Repository Methods** | ✅ Complete | **100%** | `listPublic()`, `listTemplates()` exist |
| **Service Layer** | ✅ Complete | **95%** | Need filtering/search methods |
| **Agent Discovery** | ✅ Complete | **90%** | Already has discovery + stats |
| **ElizaOS Integration** | ✅ Complete | **100%** | Character loading works perfectly |
| **Chat Interface** | ⚠️ Partial | **40%** | Dropdown exists, needs marketplace UI |
| **Server Actions** | ✅ Complete | **100%** | `listCharacters()` action ready |

**Overall Infrastructure Readiness: 90%** ✅

---

## <a name="proposed-architecture"></a>4. Proposed Marketplace Architecture

### 4.1 Enhanced Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              Eliza Cloud v2 - With Marketplace                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐      │
│  │            /dashboard/eliza (Enhanced)               │      │
│  ├─────────────────────────────────────────────────────┤      │
│  │                                                       │      │
│  │  ┌─────────────────┐         ┌──────────────────┐  │      │
│  │  │ CHARACTER       │         │ CHAT INTERFACE   │  │      │
│  │  │ MARKETPLACE     │  ═════> │                  │  │      │
│  │  ├─────────────────┤         │ • Active chat    │  │      │
│  │  │ • Category tabs │         │ • Voice          │  │      │
│  │  │ • Search bar    │         │ • Messages       │  │      │
│  │  │ • Filter chips  │         │ • Room history   │  │      │
│  │  │ • Character grid│         └──────────────────┘  │      │
│  │  │ • Card preview  │                                │      │
│  │  │ • Quick actions │                                │      │
│  │  └─────────────────┘                                │      │
│  │                                                       │      │
│  └─────────────────────────────────────────────────────┘      │
│                            │                                    │
│                            v                                    │
│  ┌──────────────────────────────────────────────────┐         │
│  │        Enhanced Services & API                    │         │
│  ├──────────────────────────────────────────────────┤         │
│  │ GET /api/marketplace/characters                  │         │
│  │   ?category=&search=&sort=&filter=               │         │
│  │                                                   │         │
│  │ GET /api/marketplace/categories                  │         │
│  │                                                   │         │
│  │ GET /api/marketplace/characters/:id/stats        │         │
│  │                                                   │         │
│  │ POST /api/marketplace/characters/:id/clone       │         │
│  │                                                   │         │
│  │ POST /api/marketplace/characters/:id/interact    │         │
│  └──────────────────────────────────────────────────┘         │
│                            │                                    │
│                            v                                    │
│  ┌──────────────────────────────────────────────────┐         │
│  │        Existing Infrastructure (Reused)           │         │
│  ├──────────────────────────────────────────────────┤         │
│  │ • user_characters table (is_template, is_public) │         │
│  │ • charactersService                              │         │
│  │ • agentDiscoveryService                          │         │
│  │ • ElizaOS runtime                                │         │
│  └──────────────────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Hierarchy

```
ElizaPageClient (existing)
├── ElizaChatInterface (existing - modified)
│   ├── CharacterMarketplace (NEW)
│   │   ├── MarketplaceHeader (NEW)
│   │   │   ├── SearchBar (NEW)
│   │   │   ├── ViewToggle (grid/list) (NEW)
│   │   │   └── CreateCharacterButton (existing)
│   │   ├── CategoryTabs (NEW)
│   │   │   └── CategoryTab[] (NEW)
│   │   ├── FilterBar (NEW)
│   │   │   ├── SortDropdown (NEW)
│   │   │   ├── FilterChip[] (NEW)
│   │   │   └── ClearFilters (NEW)
│   │   └── CharacterGrid (NEW)
│   │       └── CharacterCard[] (NEW)
│   │           ├── CharacterAvatar (NEW)
│   │           ├── CharacterInfo (NEW)
│   │           ├── CharacterStats (NEW)
│   │           ├── CharacterTags (NEW)
│   │           └── CharacterActions (NEW)
│   └── ChatWindow (existing)
│       ├── MessagesList (existing)
│       ├── InputArea (existing)
│       └── VoiceControls (existing)
```

### 4.3 State Management

```typescript
// Marketplace State
interface MarketplaceState {
  // Characters
  characters: ExtendedCharacter[];
  filteredCharacters: ExtendedCharacter[];
  selectedCharacter: ExtendedCharacter | null;

  // UI State
  view: 'grid' | 'list';
  activeCategory: string | null;
  searchQuery: string;
  sortBy: 'popularity' | 'newest' | 'name' | 'updated';
  filters: {
    hasVoice: boolean;
    deployed: boolean;
    template: boolean;
    myCharacters: boolean;
  };

  // Loading States
  isLoading: boolean;
  isLoadingStats: boolean;
}

// Extended Character (with marketplace data)
interface ExtendedCharacter extends ElizaCharacter {
  id: string;
  isTemplate: boolean;
  isPublic: boolean;
  creatorName?: string;
  creatorId?: string;
  avatarUrl?: string;

  // Statistics (from agentDiscoveryService)
  stats?: {
    messageCount: number;
    lastActiveAt: Date | null;
    deploymentStatus: 'deployed' | 'draft' | 'stopped';
    roomCount: number;
  };

  // Marketplace Metadata
  category?: string;
  tags?: string[];
  featured?: boolean;
  popularity?: number;
}
```

---

## <a name="database-changes"></a>5. Database Schema Changes

### 5.1 Required Schema Additions

**Option 1: Add columns to existing `user_characters` table** (RECOMMENDED)

```sql
-- Migration: Add marketplace fields to user_characters
ALTER TABLE user_characters
  ADD COLUMN avatar_url TEXT,
  ADD COLUMN category TEXT,
  ADD COLUMN tags JSONB DEFAULT '[]',
  ADD COLUMN featured BOOLEAN DEFAULT false,
  ADD COLUMN view_count INTEGER DEFAULT 0,
  ADD COLUMN interaction_count INTEGER DEFAULT 0,
  ADD COLUMN popularity_score INTEGER DEFAULT 0;

-- Add indexes for marketplace queries
CREATE INDEX user_characters_category_idx ON user_characters(category);
CREATE INDEX user_characters_featured_idx ON user_characters(featured) WHERE featured = true;
CREATE INDEX user_characters_is_template_idx ON user_characters(is_template) WHERE is_template = true;
CREATE INDEX user_characters_is_public_idx ON user_characters(is_public) WHERE is_public = true;
CREATE INDEX user_characters_popularity_idx ON user_characters(popularity_score DESC);
```

**Schema additions:**
```typescript
export const userCharacters = pgTable(
  "user_characters",
  {
    // ... existing fields ...

    // NEW: Marketplace fields
    avatar_url: text("avatar_url"),
    category: text("category"), // e.g., "Assistant", "Anime", "Gaming"
    tags: jsonb("tags").$type<string[]>().default([]),
    featured: boolean("featured").default(false).notNull(),
    view_count: integer("view_count").default(0).notNull(),
    interaction_count: integer("interaction_count").default(0).notNull(),
    popularity_score: integer("popularity_score").default(0).notNull(),
  },
  (table) => ({
    // ... existing indexes ...

    // NEW: Marketplace indexes
    category_idx: index("user_characters_category_idx").on(table.category),
    featured_idx: index("user_characters_featured_idx").on(table.featured).where(sql`${table.featured} = true`),
    template_idx: index("user_characters_is_template_idx").on(table.is_template).where(sql`${table.is_template} = true`),
    public_idx: index("user_characters_is_public_idx").on(table.is_public).where(sql`${table.is_public} = true`),
    popularity_idx: index("user_characters_popularity_idx").on(table.popularity_score).desc(),
  }),
);
```

**Option 2: Create separate `character_marketplace` table** (Over-engineering, not recommended)

This would normalize marketplace-specific data but adds complexity. Since we already have `is_template` and `is_public` flags, Option 1 is better.

**Verdict:** ✅ **Go with Option 1** - Simple, efficient, backward compatible.

### 5.2 Categories Definition

```typescript
// /lib/constants/character-categories.ts
export const CHARACTER_CATEGORIES = {
  ASSISTANT: {
    id: 'assistant',
    name: 'Assistants',
    description: 'Helpful AI assistants for productivity and support',
    icon: '🤖',
    color: 'blue',
  },
  ANIME: {
    id: 'anime',
    name: 'Anime & Manga',
    description: 'Characters from anime, manga, and Japanese culture',
    icon: '🎌',
    color: 'pink',
  },
  CREATIVE: {
    id: 'creative',
    name: 'Creativity & Writing',
    description: 'Creative partners for writing, brainstorming, and art',
    icon: '✍️',
    color: 'purple',
  },
  GAMING: {
    id: 'gaming',
    name: 'Gaming & RPG',
    description: 'Game characters, dungeon masters, and RPG companions',
    icon: '🎮',
    color: 'green',
  },
  LEARNING: {
    id: 'learning',
    name: 'Learning & Education',
    description: 'Teachers, tutors, and educational companions',
    icon: '📚',
    color: 'orange',
  },
  ENTERTAINMENT: {
    id: 'entertainment',
    name: 'Entertainment',
    description: 'Fun, humor, and entertainment characters',
    icon: '🎭',
    color: 'red',
  },
  HISTORY: {
    id: 'history',
    name: 'Historical Figures',
    description: 'Historical personalities and period characters',
    icon: '🏛️',
    color: 'amber',
  },
  LIFESTYLE: {
    id: 'lifestyle',
    name: 'Lifestyle & Wellness',
    description: 'Health, fitness, wellness, and lifestyle coaches',
    icon: '🌿',
    color: 'teal',
  },
} as const;

export type CategoryId = keyof typeof CHARACTER_CATEGORIES;

export const CATEGORY_ORDER: CategoryId[] = [
  'ASSISTANT',
  'ANIME',
  'CREATIVE',
  'GAMING',
  'LEARNING',
  'ENTERTAINMENT',
  'HISTORY',
  'LIFESTYLE',
];
```

### 5.3 Migration Script

```typescript
// /db/migrations/XXXX_add_character_marketplace_fields.ts
import { sql } from 'drizzle-orm';
import { db } from '../client';

export async function up() {
  await db.execute(sql`
    ALTER TABLE user_characters
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_characters_category_idx ON user_characters(category);
    CREATE INDEX IF NOT EXISTS user_characters_featured_idx ON user_characters(featured) WHERE featured = true;
    CREATE INDEX IF NOT EXISTS user_characters_is_template_idx ON user_characters(is_template) WHERE is_template = true;
    CREATE INDEX IF NOT EXISTS user_characters_is_public_idx ON user_characters(is_public) WHERE is_public = true;
    CREATE INDEX IF NOT EXISTS user_characters_popularity_idx ON user_characters(popularity_score DESC);
  `);
}

export async function down() {
  await db.execute(sql`
    DROP INDEX IF EXISTS user_characters_category_idx;
    DROP INDEX IF EXISTS user_characters_featured_idx;
    DROP INDEX IF EXISTS user_characters_is_template_idx;
    DROP INDEX IF EXISTS user_characters_is_public_idx;
    DROP INDEX IF EXISTS user_characters_popularity_idx;
  `);

  await db.execute(sql`
    ALTER TABLE user_characters
      DROP COLUMN IF EXISTS avatar_url,
      DROP COLUMN IF EXISTS category,
      DROP COLUMN IF EXISTS tags,
      DROP COLUMN IF EXISTS featured,
      DROP COLUMN IF EXISTS view_count,
      DROP COLUMN IF EXISTS interaction_count,
      DROP COLUMN IF EXISTS popularity_score;
  `);
}
```

---

## <a name="ui-ux-design"></a>6. UI/UX Design Specification

### 6.1 Layout Structure (Character.AI Inspired)

```
┌─────────────────────────────────────────────────────────────────┐
│ /dashboard/eliza                                                │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┬─────────────────────────────────┐  │
│ │ CHARACTER MARKETPLACE   │ ACTIVE CHAT                     │  │
│ │ (Collapsible Sidebar)   │                                 │  │
│ │                         │                                 │  │
│ │ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │  │
│ │ │ [Search...]      🔍 │ │ │ Character: Eliza             │ │  │
│ │ │ [Grid][List] [+ New]│ │ │ Room: #abc123                │ │  │
│ │ └─────────────────────┘ │ │ Status: 🟢 Active            │ │  │
│ │                         │ └─────────────────────────────┘ │  │
│ │ ┌─────────────────────┐ │                                 │  │
│ │ │ [All][Anime][Gaming]│ │ ┌─────────────────────────────┐ │  │
│ │ │ [Creative][Learning]│ │ │ Messages (scrollable)       │ │  │
│ │ └─────────────────────┘ │ │                             │ │  │
│ │                         │ │ User: Hello!                │ │  │
│ │ Sort: [Popularity ▼]    │ │ Eliza: Hi there! ...        │ │  │
│ │ Filter: [Voice][Deploy] │ │                             │ │  │
│ │                         │ │                             │ │  │
│ │ ┌─────────────────────┐ │ └─────────────────────────────┘ │  │
│ │ │ CHARACTER CARD      │ │                                 │  │
│ │ │ ┌─────┐             │ │ ┌─────────────────────────────┐ │  │
│ │ │ │ IMG │ Character 1 │ │ │ [Type message...]      🎤📎 │ │  │
│ │ │ │     │ Assistant   │ │ └─────────────────────────────┘ │  │
│ │ │ └─────┘ 🎵 voice    │ │                                 │  │
│ │ │ "A friendly AI..."  │ │                                 │  │
│ │ │ 💬 1.2k  ⏱️ 2h ago  │ │                                 │  │
│ │ │ [Chat] [Clone]      │ │                                 │  │
│ │ └─────────────────────┘ │                                 │  │
│ │                         │                                 │  │
│ │ [More cards...]         │                                 │  │
│ │                         │                                 │  │
│ └─────────────────────────┴─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Character Card Design

```
┌───────────────────────────────────────┐
│ CHARACTER CARD                        │
├───────────────────────────────────────┤
│  ┌─────────┐                          │
│  │         │  Character Name           │
│  │ Avatar  │  @username               │
│  │  Image  │  🎭 Category              │
│  │         │  🔊 ElevenLabs Voice      │
│  └─────────┘  🚀 Deployed              │
│                                       │
│  Bio: "A friendly AI assistant..."    │
│                                       │
│  Topics: [Coding] [Help] [Learning]  │
│                                       │
│  ────────────────────────────────    │
│  📊 Stats:                            │
│    💬 1,234 chats                     │
│    ⏱️ Active 2h ago                   │
│    ⭐ 95% satisfaction                │
│                                       │
│  ────────────────────────────────    │
│  [💬 Start Chat] [📋 Clone] [ℹ️ Info] │
└───────────────────────────────────────┘
```

### 6.3 UI Components Specification

#### **MarketplaceHeader Component**

```typescript
// /components/marketplace/marketplace-header.tsx
<div className="flex items-center justify-between gap-4 p-4 border-b">
  {/* Search Bar */}
  <div className="flex-1 max-w-md">
    <Input
      placeholder="Search characters..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full"
      icon={<Search className="h-4 w-4" />}
    />
  </div>

  {/* View Toggle */}
  <div className="flex gap-2">
    <Button
      variant={view === 'grid' ? 'default' : 'ghost'}
      size="sm"
      onClick={() => setView('grid')}
    >
      <LayoutGrid className="h-4 w-4" />
    </Button>
    <Button
      variant={view === 'list' ? 'default' : 'ghost'}
      size="sm"
      onClick={() => setView('list')}
    >
      <List className="h-4 w-4" />
    </Button>
  </div>

  {/* Create Character Button */}
  <Button onClick={() => router.push('/dashboard/character-creator')}>
    <Plus className="h-4 w-4 mr-2" />
    Create Character
  </Button>
</div>
```

#### **CategoryTabs Component**

```typescript
// /components/marketplace/category-tabs.tsx
<Tabs value={activeCategory || 'all'} onValueChange={setActiveCategory}>
  <TabsList className="w-full justify-start overflow-x-auto">
    <TabsTrigger value="all">
      <Sparkles className="h-4 w-4 mr-2" />
      All Characters
    </TabsTrigger>
    {CATEGORY_ORDER.map((catKey) => {
      const cat = CHARACTER_CATEGORIES[catKey];
      return (
        <TabsTrigger key={cat.id} value={cat.id}>
          <span className="mr-2">{cat.icon}</span>
          {cat.name}
        </TabsTrigger>
      );
    })}
  </TabsList>
</Tabs>
```

#### **FilterBar Component**

```typescript
// /components/marketplace/filter-bar.tsx
<div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30">
  {/* Sort Dropdown */}
  <Select value={sortBy} onValueChange={setSortBy}>
    <SelectTrigger className="w-40">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="popularity">
        <TrendingUp className="h-4 w-4 mr-2" />
        Most Popular
      </SelectItem>
      <SelectItem value="newest">
        <Clock className="h-4 w-4 mr-2" />
        Newest First
      </SelectItem>
      <SelectItem value="name">
        <SortAsc className="h-4 w-4 mr-2" />
        Name A-Z
      </SelectItem>
      <SelectItem value="updated">
        <RefreshCw className="h-4 w-4 mr-2" />
        Recently Updated
      </SelectItem>
    </SelectContent>
  </Select>

  {/* Filter Chips */}
  <div className="flex gap-2 flex-wrap">
    <Badge
      variant={filters.hasVoice ? 'default' : 'outline'}
      className="cursor-pointer"
      onClick={() => toggleFilter('hasVoice')}
    >
      <Volume2 className="h-3 w-3 mr-1" />
      Has Voice
    </Badge>
    <Badge
      variant={filters.deployed ? 'default' : 'outline'}
      className="cursor-pointer"
      onClick={() => toggleFilter('deployed')}
    >
      <Rocket className="h-3 w-3 mr-1" />
      Deployed
    </Badge>
    <Badge
      variant={filters.template ? 'default' : 'outline'}
      className="cursor-pointer"
      onClick={() => toggleFilter('template')}
    >
      <Star className="h-3 w-3 mr-1" />
      Templates
    </Badge>
    <Badge
      variant={filters.myCharacters ? 'default' : 'outline'}
      className="cursor-pointer"
      onClick={() => toggleFilter('myCharacters')}
    >
      <User className="h-3 w-3 mr-1" />
      My Characters
    </Badge>
  </div>

  {/* Clear Filters */}
  {hasActiveFilters && (
    <Button variant="ghost" size="sm" onClick={clearAllFilters}>
      <X className="h-4 w-4 mr-2" />
      Clear All
    </Button>
  )}
</div>
```

#### **CharacterCard Component**

```typescript
// /components/marketplace/character-card.tsx
<Card className="overflow-hidden hover:shadow-lg transition-shadow">
  <CardContent className="p-0">
    {/* Character Avatar */}
    <div className="relative h-48 bg-gradient-to-br from-primary/20 to-secondary/20">
      {character.avatarUrl ? (
        <Image
          src={character.avatarUrl}
          alt={character.name}
          fill
          className="object-cover"
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <Bot className="h-20 w-20 text-muted-foreground" />
        </div>
      )}

      {/* Status Badges */}
      <div className="absolute top-2 right-2 flex gap-2">
        {character.isTemplate && (
          <Badge variant="secondary" className="backdrop-blur-sm">
            <Star className="h-3 w-3 mr-1" />
            Template
          </Badge>
        )}
        {character.stats?.deploymentStatus === 'deployed' && (
          <Badge variant="default" className="backdrop-blur-sm">
            <Rocket className="h-3 w-3 mr-1" />
            Live
          </Badge>
        )}
      </div>
    </div>

    {/* Character Info */}
    <div className="p-4 space-y-3">
      {/* Name & Category */}
      <div>
        <h3 className="font-semibold text-lg truncate">{character.name}</h3>
        {character.username && (
          <p className="text-sm text-muted-foreground">@{character.username}</p>
        )}
        {character.category && (
          <Badge variant="outline" className="mt-1">
            {CHARACTER_CATEGORIES[character.category]?.icon} {CHARACTER_CATEGORIES[character.category]?.name}
          </Badge>
        )}
      </div>

      {/* Bio */}
      <p className="text-sm text-muted-foreground line-clamp-2">
        {Array.isArray(character.bio) ? character.bio[0] : character.bio}
      </p>

      {/* Features */}
      <div className="flex flex-wrap gap-2">
        {character.plugins?.includes('@elizaos/plugin-elevenlabs') && (
          <Badge variant="secondary" className="text-xs">
            <Volume2 className="h-3 w-3 mr-1" />
            Voice
          </Badge>
        )}
        {character.topics?.slice(0, 2).map((topic) => (
          <Badge key={topic} variant="outline" className="text-xs">
            {topic}
          </Badge>
        ))}
      </div>

      {/* Stats */}
      {character.stats && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {character.stats.messageCount > 1000
              ? `${(character.stats.messageCount / 1000).toFixed(1)}k`
              : character.stats.messageCount}
          </span>
          {character.stats.lastActiveAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(character.stats.lastActiveAt, { addSuffix: true })}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          className="flex-1"
          onClick={() => onStartChat(character)}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Chat
        </Button>
        <Button
          variant="outline"
          onClick={() => onCloneCharacter(character)}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onViewDetails(character)}
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </CardContent>
</Card>
```

### 6.4 Responsive Design

**Desktop (>1024px):**
- Marketplace sidebar: 400px width, scrollable
- Chat area: Remaining space
- Character grid: 2 columns in marketplace

**Tablet (768px - 1024px):**
- Marketplace sidebar: 350px width
- Chat area: Remaining space
- Character grid: 1-2 columns

**Mobile (<768px):**
- Marketplace and chat as separate tabs/views
- Marketplace takes full width when active
- Character cards: 1 column, full width
- Bottom navigation for switching views

### 6.5 Animations & Transitions

```typescript
// Card hover effect
.character-card {
  transition: all 0.3s ease;
}
.character-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
}

// Category tab slide
.category-tabs {
  scroll-behavior: smooth;
}

// Marketplace toggle
.marketplace-sidebar {
  transition: transform 0.3s ease-out;
}
.marketplace-sidebar.collapsed {
  transform: translateX(-100%);
}

// Character card entrance
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.character-card {
  animation: slideUp 0.4s ease-out;
  animation-fill-mode: both;
}
.character-card:nth-child(1) { animation-delay: 0s; }
.character-card:nth-child(2) { animation-delay: 0.1s; }
.character-card:nth-child(3) { animation-delay: 0.2s; }
```

---

## <a name="implementation-phases"></a>7. Implementation Phases

### Phase 1: Foundation (Week 1-2) - 40 hours

**Goal:** Database, API, and core services for marketplace

#### Tasks:
1. **Database Migration** (4 hours)
   - Create migration file for marketplace fields
   - Add indexes for performance
   - Test migration up/down
   - Run migration in development

2. **Update Schema Types** (2 hours)
   - Update `user-characters.ts` schema
   - Regenerate Drizzle types
   - Update TypeScript interfaces

3. **Enhance Repository Layer** (6 hours)
   - Add `search()` method with filters
   - Add `incrementViewCount()` method
   - Add `incrementInteractionCount()` method
   - Add `getPopularCharacters()` method
   - Add `getFeaturedCharacters()` method
   - Write unit tests

4. **Create Marketplace Service** (8 hours)
   - Create `/lib/services/marketplace.ts`
   - Implement search with filters, sorting
   - Integrate with agentDiscoveryService for stats
   - Add caching strategy
   - Write comprehensive tests

5. **Build API Endpoints** (12 hours)
   - `GET /api/marketplace/characters` (main endpoint)
   - `GET /api/marketplace/categories`
   - `GET /api/marketplace/characters/:id/stats`
   - `POST /api/marketplace/characters/:id/clone`
   - `POST /api/marketplace/characters/:id/track-view`
   - Add rate limiting
   - Write API tests

6. **Create Character Categories** (4 hours)
   - Define category constants
   - Create category icons/colors
   - Add category validation
   - Write migration to populate template categories

7. **Seed Template Characters** (4 hours)
   - Create 20-30 template characters across categories
   - Add avatars (placeholder or generate)
   - Set appropriate metadata
   - Mark as `is_template = true`

**Deliverables:**
- ✅ Database schema with marketplace fields
- ✅ Full API for marketplace operations
- ✅ MarketplaceService with search/filter/sort
- ✅ 20-30 seeded template characters
- ✅ Comprehensive tests

---

### Phase 2: UI Components (Week 3-4) - 48 hours

**Goal:** Build all marketplace UI components

#### Tasks:
1. **Character Card Component** (8 hours)
   - Design card layout
   - Implement avatar display
   - Add stats display
   - Add action buttons (Chat, Clone, Info)
   - Add hover effects
   - Make responsive
   - Write Storybook stories

2. **Character Grid Component** (4 hours)
   - Grid layout with responsive columns
   - Infinite scroll or pagination
   - Loading skeletons
   - Empty state
   - Grid/List view toggle

3. **Marketplace Header** (6 hours)
   - Search bar with debounce
   - View toggle (grid/list)
   - Create character button
   - Responsive design

4. **Category Tabs** (6 hours)
   - Scrollable tab list
   - Category icons and names
   - Active state styling
   - Click navigation
   - Mobile-friendly

5. **Filter Bar** (8 hours)
   - Sort dropdown (popularity, newest, name, updated)
   - Filter chips (voice, deployed, templates, mine)
   - Active filter badges
   - Clear all filters
   - URL sync for filters

6. **Character Details Modal** (8 hours)
   - Full character information
   - Extended stats
   - Creator information
   - Chat history preview
   - Clone button
   - Share button
   - Accessibility (keyboard navigation)

7. **Marketplace Sidebar Container** (6 hours)
   - Collapsible sidebar
   - Toggle button
   - Smooth transitions
   - Persist open/closed state
   - Responsive behavior

8. **Empty States** (2 hours)
   - No characters found
   - No search results
   - Category empty
   - Loading states

**Deliverables:**
- ✅ Complete set of marketplace UI components
- ✅ Storybook documentation
- ✅ Responsive across devices
- ✅ Accessible (WCAG AA)

---

### Phase 3: Integration (Week 5) - 32 hours

**Goal:** Integrate marketplace with existing chat interface

#### Tasks:
1. **Modify ElizaChatInterface** (12 hours)
   - Add marketplace sidebar to layout
   - Refactor character selection logic
   - Handle character selection from marketplace
   - Maintain existing dropdown as fallback
   - Test character switching

2. **Implement Chat Initialization** (8 hours)
   - "Start Chat" from marketplace card
   - Create room with selected character
   - Load character runtime
   - Switch to chat view
   - Show character info in chat header

3. **Character Cloning** (6 hours)
   - Clone character to user's library
   - Deep copy all character fields
   - Mark as user-created (not template)
   - Navigate to character editor
   - Show success toast

4. **Stats Tracking** (4 hours)
   - Increment view count on card view
   - Increment interaction count on chat start
   - Update popularity score (algorithm)
   - Cache invalidation

5. **Testing & Bug Fixes** (2 hours)
   - End-to-end tests
   - Cross-browser testing
   - Mobile testing
   - Fix discovered issues

**Deliverables:**
- ✅ Fully integrated marketplace in `/dashboard/eliza`
- ✅ Seamless character selection and chat
- ✅ Character cloning working
- ✅ Stats tracking functional

---

### Phase 4: Polish & Optimization (Week 6) - 24 hours

**Goal:** Performance, UX enhancements, and edge cases

#### Tasks:
1. **Performance Optimization** (8 hours)
   - Implement React.memo for cards
   - Virtualize character grid (react-window)
   - Optimize image loading (lazy loading, blur-up)
   - Minimize API calls
   - Add request caching
   - Profile and optimize renders

2. **Search Enhancements** (6 hours)
   - Fuzzy search with Fuse.js
   - Search highlighting
   - Recent searches
   - Search suggestions
   - Keyboard shortcuts (Cmd+K)

3. **UX Improvements** (6 hours)
   - Onboarding tour for new users
   - Tooltip explanations
   - Better loading states
   - Error boundaries
   - Toast notifications for actions
   - Keyboard navigation

4. **Documentation** (4 hours)
   - Update README with marketplace
   - Add user guide
   - Document API endpoints
   - Create video demo

**Deliverables:**
- ✅ Optimized performance (<2s load time)
- ✅ Enhanced search experience
- ✅ Smooth UX with helpful guidance
- ✅ Complete documentation

---

### Phase 5: Advanced Features (Optional - Week 7-8) - 40 hours

**Goal:** Community features and analytics

#### Tasks:
1. **Character Analytics Dashboard** (12 hours)
   - View count over time
   - Interaction trends
   - User satisfaction (ratings)
   - Popular topics
   - Export analytics

2. **Social Features** (16 hours)
   - Like/favorite characters
   - Character ratings and reviews
   - Follow creators
   - Share characters (public URLs)
   - Report inappropriate characters

3. **Featured Characters System** (6 hours)
   - Admin interface to feature characters
   - Rotation algorithm
   - Featured banner in marketplace
   - Analytics for featured characters

4. **Character Recommendations** (6 hours)
   - "You might also like" based on:
     - Interaction history
     - Similar topics
     - Popular in category
   - Collaborative filtering

**Deliverables:**
- ✅ Analytics dashboard
- ✅ Social engagement features
- ✅ Intelligent recommendations

---

## <a name="api-endpoints"></a>8. API Endpoints Specification

### 8.1 Core Marketplace Endpoints

#### **GET /api/marketplace/characters**

Fetch characters with filtering, sorting, and pagination.

**Query Parameters:**
```typescript
{
  // Search
  search?: string;                    // Search in name, bio, topics

  // Filters
  category?: CategoryId;              // Filter by category
  hasVoice?: boolean;                 // Has ElevenLabs plugin
  deployed?: boolean;                 // Has active deployment
  template?: boolean;                 // System templates only
  myCharacters?: boolean;             // User's own characters
  public?: boolean;                   // Public characters

  // Sorting
  sortBy?: 'popularity' | 'newest' | 'name' | 'updated';
  order?: 'asc' | 'desc';

  // Pagination
  page?: number;                      // Default: 1
  limit?: number;                     // Default: 20, Max: 50

  // Stats
  includeStats?: boolean;             // Include usage statistics
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    characters: ExtendedCharacter[],
    pagination: {
      page: number,
      limit: number,
      total: number,
      totalPages: number,
      hasMore: boolean,
    },
    filters: {
      appliedFilters: FilterState,
      availableCategories: Category[],
    }
  },
  cached: boolean,
}
```

**Implementation:**
```typescript
// /app/api/marketplace/characters/route.ts
export async function GET(request: Request) {
  const user = await requireAuth();
  const { searchParams } = new URL(request.url);

  const filters = {
    search: searchParams.get('search') || undefined,
    category: searchParams.get('category') || undefined,
    hasVoice: searchParams.get('hasVoice') === 'true',
    deployed: searchParams.get('deployed') === 'true',
    template: searchParams.get('template') === 'true',
    myCharacters: searchParams.get('myCharacters') === 'true',
    public: searchParams.get('public') === 'true',
  };

  const sortOptions = {
    sortBy: (searchParams.get('sortBy') || 'popularity') as SortBy,
    order: (searchParams.get('order') || 'desc') as 'asc' | 'desc',
  };

  const pagination = {
    page: parseInt(searchParams.get('page') || '1'),
    limit: Math.min(parseInt(searchParams.get('limit') || '20'), 50),
  };

  const includeStats = searchParams.get('includeStats') === 'true';

  const result = await marketplaceService.searchCharacters({
    userId: user.id,
    organizationId: user.organization_id,
    filters,
    sortOptions,
    pagination,
    includeStats,
  });

  return NextResponse.json(result);
}
```

#### **GET /api/marketplace/categories**

Get all available categories with character counts.

**Response:**
```typescript
{
  success: true,
  data: {
    categories: Array<{
      id: string,
      name: string,
      description: string,
      icon: string,
      color: string,
      characterCount: number,
      featured: boolean,
    }>
  }
}
```

#### **GET /api/marketplace/characters/:id/stats**

Get detailed statistics for a specific character.

**Response:**
```typescript
{
  success: true,
  data: {
    characterId: string,
    stats: {
      messageCount: number,
      roomCount: number,
      viewCount: number,
      interactionCount: number,
      popularityScore: number,
      lastActiveAt: Date | null,
      deploymentStatus: 'deployed' | 'draft' | 'stopped',
      averageSessionDuration: number,
      topTopics: string[],
    }
  }
}
```

#### **POST /api/marketplace/characters/:id/clone**

Clone a character to user's library.

**Request Body:**
```typescript
{
  name?: string,  // Optional: rename cloned character
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    character: ExtendedCharacter,
    message: 'Character cloned successfully',
  }
}
```

#### **POST /api/marketplace/characters/:id/track-view**

Track character view (increment view count).

**Response:**
```typescript
{
  success: true,
  data: {
    viewCount: number,
  }
}
```

#### **POST /api/marketplace/characters/:id/track-interaction**

Track character interaction (increment interaction count).

**Response:**
```typescript
{
  success: true,
  data: {
    interactionCount: number,
  }
}
```

### 8.2 Marketplace Service Implementation

```typescript
// /lib/services/marketplace.ts
import { userCharactersRepository } from '@/db/repositories';
import { agentDiscoveryService } from './agent-discovery';
import { marketplaceCache } from '@/lib/cache/marketplace-cache';
import type { ExtendedCharacter, SearchFilters, SortOptions, PaginationOptions } from '@/lib/types/marketplace';

export class MarketplaceService {
  /**
   * Search characters with filters, sorting, and pagination
   */
  async searchCharacters(options: {
    userId: string;
    organizationId: string;
    filters: SearchFilters;
    sortOptions: SortOptions;
    pagination: PaginationOptions;
    includeStats: boolean;
  }) {
    const { userId, organizationId, filters, sortOptions, pagination, includeStats } = options;

    // Check cache
    const cacheKey = this.generateCacheKey(options);
    const cached = await marketplaceCache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Build query
    let query = this.buildCharacterQuery(filters, userId, organizationId);

    // Apply sorting
    query = this.applySorting(query, sortOptions);

    // Execute query with pagination
    const offset = (pagination.page - 1) * pagination.limit;
    const [characters, total] = await Promise.all([
      query.limit(pagination.limit).offset(offset),
      this.getTotalCount(filters, userId, organizationId),
    ]);

    // Enrich with statistics if requested
    let enrichedCharacters = characters;
    if (includeStats) {
      enrichedCharacters = await Promise.all(
        characters.map(async (char) => {
          const stats = await agentDiscoveryService.getAgentStatistics(char.id);
          return { ...char, stats };
        })
      );
    }

    const result = {
      characters: enrichedCharacters,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
        hasMore: offset + characters.length < total,
      },
      filters: {
        appliedFilters: filters,
        availableCategories: await this.getAvailableCategories(),
      },
      cached: false,
    };

    // Cache result
    await marketplaceCache.set(cacheKey, result, 300); // 5 minute TTL

    return result;
  }

  /**
   * Clone character to user's library
   */
  async cloneCharacter(characterId: string, userId: string, organizationId: string, options?: { name?: string }) {
    const sourceCharacter = await userCharactersRepository.findById(characterId);

    if (!sourceCharacter) {
      throw new Error('Character not found');
    }

    // Check if character is cloneable (template or public)
    if (!sourceCharacter.is_template && !sourceCharacter.is_public) {
      throw new Error('Character is not available for cloning');
    }

    // Create cloned character
    const clonedData = {
      ...sourceCharacter,
      id: undefined, // Generate new ID
      user_id: userId,
      organization_id: organizationId,
      name: options?.name || `${sourceCharacter.name} (Copy)`,
      is_template: false,
      is_public: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const clonedCharacter = await userCharactersRepository.create(clonedData);

    // Invalidate caches
    await this.invalidateUserCache(userId);

    return clonedCharacter;
  }

  /**
   * Track character view
   */
  async trackView(characterId: string) {
    await userCharactersRepository.incrementViewCount(characterId);
  }

  /**
   * Track character interaction (chat started)
   */
  async trackInteraction(characterId: string) {
    await userCharactersRepository.incrementInteractionCount(characterId);

    // Update popularity score (weighted algorithm)
    await this.updatePopularityScore(characterId);
  }

  /**
   * Update popularity score based on views, interactions, and recency
   */
  private async updatePopularityScore(characterId: string) {
    const character = await userCharactersRepository.findById(characterId);
    if (!character) return;

    // Popularity algorithm:
    // - views weight: 0.3
    // - interactions weight: 0.5
    // - recency weight: 0.2
    const viewScore = (character.view_count || 0) * 0.3;
    const interactionScore = (character.interaction_count || 0) * 0.5;
    const recencyScore = this.calculateRecencyScore(character.updated_at) * 0.2;

    const popularityScore = Math.round(viewScore + interactionScore + recencyScore);

    await userCharactersRepository.update(characterId, {
      popularity_score: popularityScore,
    });
  }

  /**
   * Calculate recency score (higher for recently updated)
   */
  private calculateRecencyScore(updatedAt: Date): number {
    const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: score decreases over time
    return Math.max(0, 1000 * Math.exp(-daysSinceUpdate / 30));
  }

  // ... additional helper methods ...
}

export const marketplaceService = new MarketplaceService();
```

---

## <a name="component-structure"></a>9. Component Structure

### 9.1 File Structure

```
/components/marketplace/
├── index.ts
├── character-marketplace.tsx        (Main container)
├── marketplace-header.tsx           (Search, view toggle, create button)
├── category-tabs.tsx                (Category navigation)
├── filter-bar.tsx                   (Sort, filter chips)
├── character-grid.tsx               (Grid layout with infinite scroll)
├── character-card.tsx               (Individual character card)
├── character-details-modal.tsx      (Detailed character view)
├── empty-states.tsx                 (No results, loading, etc.)
└── hooks/
    ├── use-marketplace-filters.ts   (Filter state management)
    ├── use-character-search.ts      (Search logic with debounce)
    └── use-infinite-characters.ts   (Infinite scroll pagination)

/lib/constants/
└── character-categories.ts          (Category definitions)

/lib/services/
└── marketplace.ts                   (Marketplace service)

/lib/cache/
└── marketplace-cache.ts             (Redis caching for marketplace)

/lib/types/
└── marketplace.ts                   (TypeScript types)

/app/api/marketplace/
├── characters/
│   └── route.ts
├── categories/
│   └── route.ts
└── characters/[id]/
    ├── stats/route.ts
    ├── clone/route.ts
    ├── track-view/route.ts
    └── track-interaction/route.ts
```

### 9.2 Main Component Implementation

```typescript
// /components/marketplace/character-marketplace.tsx
'use client';

import { useState, useCallback } from 'react';
import { MarketplaceHeader } from './marketplace-header';
import { CategoryTabs } from './category-tabs';
import { FilterBar } from './filter-bar';
import { CharacterGrid } from './character-grid';
import { CharacterDetailsModal } from './character-details-modal';
import { useMarketplaceFilters } from './hooks/use-marketplace-filters';
import { useCharacterSearch } from './hooks/use-character-search';
import { useInfiniteCharacters } from './hooks/use-infinite-characters';
import type { ExtendedCharacter } from '@/lib/types/marketplace';

interface CharacterMarketplaceProps {
  onSelectCharacter: (character: ExtendedCharacter) => void;
  onCloneCharacter: (character: ExtendedCharacter) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function CharacterMarketplace({
  onSelectCharacter,
  onCloneCharacter,
  isCollapsed = false,
  onToggleCollapse,
}: CharacterMarketplaceProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<ExtendedCharacter | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const {
    filters,
    sortBy,
    activeCategory,
    setActiveCategory,
    setSortBy,
    toggleFilter,
    clearAllFilters,
    hasActiveFilters,
  } = useMarketplaceFilters();

  const {
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
  } = useCharacterSearch();

  const {
    characters,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    refetch,
  } = useInfiniteCharacters({
    filters: { ...filters, category: activeCategory, search: debouncedSearchQuery },
    sortBy,
    includeStats: true,
  });

  const handleStartChat = useCallback((character: ExtendedCharacter) => {
    // Track interaction
    fetch(`/api/marketplace/characters/${character.id}/track-interaction`, { method: 'POST' });

    onSelectCharacter(character);
  }, [onSelectCharacter]);

  const handleViewDetails = useCallback((character: ExtendedCharacter) => {
    // Track view
    fetch(`/api/marketplace/characters/${character.id}/track-view`, { method: 'POST' });

    setSelectedCharacter(character);
  }, []);

  const handleClone = useCallback(async (character: ExtendedCharacter) => {
    await onCloneCharacter(character);
    refetch(); // Refresh list
  }, [onCloneCharacter, refetch]);

  return (
    <div className={`flex flex-col h-full ${isCollapsed ? 'hidden' : ''}`}>
      <MarketplaceHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        view={view}
        onViewChange={setView}
        onToggleCollapse={onToggleCollapse}
      />

      <CategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      <FilterBar
        sortBy={sortBy}
        onSortChange={setSortBy}
        filters={filters}
        onToggleFilter={toggleFilter}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
      />

      <CharacterGrid
        characters={characters}
        view={view}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onStartChat={handleStartChat}
        onCloneCharacter={handleClone}
        onViewDetails={handleViewDetails}
      />

      {selectedCharacter && (
        <CharacterDetailsModal
          character={selectedCharacter}
          isOpen={!!selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onStartChat={handleStartChat}
          onClone={handleClone}
        />
      )}
    </div>
  );
}
```

---

## <a name="feasibility"></a>10. Feasibility Assessment

### 10.1 Infrastructure Readiness

| Component | Current State | Required Work | Feasibility Score |
|-----------|--------------|--------------|-------------------|
| **Database Schema** | ✅ `is_template`, `is_public` flags exist | Add 7 columns + indexes | **95%** - Trivial migration |
| **Repository Layer** | ✅ `listPublic()`, `listTemplates()` exist | Add search/filter methods | **95%** - Straightforward |
| **Service Layer** | ✅ Full CRUD operations exist | Create MarketplaceService | **90%** - New service, reuses existing |
| **Agent Discovery** | ✅ Already implemented with stats | Integrate with marketplace | **95%** - Just connect the dots |
| **ElizaOS Integration** | ✅ Character loading fully working | No changes needed | **100%** - Works perfectly |
| **Chat Interface** | ⚠️ Dropdown selector exists | Add marketplace sidebar | **80%** - UI refactoring |
| **Authentication** | ✅ requireAuth() ready | No changes needed | **100%** - Ready |
| **Caching** | ✅ Redis + agentStateCache exist | Add marketplace cache | **90%** - Reuse pattern |

**Overall Feasibility: 92%** ✅ **HIGHLY FEASIBLE**

### 10.2 Technical Risks Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Performance issues with many characters** | Medium | High | Implement virtualization, pagination, caching |
| **Character switching breaks existing rooms** | Low | High | Extensive testing, maintain backward compatibility |
| **Search performance degrades** | Medium | Medium | Database indexes, full-text search, caching |
| **Mobile UX issues** | Medium | Medium | Responsive design from start, test on mobile |
| **Cache invalidation bugs** | Low | Medium | Clear cache strategy, timestamp-based invalidation |
| **Migration fails in production** | Low | Critical | Test migration thoroughly, have rollback plan |
| **User confusion with new UI** | Medium | Low | Onboarding tour, clear documentation |

**Risk Level: LOW-MEDIUM** ✅ **Manageable with proper planning**

### 10.3 Resource Requirements

**Team:**
- 1 Full-stack developer (primary)
- 1 UI/UX designer (part-time, Phase 2)
- 1 QA engineer (part-time, Phase 3-4)

**Time:**
- Phase 1-4: 6 weeks (144 hours)
- Phase 5 (optional): 2 weeks (40 hours)
- Total: 6-8 weeks

**Infrastructure:**
- No additional infrastructure required
- Existing database, Redis, services all sufficient
- May need CDN for character avatars (nice-to-have)

### 10.4 Backward Compatibility

**Guaranteed:**
- ✅ Existing character creation workflow unchanged
- ✅ Existing characters continue to work
- ✅ Existing API endpoints unaffected
- ✅ ElizaOS runtime unchanged
- ✅ Character dropdown still available as fallback

**Migration Path:**
- ✅ Database migration is additive (no breaking changes)
- ✅ New columns have defaults, existing data unaffected
- ✅ Users can opt-in to marketplace or continue using dropdown

### 10.5 Scalability Considerations

**Database:**
- Indexes ensure fast queries even with 10,000+ characters
- `popularity_score` enables efficient sorting
- Pagination prevents loading all characters at once

**API:**
- Caching reduces database load
- Rate limiting prevents abuse
- Pagination limits response size

**Frontend:**
- Virtualized lists handle thousands of items
- Lazy image loading
- Debounced search prevents excessive requests

**Verdict:** ✅ **SCALES TO 10,000+ CHARACTERS**

---

## <a name="improvements"></a>11. Meaningful Improvements & Innovations

### 11.1 Beyond Character.AI

Our implementation can surpass Character.AI in several ways:

#### **1. Deep ElizaOS Integration**

**Character.AI:** Closed-source, limited customization
**Eliza Cloud:** Full ElizaOS runtime with:
- Custom plugins (ElevenLabs voice, custom actions)
- Memory system integration
- Room-based persistent conversations
- Deployment to dedicated containers
- Full character plugin ecosystem

**Innovation:** Marketplace shows plugin capabilities (voice, memory, custom actions) as badges.

#### **2. Enterprise Features**

**Character.AI:** Consumer-focused
**Eliza Cloud:** Enterprise-ready:
- Organization-level character sharing
- Credit-based usage tracking
- Role-based access control (admin can feature characters)
- Analytics dashboard for character performance
- Deployment status (deployed vs. draft)

**Innovation:** "Deploy" button right from marketplace card for instant containerization.

#### **3. Developer-Friendly**

**Character.AI:** No API, no customization
**Eliza Cloud:** Developer paradise:
- Full REST API for marketplace
- Character cloning to remix and customize
- JSON export/import
- AI-assisted character creation
- Open-source extensibility

**Innovation:** "Edit" button on marketplace cards for instant remixing.

#### **4. Transparent AI**

**Character.AI:** Black box
**Eliza Cloud:** Transparent:
- Show exact model used (GPT-4o, Claude, etc.)
- Display plugins actively running
- Show system prompt and personality traits
- Usage statistics (message count, session duration)

**Innovation:** Character cards show "Powered by GPT-4o + ElevenLabs Voice" badges.

#### **5. Credit-Based Fairness**

**Character.AI:** Subscription tiers
**Eliza Cloud:** Usage-based:
- Only pay for what you use
- See credit cost per character interaction
- No monthly fees for browsing/discovery

**Innovation:** Character cards show "~5 credits per conversation" estimate.

### 11.2 Unique Features

#### **A. Character Deployment Status**

Show if character is deployed as container (live 24/7) vs. on-demand:

```
┌─────────────────────────┐
│ Character Card          │
│ ┌─────────┐            │
│ │  IMG    │ Name       │
│ └─────────┘            │
│ Status: 🚀 Deployed    │ ← UNIQUE
│ URL: https://xxx.ai    │ ← UNIQUE
│ Uptime: 99.9%          │ ← UNIQUE
└─────────────────────────┘
```

#### **B. Real-Time Availability**

Show if character is currently available or busy:

```
┌─────────────────────────┐
│ Character Card          │
│ ┌─────────┐            │
│ │  IMG    │ Name       │
│ └─────────┘            │
│ 🟢 Available Now       │ ← UNIQUE
│ 💬 5 active chats      │ ← UNIQUE
└─────────────────────────┘
```

#### **C. Voice Samples**

Play voice sample from character card:

```
┌─────────────────────────┐
│ Character Card          │
│ ┌─────────┐            │
│ │  IMG    │ Name       │
│ └─────────┘            │
│ 🔊 ElevenLabs Voice    │
│ [▶️ Play Sample]       │ ← UNIQUE
└─────────────────────────┘
```

#### **D. Character Versioning**

Track character updates over time:

```
┌─────────────────────────┐
│ Character Details       │
│ Version: 3.2.1          │ ← UNIQUE
│ Updated: 2h ago         │
│ Changelog:              │
│ - Improved responses    │
│ - Added gardening topic │
└─────────────────────────┘
```

#### **E. Recommended Characters**

AI-powered recommendations based on usage:

```
┌─────────────────────────┐
│ Based on your chats     │ ← UNIQUE
│ with "Code Assistant",  │
│ you might like:         │
│                         │
│ [Tech Tutor] [DevOps]  │
└─────────────────────────┘
```

#### **F. Character Collections**

Curated sets of characters:

```
┌─────────────────────────┐
│ 📚 Collections          │ ← UNIQUE
│                         │
│ 🚀 Productivity Suite   │
│    5 characters         │
│                         │
│ 🎨 Creative Bundle      │
│    8 characters         │
└─────────────────────────┘
```

### 11.3 Quality of Life Improvements

1. **Quick Actions from Card**
   - Start chat without opening details
   - Clone with one click
   - Share character link
   - Add to favorites

2. **Keyboard Shortcuts**
   - `Cmd+K` / `Ctrl+K`: Open search
   - `Arrow keys`: Navigate cards
   - `Enter`: Start chat with focused character
   - `Esc`: Close marketplace

3. **Smart Defaults**
   - Remember last used category
   - Persist view preference (grid/list)
   - Save filter preferences
   - Auto-suggest based on history

4. **Accessibility**
   - Full keyboard navigation
   - Screen reader support
   - High contrast mode
   - Reduced motion option

5. **Mobile Optimizations**
   - Swipe gestures for categories
   - Pull-to-refresh character list
   - Bottom sheet for character details
   - Haptic feedback on actions

---

## <a name="risks"></a>12. Technical Risks & Mitigation

### 12.1 Performance Risks

**Risk: Marketplace loads slowly with 1000+ characters**

**Mitigation:**
- Implement virtualized scrolling (only render visible cards)
- Aggressive caching (5-minute TTL)
- Pagination (20 characters per page)
- Lazy load images with blur placeholders
- Database indexes on all filter columns
- Consider CDN for avatars

**Risk: Search degrades with large datasets**

**Mitigation:**
- Add full-text search indexes in PostgreSQL
- Implement Algolia or Elasticsearch for advanced search (optional)
- Cache popular searches
- Debounce search input (500ms)
- Limit search to indexed fields only

### 12.2 UI/UX Risks

**Risk: Users confused by marketplace vs. dropdown**

**Mitigation:**
- Onboarding tooltip: "Discover characters in the marketplace!"
- Keep dropdown as fallback
- Add "What's new" banner
- Include video tutorial

**Risk: Mobile experience cramped**

**Mitigation:**
- Design mobile-first
- Test on real devices early
- Use bottom sheet for details
- Single-column card layout
- Larger touch targets (min 44x44px)

### 12.3 Data Integrity Risks

**Risk: Migration fails or corrupts data**

**Mitigation:**
- Test migration on staging with production data copy
- Use database transactions
- Have rollback script ready
- Backup before migration
- Additive migration (no dropping columns)

**Risk: Character switching breaks active rooms**

**Mitigation:**
- Extensive testing of character switching
- Maintain character-room associations in `eliza_room_characters`
- Don't allow switching character mid-conversation
- Add confirmation dialog

### 12.4 Security Risks

**Risk: Users clone private characters**

**Mitigation:**
- Check `is_public` or `is_template` before allowing clone
- Verify ownership in API
- Add rate limiting to clone endpoint

**Risk: Malicious characters in marketplace**

**Mitigation:**
- Admin moderation for featured characters
- Report functionality
- Content filtering in system prompts
- User reputation system (future)

---

## <a name="testing"></a>13. Testing Strategy

### 13.1 Unit Tests

**Database Layer:**
- Repository methods (search, filter, sort)
- Migration up/down
- Index creation

**Service Layer:**
- MarketplaceService methods
- Filter logic
- Sorting algorithms
- Pagination calculations

**API Endpoints:**
- Request validation
- Response formatting
- Error handling
- Authentication/authorization

### 13.2 Integration Tests

**API Flows:**
- Search characters → Get results
- Clone character → Verify in database
- Track view → Increment count
- Filter by category → Correct results

**UI Flows:**
- Select character → Start chat → Character loaded in runtime
- Clone character → Navigate to editor
- Search → Type query → See filtered results

### 13.3 E2E Tests (Playwright)

**Critical User Journeys:**

1. **Discover Character**
   - Visit `/dashboard/eliza`
   - See marketplace with characters
   - Filter by "Anime" category
   - Search "helpful"
   - Click character card
   - View details modal
   - Click "Start Chat"
   - Verify chat loads with character

2. **Clone Character**
   - Select template character
   - Click "Clone"
   - Verify redirect to character editor
   - See cloned character in editor
   - Modify and save
   - See character in "My Characters" filter

3. **Mobile Experience**
   - Visit on mobile viewport
   - Swipe through categories
   - Tap character card
   - View details in bottom sheet
   - Start chat
   - Verify responsive layout

### 13.4 Performance Tests

**Load Testing:**
- 1000 concurrent users browsing marketplace
- Measure API response times (<200ms p95)
- Check database query performance (<50ms)
- Verify cache hit rates (>80%)

**Stress Testing:**
- 10,000 characters in database
- Measure load time (<2s)
- Check pagination performance
- Verify virtualized list renders smoothly

### 13.5 Accessibility Tests

**WCAG AA Compliance:**
- Keyboard navigation
- Screen reader compatibility
- Color contrast ratios
- Focus indicators
- ARIA labels

**Tools:**
- axe DevTools
- Lighthouse Accessibility audit
- Manual screen reader testing

---

## <a name="timeline"></a>14. Timeline & Resource Estimates

### 14.1 Detailed Timeline (6 Weeks)

**Week 1: Database & API Foundation**
- Days 1-2: Database migration, schema updates
- Days 3-4: Repository enhancements, service creation
- Day 5: API endpoint implementation

**Week 2: API Completion & Testing**
- Days 1-2: Finish API endpoints, add tests
- Days 3-4: Seed template characters
- Day 5: API integration tests, documentation

**Week 3: UI Components**
- Days 1-2: CharacterCard, CharacterGrid
- Days 3-4: MarketplaceHeader, CategoryTabs
- Day 5: FilterBar, EmptyStates

**Week 4: UI Components Completion**
- Days 1-2: CharacterDetailsModal
- Days 3-4: Responsive design, animations
- Day 5: Component testing, Storybook

**Week 5: Integration**
- Days 1-2: Integrate marketplace with ElizaChatInterface
- Days 3-4: Chat initialization, character switching
- Day 5: E2E testing, bug fixes

**Week 6: Polish & Launch**
- Days 1-2: Performance optimization
- Days 3-4: UX improvements, accessibility
- Day 5: Final testing, documentation, deploy

### 14.2 Effort Breakdown

| Phase | Tasks | Hours | % of Total |
|-------|-------|-------|------------|
| Phase 1: Foundation | Database, API, Services | 40h | 28% |
| Phase 2: UI Components | All marketplace UI | 48h | 33% |
| Phase 3: Integration | Connect to chat | 32h | 22% |
| Phase 4: Polish | Optimization, UX | 24h | 17% |
| **Total** | | **144h** | **100%** |

### 14.3 Resource Allocation

**Primary Developer (144 hours):**
- Backend: 50 hours
- Frontend: 60 hours
- Integration: 20 hours
- Testing: 14 hours

**Designer (Part-time, 16 hours):**
- Character card design
- Category icons
- Color system
- Responsive layouts

**QA Engineer (Part-time, 16 hours):**
- Test plan creation
- E2E test writing
- Manual testing
- Bug reporting

**Total Team Hours: 176 hours**

### 14.4 Milestones & Deliverables

**Milestone 1 (End of Week 2):** API Complete
- ✅ Database migration deployed
- ✅ All API endpoints working
- ✅ 20+ template characters seeded
- ✅ API tests passing

**Milestone 2 (End of Week 4):** UI Complete
- ✅ All marketplace components built
- ✅ Responsive design verified
- ✅ Storybook documentation
- ✅ Component tests passing

**Milestone 3 (End of Week 5):** Integration Complete
- ✅ Marketplace integrated with chat
- ✅ Character selection working
- ✅ Character cloning working
- ✅ E2E tests passing

**Milestone 4 (End of Week 6):** Launch Ready
- ✅ Performance optimized (<2s load)
- ✅ Accessibility verified (WCAG AA)
- ✅ Documentation complete
- ✅ Production deployment successful

---

## 15. Conclusion & Recommendation

### 15.1 Summary

The Character Marketplace implementation is **highly feasible** with **92% infrastructure readiness**. Key success factors:

1. **Existing Infrastructure:** Database flags, services, and agent discovery already exist
2. **Clear Architecture:** Well-defined components and separation of concerns
3. **Character.AI Inspiration:** Proven UX patterns to follow
4. **ElizaOS Differentiation:** Unique features (plugins, deployment, voice) set us apart
5. **Manageable Scope:** 6 weeks for core features, extensible for future phases

### 15.2 Recommendation

**✅ PROCEED WITH IMPLEMENTATION**

**Rationale:**
- Infrastructure is 90% ready (minimal groundwork needed)
- Clear user value (discovery, engagement, ease of use)
- Competitive advantage over Character.AI (ElizaOS, deployment, transparency)
- Low technical risk with proper planning
- Extensible architecture for future features

### 15.3 Success Metrics

**Pre-Launch:**
- API response times <200ms p95
- Character cards render <2s
- 100% WCAG AA compliance
- 90%+ E2E test coverage

**Post-Launch (3 months):**
- 70% of users discover characters via marketplace (vs. dropdown)
- 50%+ increase in character interaction count
- 30%+ increase in template character usage
- <1% error rate in character switching

### 15.4 Next Steps

1. **Get Approval:** Review this document with stakeholders
2. **Allocate Resources:** Assign developer, designer, QA
3. **Create Tickets:** Break down phases into Jira/Linear tasks
4. **Kickoff Phase 1:** Start with database migration and API
5. **Weekly Check-ins:** Review progress, adjust timeline as needed

---

## Appendix

### A. Character.AI Resources

- Character.AI platform: https://character.ai
- 2025 Updates: Search filters, community feed, creator tools
- Key features: Category navigation, character cards, instant chat

### B. Related Documentation

- `/docs/character-creator.md` - Character creation system
- `/docs/PLUGIN_ELEVENLABS_INTEGRATION.md` - Voice plugin integration
- `/docs/API_REFERENCE.md` - Existing API documentation

### C. Database Schema Reference

Current schema: `/db/schemas/user-characters.ts`
Migration template: `/db/migrations/`

### D. Design Assets

- Character card mockups: [To be created]
- Marketplace layout: [To be created]
- Category icons: [To be created]

### E. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Oct 2025 | Analysis Team | Initial comprehensive plan |

---

**Document Owner:** Product & Engineering Team
**Review Cycle:** After each phase completion
**Last Updated:** October 2025
**Status:** ✅ Ready for Implementation
