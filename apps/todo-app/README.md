# Eliza Todo

An intelligent, AI-powered todo application built on Eliza Cloud.

## Features

- **Daily Habits** - Build lasting habits with streak tracking and bonus points
- **Priority Tasks** - Manage one-off tasks with P1-P4 prioritization
- **Aspirational Goals** - Set and achieve big goals
- **Gamification** - Level up from Beginner to Transcendent (10 levels)
- **AI Chat** - Natural language task management
- **Cloud Integration** - Powered by Eliza Cloud APIs
- **SMS Reminders** - Get text reminders via Twilio
- **Google Calendar** - Add tasks to your calendar
- **Push Notifications** - Browser notifications for task reminders
- **Pagination** - Efficient task loading for large lists

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Eliza Cloud running on port 3000

### Installation

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env.local

# Start development server
bun run dev
```

The app will be available at http://localhost:3002

### Environment Variables

| Variable                | Description                               | Default                 |
| ----------------------- | ----------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_CLOUD_URL` | Eliza Cloud URL for client-side API calls | `http://localhost:3000` |
| `CLOUD_URL`             | Eliza Cloud URL for server-side proxy     | `http://localhost:3000` |

## Architecture

### Authentication

Uses Eliza Cloud's pass-through authentication:

1. User clicks "Sign In" on todo app
2. App creates session via `POST /api/auth/app-session`
3. User redirected to Eliza Cloud login
4. After login, redirected back with token
5. Token stored in localStorage for API calls

### API Integration

All API calls go through the local proxy (`/api/proxy/*`) which forwards to Eliza Cloud with authentication headers.

### Data Storage

Tasks are stored using Eliza Cloud's App Storage API:

- `tasks` collection - Task documents
- `user_points` collection - Gamification data

### Gamification

Points system:

- **Daily tasks**: 10 base + 5 per streak day (max 50 bonus)
- **One-off tasks**: (5 - priority) \* 10 + urgent bonus
- **Aspirational goals**: 50 points

Levels:

1. Beginner (0)
2. Apprentice (100)
3. Journeyman (300)
4. Expert (600)
5. Master (1000)
6. Grandmaster (1500)
7. Legend (2200)
8. Mythic (3000)
9. Immortal (4000)
10. Transcendent (5500)

## Integrations

### Twilio SMS

Send SMS reminders for tasks:

1. Go to Settings in the app
2. Enter your Twilio credentials:
   - Account SID
   - Auth Token
   - From Number (your Twilio number)
   - Your phone number
3. Use the chat or MCP to send reminders: "remind me about [task] via SMS"

### Google Calendar

Add tasks to your Google Calendar:

1. Go to Settings in the app
2. Click "Connect" next to Google Calendar
3. Authorize calendar access
4. Use the chat or MCP to add events: "add [task] to my calendar"

### Push Notifications

Enable browser notifications:

1. Go to Settings in the app
2. Click "Enable" next to Push Notifications
3. Allow notifications when prompted
4. Set reminders on tasks to receive notifications

## Project Structure

```
todo-app/
├── app/
│   ├── api/proxy/[...path]/  # API proxy to Eliza Cloud
│   ├── auth/callback/        # OAuth callback handler
│   ├── chat/                 # AI chat interface
│   ├── dashboard/            # Main task management
│   ├── settings/             # Integrations settings
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Landing page
├── components/
│   ├── gamification/         # Level badge, points popup
│   ├── tasks/                # Task card, list, create dialog
│   └── ui/                   # Button, dialog, progress, tabs
├── lib/
│   ├── cloud-api.ts          # Eliza Cloud API client
│   ├── types.ts              # TypeScript types
│   ├── use-auth.ts           # Authentication hook
│   └── utils.ts              # Utility functions
└── package.json
```

## Testing

Tests are located in the main cloud repository:

```bash
# From cloud root
cd ../..

# Run todo app tests
bun test tests/unit/todoapp-logic.test.ts tests/integration/todoapp-*.test.ts
bun run playwright test todoapp
```

## Production Deployment

### Recommended Setup

1. **Environment Variables** - Set `NEXT_PUBLIC_CLOUD_URL` and `CLOUD_URL` to production endpoints
2. **Monitoring** - Add error tracking (Sentry, Datadog, or similar)
3. **CDN** - Deploy to Vercel, Cloudflare, or similar for edge caching

### Monitoring Integration

For production, add error monitoring. Example with Sentry:

```bash
bun add @sentry/nextjs
```

Then configure in `next.config.mjs`:

```javascript
import { withSentryConfig } from "@sentry/nextjs";
export default withSentryConfig(nextConfig, {
  /* options */
});
```

### Health Checks

The app relies on Eliza Cloud. Monitor:

- Cloud API availability (`GET /api/health`)
- MCP endpoint (`GET /api/mcp/todoapp`)
- Storage service (`GET /api/v1/app/storage/tasks`)

## License

Part of the Eliza Cloud project.
