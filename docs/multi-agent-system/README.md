# Multi-Agent System Documentation

## Overview

This documentation covers the complete multi-agent chat/build mode system implementation for Eliza Cloud, based on Figma designs and modern UX patterns.

## Documentation Structure

1. **[01-overview.md](./01-overview.md)** - System overview and key features
2. **[02-template-system.md](./02-template-system.md)** - Template character system architecture
3. **[03-ui-components.md](./03-ui-components.md)** - UI components and layouts
4. **[04-user-flows.md](./04-user-flows.md)** - Complete user flows and interactions
5. **[05-technical-implementation.md](./05-technical-implementation.md)** - Technical details and code structure
6. **[06-adding-characters.md](./06-adding-characters.md)** - How to add new template characters
7. **[07-troubleshooting.md](./07-troubleshooting.md)** - Common issues and solutions

## Quick Start

### For Users

1. Navigate to `/dashboard/my-agents`
2. Browse available template agents
3. Click chat icon (💬) to start chatting
4. Click code icon (<>) to configure agent

### For Developers

```bash
# Add a new template character:
1. Create JSON file in lib/characters/templates/
2. Import in lib/characters/template-loader.ts
3. Add to TEMPLATE_CHARACTERS object
4. Done!
```

## Key Features

- ✅ **Template Character System** - JSON-based character templates, auto-created on first use
- ✅ **Multi-Agent Support** - Users can switch between multiple agents seamlessly
- ✅ **Chat Mode** - Full chat interface with session history
- ✅ **Build Mode** - Configure agents while testing them
- ✅ **Session Filtering** - Automatic filtering of conversations by agent
- ✅ **Pixel-Perfect Figma Implementation** - Exact design specifications

## Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **State Management**: Zustand
- **Styling**: TailwindCSS with custom Figma specifications
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Drizzle ORM
- **AI Runtime**: ElizaOS Core

## Version

- **Initial Release**: November 11, 2025
- **Status**: Production Ready ✅

