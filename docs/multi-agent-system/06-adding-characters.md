# Adding New Template Characters

## Quick Guide

Want to add a new AI personality? Follow these simple steps!

---

## Step 1: Create Character JSON

Create a new file in `lib/characters/templates/`:

**Example**: `lib/characters/templates/game-master.json`

```json
{
  "id": "template-game-master",
  "name": "Game Master",
  "username": "gamemaster",
  "bio": "Your guide through gaming worlds. I specialize in video games, board games, RPGs, and gaming strategy.",
  "system": "You are Game Master, a gaming expert who helps players with strategies, game recommendations, and gaming discussions. Be enthusiastic and knowledgeable.",
  "topics": ["video games", "board games", "RPG", "gaming strategy"],
  "adjectives": ["knowledgeable", "strategic", "enthusiastic", "fun"],
  "plugins": ["@elizaos/plugin-openai"],
  "category": "gaming",
  "tags": ["gaming", "rpg"],
  "featured": false,
  "avatarUrl": "/avatars/gamemaster.png",
  "style": {
    "all": ["enthusiastic", "strategic", "engaging"],
    "chat": ["fun", "knowledgeable"],
    "post": ["exciting", "detailed"]
  },
  "messageExamples": [
    [
      {
        "user": "user",
        "content": {
          "text": "Best strategy for boss fight?"
        }
      },
      {
        "user": "gamemaster",
        "content": {
          "text": "Ah, a worthy challenge! Let me share some tactics that will help you emerge victorious..."
        }
      }
    ]
  ],
  "postExamples": []
}
```

---

## Step 2: Add Avatar Image

Place avatar in one of two locations:

### Option A: Use Existing Avatar
```bash
# If you have an avatar in /public/avatars/
"avatarUrl": "/avatars/gamemaster.png"
```

### Option B: Add New Avatar
```bash
# Add your image to public/avatars/
cp your-image.png public/avatars/gamemaster.png

# Reference it in JSON
"avatarUrl": "/avatars/gamemaster.png"
```

**Recommended specs**:
- Size: 1024x1024px
- Format: PNG or JPG
- Background: Transparent or themed

---

## Step 3: Update Template Loader

Edit `lib/characters/template-loader.ts`:

```typescript
// 1. Import your template
import gameMasterTemplate from "./templates/game-master.json";

// 2. Add to TEMPLATE_CHARACTERS
export const TEMPLATE_CHARACTERS: Record<string, ExtendedCharacter> = {
  "template-ember": emberTemplate as ExtendedCharacter,
  "template-zilo": ziloTemplate as ExtendedCharacter,
  "template-pixel": pixelTemplate as ExtendedCharacter,
  "template-luna": lunaTemplate as ExtendedCharacter,
  "template-code-mentor": codeMentorTemplate as ExtendedCharacter,
  "template-creative-spark": creativeSparkTemplate as ExtendedCharacter,
  "template-game-master": gameMasterTemplate as ExtendedCharacter, // ← Add this
};
```

---

## Step 4: Test

```bash
# Restart dev server
bun run dev

# Navigate to My Agents
http://localhost:3000/dashboard/my-agents

# Your new character should appear!
# Click chat icon to test
```

---

## Character Definition Guide

### Required Fields

#### `id` (string)
- **Must** start with `"template-"`
- Format: `"template-{name}"`
- Example: `"template-game-master"`
- Purpose: Identifies this as a template for auto-creation

#### `name` (string)
- Display name shown in UI
- Example: `"Game Master"`
- Keep it short and memorable

#### `username` (string)
- Unique identifier
- Used in URLs and API endpoints
- Lowercase, no spaces
- Example: `"gamemaster"`

#### `bio` (string | string[])
- Agent description shown in cards
- Can be string or array of strings
- Keep first string concise (shows in preview)
- Example: `"Your guide through gaming worlds..."`

#### `system` (string)
- System prompt defining personality
- Be specific about behavior, tone, expertise
- Example: `"You are Game Master, a gaming expert who..."`

### Optional But Recommended

#### `topics` (string[])
- Conversation topics
- Helps with discovery
- Example: `["video games", "board games", "RPG"]`

#### `adjectives` (string[])
- Personality traits
- Influences conversation style
- Example: `["enthusiastic", "strategic", "fun"]`

#### `plugins` (string[])
- ElizaOS plugins to enable
- Default: `["@elizaos/plugin-openai"]`
- Voice: Add `"@elizaos/plugin-elevenlabs"`

#### `category` (string)
- Categorization for filtering
- Options: `assistant`, `creative`, `anime`, `gaming`, `learning`, `entertainment`, `history`, `lifestyle`

#### `tags` (string[])
- Search/filter tags
- Example: `["gaming", "rpg", "strategy"]`

#### `featured` (boolean)
- Shows "Top performing" badge
- Set `true` for highlighted agents
- Default: `false`

#### `style` (object)
- Conversation style guidelines
- Three contexts: `all`, `chat`, `post`
- Example:
```json
{
  "all": ["enthusiastic", "strategic"],
  "chat": ["fun", "knowledgeable"],
  "post": ["exciting", "detailed"]
}
```

#### `messageExamples` (array)
- Training examples
- Shows agent's conversation style
- Format: Array of message pairs
- Minimum: 1 example recommended

---

## Advanced Customization

### Adding Custom Settings

```json
{
  "settings": {
    "voice": "enthusiastic",
    "responseLength": "detailed",
    "useEmojis": true,
    "customSetting": "value"
  }
}
```

### Knowledge Base Integration

```json
{
  "knowledge": [
    "/path/to/knowledge/file.txt",
    {
      "path": "/shared/knowledge.md",
      "shared": true
    }
  ]
}
```

### Multiple Plugins

```json
{
  "plugins": [
    "@elizaos/plugin-openai",
    "@elizaos/plugin-elevenlabs",
    "@elizaos/plugin-memory"
  ]
}
```

---

## Categories Explained

### assistant
General-purpose helpful agents
- Examples: Ember, Zilo, Pixel, Code Mentor

### creative
Creative and artistic agents
- Examples: Creative Spark

### anime
Anime and manga focused
- Examples: Luna

### gaming
Gaming and esports
- Examples: Game Master

### learning
Educational agents
- Examples: Professor Ada

### entertainment
Fun and entertainment
- Examples: Comedy Bot

### lifestyle
Health, wellness, relationships
- Examples: Wellness Coach

---

## Checklist

Before submitting a new template character:

- [ ] `id` starts with `"template-"`
- [ ] `username` is unique and lowercase
- [ ] `name` is clear and descriptive
- [ ] `bio` explains agent's purpose
- [ ] `system` defines personality clearly
- [ ] `category` is set correctly
- [ ] Avatar image exists and is referenced
- [ ] At least 1 `messageExample` provided
- [ ] Tested in UI (appears in My Agents)
- [ ] Tested chat functionality
- [ ] Imported in `template-loader.ts`
- [ ] Added to `TEMPLATE_CHARACTERS` object

---

## Example: Full Character Template

See `lib/characters/templates/ember.json` for a complete, working example with all fields properly configured.

## Tips

1. **Write Good System Prompts**: Be specific about personality, expertise, and conversation style
2. **Use Message Examples**: Help train the agent's voice
3. **Choose Right Category**: Makes discovery easier
4. **Pick Good Avatars**: Visual appeal matters
5. **Test Thoroughly**: Chat with agent to ensure personality shines through

