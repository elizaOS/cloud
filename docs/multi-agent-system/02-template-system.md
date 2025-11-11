# Template Character System

## Overview

The template character system provides a way to define reusable AI agent personalities as JSON files in the codebase. These templates are automatically instantiated into the database when users first interact with them.

## Architecture

### Directory Structure

```
lib/characters/
├── templates/              # Template JSON files
│   ├── ember.json         # Wellness coach
│   ├── zilo.json          # Marketing strategist
│   ├── pixel.json         # E-commerce optimizer
│   ├── luna.json          # Anime enthusiast
│   ├── code-mentor.json   # Programming expert
│   └── creative-spark.json # Creative writing muse
├── template-loader.ts      # Template loading utilities
└── (other files...)
```

### Template JSON Format

Each template is a JSON file with the following structure:

```json
{
  "id": "template-ember",           // Must start with "template-"
  "name": "Ember",                  // Display name
  "username": "ember",              // Unique username
  "bio": "Description text",        // Agent description
  "system": "System prompt...",     // Personality instructions
  "topics": ["wellness", "..."],    // Conversation topics
  "adjectives": ["empathetic"],     // Personality traits
  "plugins": ["@elizaos/plugin-openai"],
  "category": "assistant",          // Category (assistant/creative/etc)
  "tags": ["wellness"],             // Search/filter tags
  "featured": true,                 // Show "Top performing" badge
  "avatarUrl": "/path/to/image",    // Avatar image path
  "style": {
    "all": ["empathetic"],          // General style
    "chat": ["supportive"],         // Chat-specific style
    "post": ["uplifting"]           // Post-specific style
  },
  "messageExamples": [              // Conversation examples
    [
      {
        "user": "user",
        "content": { "text": "User message" }
      },
      {
        "user": "ember",
        "content": { "text": "Agent response" }
      }
    ]
  ],
  "postExamples": []                // Social media post examples
}
```

## Template Loader API

### Functions

#### `getAllTemplates(): ExtendedCharacter[]`
Returns all template characters as an array for display in UI.

```typescript
import { getAllTemplates } from "@/lib/characters/template-loader";

const templates = getAllTemplates();
// Returns: [Ember, Zilo, Pixel, Luna, Code Mentor, Creative Spark]
```

#### `getTemplate(id: string): ExtendedCharacter | null`
Gets a specific template by ID.

```typescript
const ember = getTemplate("template-ember");
// Returns: Ember character object or null
```

#### `isTemplateCharacter(characterId: string): boolean`
Checks if a character ID is a template.

```typescript
isTemplateCharacter("template-ember"); // true
isTemplateCharacter("real-uuid-here"); // false
```

#### `templateToDbFormat(template, userId, organizationId)`
Converts template to database format for insertion.

```typescript
const dbData = templateToDbFormat(
  emberTemplate,
  "user-id-here",
  "org-id-here"
);
// Returns: Object ready for DB insertion
```

## Auto-Creation Flow

### When Does Auto-Creation Happen?

Template characters are automatically created in the database when:
1. User clicks chat icon on template agent card
2. User switches to template agent in dropdown
3. User creates a room with `characterId` starting with "template-"

### Auto-Creation Process

```typescript
// In app/api/eliza/rooms/route.ts

if (characterId && isTemplateCharacter(characterId)) {
  // 1. Get template from JSON
  const template = getTemplate(characterId);
  
  // 2. Check if user already has this character
  const existing = await db.query.userCharacters.findFirst({
    where: and(
      eq(userCharacters.user_id, user.id),
      eq(userCharacters.username, template.username)
    ),
  });
  
  if (existing) {
    // 3a. Use existing character
    characterId = existing.id;
  } else {
    // 3b. Create from template
    const dbData = templateToDbFormat(template, user.id, org.id);
    const [created] = await db.insert(userCharacters)
      .values(dbData)
      .returning();
    characterId = created.id;
  }
}

// 4. Get character-specific runtime
const runtime = characterId
  ? await agentRuntime.getRuntimeForCharacter(characterId)
  : await agentRuntime.getRuntime();

// 5. Create room with correct runtime
// User now chats with Ember, not default Eliza!
```

## Benefits

### For Users
- ✅ No setup required - agents ready to use
- ✅ Consistent experience across all users
- ✅ Can customize their own copies
- ✅ Organized by categories

### For Developers
- ✅ Version controlled in Git
- ✅ Easy to add new characters
- ✅ Single source of truth
- ✅ No database migrations needed
- ✅ Testable and maintainable

### For Operations
- ✅ No seeding scripts to run
- ✅ Reduces database size (lazy creation)
- ✅ Easy to update character definitions
- ✅ Consistent across environments

## Template vs User Characters

| Aspect | Template Characters | User Characters |
|--------|-------------------|-----------------|
| **Storage** | JSON files in codebase | Database only |
| **ID Format** | `template-{name}` | UUID |
| **Creation** | Auto-created on first use | User creates manually |
| **Visibility** | All users see them | Per-user only |
| **Modification** | Updates via code | Updates via UI |
| **Featured Badge** | Can be marked featured | User-created not featured |

## Character Properties

### Required Fields
- `id` - Must start with "template-"
- `name` - Display name
- `username` - Unique identifier
- `bio` - Description (string or array)
- `system` - System prompt defining personality

### Optional Fields
- `topics` - Array of conversation topics
- `adjectives` - Personality traits
- `plugins` - ElizaOS plugins to use
- `category` - Categorization (assistant/creative/anime/gaming/etc)
- `tags` - Search/filter tags
- `featured` - Shows "Top performing" badge
- `avatarUrl` - Avatar image path
- `style` - Conversation style guidelines
- `messageExamples` - Training examples
- `postExamples` - Social media examples
- `settings` - Custom settings
- `knowledge` - Knowledge base paths

## Best Practices

### Creating Templates

1. **Use Clear IDs**: Always prefix with `template-`
2. **Unique Usernames**: Ensure username is unique across all templates
3. **Rich System Prompts**: Define personality clearly in system field
4. **Provide Examples**: Include messageExamples for better responses
5. **Choose Good Avatars**: Use high-quality images (1024x1024 recommended)
6. **Set Appropriate Category**: Helps users find relevant agents

### Avatar Guidelines

- **Size**: 1024x1024px recommended
- **Format**: PNG or JPG
- **Location**: 
  - `/demo-agents/` - For Figma demo images
  - `/avatars/` - For production avatars
- **Naming**: Use character username (e.g., `ember.jpg`)

## Future Enhancements

### Potential Additions

1. **Dynamic Templates** - Allow admins to add templates without code
2. **Template Marketplace** - Share templates between organizations
3. **Version Control** - Track template changes over time
4. **Analytics** - Track which templates are most popular
5. **A/B Testing** - Test different system prompts
6. **Localization** - Multi-language templates

### Planned Features

- [ ] Template rating system
- [ ] User-submitted template review
- [ ] Template categories expansion
- [ ] Advanced personality configuration
- [ ] Voice model templates
- [ ] Knowledge base templates

