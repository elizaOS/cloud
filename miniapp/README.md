# Create a Character - Miniapp

A Next.js application for creating and chatting with AI characters, powered by Eliza Cloud.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-blue)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

## 🚀 Quick Start

### Prerequisites

- Eliza Cloud running on `localhost:3000`
- Bun installed (`npm install -g bun`)

### Setup

1. **Seed the development database** (from the cloud repo root):

```bash
bun run db:miniapp:seed
```

This creates:
- A test organization with $100 credits
- A test user with a known wallet address
- A miniapp registration with localhost origins allowed
- An API key for the miniapp

2. **Copy the API key** from the seed script output to `miniapp/.env.local`:

```bash
# Required - API key from seed script
ELIZA_CLOUD_API_KEY=eliza_xxxxx...

# Required - Cloud URL
NEXT_PUBLIC_ELIZA_CLOUD_URL=http://localhost:3000

# Required - Privy credentials (same as cloud)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your_privy_client_id
```

3. **Install dependencies:**

```bash
cd miniapp
bun install
```

4. **Start the development server:**

```bash
bun run dev
```

5. **Open [http://localhost:3001](http://localhost:3001)**

### Test Wallet

For development and testing, use the standard hardhat/foundry test wallet:
- **Address**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Mnemonic**: `test test test test test test test test test test test junk`

⚠️ **Never use this wallet with real funds!**

## 📁 Project Structure

```
├── app/
│   ├── agents/              # Agent list and detail pages
│   │   ├── page.tsx         # List all agents
│   │   └── [id]/page.tsx    # Edit agent
│   ├── chats/               # Chat pages
│   │   ├── page.tsx         # List all chats
│   │   ├── [agentId]/       # Chats for an agent
│   │   │   ├── page.tsx
│   │   │   └── [chatId]/    # Chat interface
│   │   │       └── page.tsx
│   ├── settings/page.tsx    # User settings & billing
│   ├── api/
│   │   └── proxy/           # API proxy to Eliza Cloud
│   └── page.tsx             # Landing page
├── components/
│   ├── auth-button.tsx      # Privy login/logout
│   ├── header.tsx           # Navigation header
│   └── providers.tsx        # Privy & Theme providers
└── lib/
    └── cloud-api.ts         # Eliza Cloud API client
```

## ✨ Features

### Authentication
- Privy-based authentication (wallet, email, social)
- Session management
- Protected routes

### Agent Management
- Create new AI characters
- Edit agent properties (name, bio, avatar)
- Advanced editing (topics, adjectives, style, settings)
- Delete agents

### Chat
- Real-time chat with AI agents
- Streaming responses
- Chat history
- Multiple conversations per agent

### Billing
- Credit balance display
- Usage statistics
- Auto top-up status

## 🔧 API Proxy

The miniapp uses a proxy layer (`/api/proxy/*`) to communicate with Eliza Cloud:

| Miniapp Route | Cloud Route |
|---------------|-------------|
| `/api/proxy/user` | `/api/v1/miniapp/user` |
| `/api/proxy/agents` | `/api/v1/miniapp/agents` |
| `/api/proxy/agents/:id` | `/api/v1/miniapp/agents/:id` |
| `/api/proxy/agents/:id/chats` | `/api/v1/miniapp/agents/:id/chats` |
| `/api/proxy/billing` | `/api/v1/miniapp/billing` |
| `/api/proxy/stream/:roomId` | `/api/eliza/rooms/:roomId/messages/stream` |

The proxy automatically:
- Adds the API key from `ELIZA_CLOUD_API_KEY`
- Forwards cookies for Privy session auth
- Handles CORS

## 🧪 E2E Testing

Run end-to-end tests (requires both cloud and miniapp running):

```bash
# From e2e directory
cd e2e
bun install
bun run test
```

Tests cover:
- Page loading
- Auth redirects
- API proxy functionality
- CORS headers
- Cloud API authentication

## 📦 Build & Deploy

### Build for Production

```bash
bun run build
```

### Deploy to Vercel

1. Push code to GitHub
2. Import repository in Vercel
3. Set environment variables:
   - `ELIZA_CLOUD_API_KEY`
   - `NEXT_PUBLIC_ELIZA_CLOUD_URL`
   - `NEXT_PUBLIC_PRIVY_APP_ID`
   - `NEXT_PUBLIC_PRIVY_CLIENT_ID`
4. Deploy

### CORS Configuration

When deploying, add your miniapp domain to the cloud's app registry:

```typescript
await appsService.create({
  name: "Production Miniapp",
  allowed_origins: [
    "https://your-miniapp.vercel.app",
    "https://your-domain.com"
  ],
  // ...
});
```

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Authentication**: [Privy](https://privy.io/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Icons**: [Lucide Icons](https://lucide.dev/)

## 📄 License

MIT License
