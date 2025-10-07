# Character Creator Feature

## Overview
The Character Creator is a comprehensive tool for designing and managing AI agent characters that conform to the ElizaOS character specification. It provides an intuitive interface combining AI-assisted character generation with manual editing capabilities.

## Features

### 1. **AI Chat Assistant** 🤖
- Interactive conversational AI that helps users craft character definitions
- Provides suggestions and asks clarifying questions
- Automatically extracts and applies character updates from responses
- Quick prompt buttons for common use cases

### 2. **JSON Editor** 📝
- Real-time JSON editing with syntax validation
- Live validation feedback with visual indicators
- Export character definitions as JSON files
- Save directly to database

### 3. **Character Form** 📋
- Organized tabbed interface:
  - **Basics**: Name, username, bio, system prompt
  - **Personality**: Topics, adjectives, post examples
  - **Style**: Writing guidelines for different contexts
  - **Advanced**: Plugins and additional settings
- Tag-based inputs for arrays
- Visual badge management

### 4. **Split Layout** 🖥️
- AI Assistant on the left
- JSON Editor/Form on the right
- Toggle between assistant and form views
- Responsive design for all screen sizes

### 5. **Character Management** 💾
- Create new characters from scratch
- Load and edit existing characters
- Save to database with user/organization isolation
- Export as JSON files for use in ElizaOS

## Database Schema

### `user_characters` Table
```typescript
{
  id: UUID (primary key)
  organization_id: UUID (foreign key)
  user_id: UUID (foreign key)
  name: string
  username?: string
  system?: string
  bio: string | string[]
  message_examples: object[][]
  post_examples: string[]
  topics: string[]
  adjectives: string[]
  knowledge: (string | object)[]
  plugins: string[]
  settings: object
  secrets: object
  style: object
  character_data: object (full JSON)
  is_template: boolean
  is_public: boolean
  created_at: timestamp
  updated_at: timestamp
}
```

## API Endpoints

### `/api/v1/character-assistant`
- **Method**: POST
- **Purpose**: AI chat assistant for character generation
- **Uses**: OpenAI GPT-4o-mini with streaming responses

## Server Actions

Located in `app/actions/characters.ts`:
- `createCharacter(character)` - Create a new character
- `updateCharacter(id, character)` - Update existing character
- `deleteCharacter(id)` - Delete a character
- `listCharacters()` - Get all user's characters
- `getCharacter(id)` - Get specific character

## Usage

1. Navigate to **Dashboard → Character Creator** in the sidebar
2. Start a conversation with the AI assistant or use quick prompts
3. Watch as the JSON updates in real-time based on AI suggestions
4. Fine-tune using the Form view or edit JSON directly
5. Export as JSON file or save to database
6. Load saved characters for further editing

## ElizaOS Integration

Characters created with this tool conform to the ElizaOS character specification and can be:
- Exported as JSON files
- Used directly with ElizaOS agents
- Shared across the platform (future feature)
- Used as templates (future feature)

## Tech Stack

- **Frontend**: React, Next.js 15, TypeScript
- **UI**: Radix UI, Tailwind CSS, Shadcn/ui
- **AI**: Vercel AI SDK, OpenAI GPT-4o-mini
- **Database**: PostgreSQL with Drizzle ORM
- **State**: React hooks, Server Actions

## Future Enhancements

- [ ] Import existing character JSON files
- [ ] Character templates gallery
- [ ] Version history and rollback
- [ ] Collaboration features
- [ ] Direct integration with agent deployment
- [ ] Character testing playground
- [ ] Community sharing and marketplace

