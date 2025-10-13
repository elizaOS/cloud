# Eliza Cloud V2

A comprehensive AI agent development platform built with Next.js 15, featuring multi-model AI generation (text, image, video), full ElizaOS runtime integration, enterprise authentication, credit-based billing, and production-ready cloud infrastructure.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development](#development)
- [Platform Features](#platform-features)
- [Database Architecture](#database-architecture)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## 🎯 Overview

Eliza Cloud V2 is a full-stack AI-as-a-Service platform that combines:

- **Multi-Modal AI Generation**: Text chat, image creation, and video generation
- **ElizaOS Integration**: Full-featured autonomous agent runtime with memory, rooms, and plugins
- **SaaS Platform**: User management, API keys, credit-based billing, usage tracking
- **Container Deployment**: Deploy ElizaOS projects via `elizaos deploy` CLI to Cloudflare Workers
- **Enterprise Features**: WorkOS authentication, Stripe billing, artifact storage, health monitoring

## ✨ Key Features

### 🤖 AI Generation Studio

- **Text & Chat**: 
  - Multi-model support (GPT-4, Claude, Gemini, etc.) via AI SDK Gateway
  - Real-time streaming responses
  - Conversation persistence with full history
  - Model selection and configuration

- **Image Creation**: 
  - Google Gemini 2.5 Flash multimodal generation
  - High-quality images (1024x1024)
  - Automatic Vercel Blob storage
  - Base64 preview + downloadable files

- **Video Generation**: 
  - Multiple Fal.ai models: Veo3, Kling v2.1, MiniMax Hailuo
  - Long-form video support (up to 5 minutes)
  - Automatic Vercel Blob upload
  - Fallback handling with error recovery

### 🧠 ElizaOS Runtime Integration

- **Full Agent Runtime**: 
  - AgentRuntime from `@elizaos/core` with PostgreSQL database
  - Memory system with vector embeddings (384-3072 dimensions)
  - Rooms, participants, relationships, and entities
  - Plugin system with custom providers and actions

- **Character Creator**: 
  - AI-assisted character definition builder
  - Progressive JSON generation with live preview
  - Import/export ElizaOS-compatible character files
  - Support for all character fields (bio, style, plugins, knowledge, etc.)

- **Agent Chat Interface**: 
  - Chat with deployed ElizaOS agents via rooms
  - Message persistence and history
  - Real-time WebSocket updates (future)
  - Multi-agent conversations

### 💳 SaaS Platform Features

- **Credit System**: 
  - Purchase credits via Stripe integration
  - Automatic deduction for AI operations
  - Usage tracking per organization/user
  - Credit packs with volume pricing

- **API Key Management**: 
  - Generate API keys for programmatic access
  - Key rotation and regeneration
  - Rate limiting per key
  - Usage statistics and audit logs

- **Container Deployments**: 
  - Deploy ElizaOS projects via `elizaos deploy` CLI
  - Bootstrapper architecture for artifact-based deployments
  - R2 storage for deployment artifacts
  - Cloudflare Workers runtime
  - Health checks and monitoring

### 📊 Management & Analytics

- **Dashboard**: 
  - Usage overview with charts (Recharts)
  - Provider health monitoring
  - Credit activity timeline
  - Model usage breakdown

- **Gallery**: 
  - View all generated images and videos
  - Filter by type (image/video)
  - Download or delete media
  - Storage usage statistics

- **Analytics**: 
  - Usage records by model, provider, type
  - Cost breakdown and trends
  - Error tracking and success rates

### 🔐 Security & Infrastructure

- **Enterprise Auth**: 
  - WorkOS AuthKit with SSO support
  - Organization and user management
  - WorkOS sync for user profiles
  - Role-based access (admin, member)

- **Billing Integration**: 
  - Stripe Checkout for credit purchases
  - Webhook processing with idempotency
  - Tax ID collection for businesses
  - Invoice generation

- **Type Safety**: 
  - Full TypeScript coverage
  - Zod validation for API requests
  - Drizzle ORM with type-safe queries

## 🏗 Architecture

### Directory Structure

```
eliza-cloud-v2/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── v1/              # Versioned API
│   │   │   ├── chat/        # AI text generation
│   │   │   ├── generate-image/  # Image generation
│   │   │   ├── generate-video/  # Video generation
│   │   │   ├── gallery/     # Media gallery
│   │   │   ├── containers/  # Container management
│   │   │   ├── artifacts/   # Artifact upload/download
│   │   │   ├── api-keys/    # API key CRUD
│   │   │   ├── character-assistant/  # Character creator AI
│   │   │   ├── user/        # User info
│   │   │   └── models/      # Available AI models
│   │   ├── eliza/           # ElizaOS agent API
│   │   │   └── rooms/       # Agent rooms and messages
│   │   ├── stripe/          # Stripe webhooks and checkout
│   │   └── fal/             # Fal.ai proxy
│   ├── dashboard/           # Protected dashboard pages
│   │   ├── text/            # Text chat interface
│   │   ├── image/           # Image generation studio
│   │   ├── video/           # Video generation studio
│   │   ├── gallery/         # Generated media gallery
│   │   ├── containers/      # Container management UI
│   │   ├── api-keys/        # API key management
│   │   ├── billing/         # Credits and billing
│   │   ├── analytics/       # Usage analytics
│   │   ├── account/         # Account settings
│   │   ├── character-creator/  # Character builder
│   │   ├── eliza/           # ElizaOS agent chat
│   │   └── storage/         # Storage management
│   ├── actions/             # Server actions
│   │   ├── auth.ts          # Auth actions
│   │   ├── gallery.ts       # Gallery actions
│   │   ├── characters.ts    # Character CRUD
│   │   ├── conversations.ts # Conversation management
│   │   └── users.ts         # User actions
│   ├── layout.tsx           # Root layout with analytics
│   ├── page.tsx             # Landing page
│   └── globals.css          # Global styles (Tailwind)
├── components/              # React components
│   ├── chat/                # Chat interfaces
│   ├── image/               # Image generation UI
│   ├── video/               # Video generation UI
│   ├── gallery/             # Gallery grid and display
│   ├── containers/          # Container tables
│   ├── api-keys/            # API key management UI
│   ├── billing/             # Credit packs and billing
│   ├── character-creator/   # Character builder UI
│   ├── dashboard/           # Dashboard metrics and cards
│   ├── layout/              # Header, sidebar, navigation
│   ├── theme/               # Theme provider and toggle
│   ├── ui/                  # Reusable UI components (45+ components)
│   └── ai-elements/         # AI-specific UI components
├── db/                      # Database layer
│   ├── sass/                # SaaS platform schema
│   │   └── schema.ts        # Organizations, users, API keys, credits, etc.
│   ├── eliza/               # ElizaOS runtime schema
│   │   └── schema.ts        # Agents, memories, rooms, embeddings, etc.
│   ├── drizzle.ts           # Database client
│   └── migrations/          # Migration SQL files
├── lib/                     # Shared utilities
│   ├── queries/             # Database queries (12 files)
│   │   ├── api-keys.ts      # API key operations
│   │   ├── credits.ts       # Credit transactions
│   │   ├── containers.ts    # Container CRUD
│   │   ├── container-quota.ts  # Quota enforcement
│   │   ├── generations.ts   # Media generation records
│   │   ├── usage.ts         # Usage tracking
│   │   └── ...
│   ├── services/            # Business logic services
│   │   ├── cloudflare.ts    # Cloudflare Workers API
│   │   ├── r2-credentials.ts  # R2 temporary credentials
│   │   ├── health-monitor.ts  # Provider health checks
│   │   └── artifact-cleanup.ts  # Cleanup cron jobs
│   ├── eliza/               # ElizaOS integration
│   │   ├── agent-runtime.ts # AgentRuntime wrapper
│   │   ├── agent.ts         # Agent management
│   │   └── plugin-assistant/  # Custom ElizaOS plugin
│   ├── config/              # Configuration
│   │   ├── env-validator.ts # Environment validation
│   │   ├── env-consolidation.ts  # Config helpers
│   │   └── startup.ts       # Startup checks
│   ├── errors/              # Custom error classes
│   ├── middleware/          # Middleware utilities
│   ├── auth.ts              # Auth helpers
│   ├── blob.ts              # Vercel Blob utilities
│   ├── stripe.ts            # Stripe client
│   ├── pricing.ts           # Cost calculations
│   ├── rate-limiter.ts      # Rate limiting
│   ├── utils.ts             # General utilities
│   └── types.ts             # Shared TypeScript types
├── bootstrapper/            # Container bootstrapper
│   ├── Dockerfile           # Bootstrapper image
│   ├── bootstrap.sh         # Artifact download and run
│   ├── build.sh             # Build script
│   └── README.md            # Bootstrapper docs
├── docs/                    # Detailed documentation
│   ├── API_REFERENCE.md
│   ├── DEPLOYMENT.md
│   ├── STRIPE_SETUP.md
│   ├── R2_CLOUDFLARE_CREDENTIALS.md
│   └── ...
├── scripts/                 # Utility scripts
│   ├── seed-credit-packs.ts
│   └── ...
├── middleware.ts            # Next.js middleware (auth)
├── drizzle.config.ts        # Drizzle Kit config
└── package.json             # Dependencies
```

### Request Flow

```mermaid
graph TD
    A[Client Request] --> B[Next.js Middleware]
    B --> C{Auth Required?}
    C -->|Yes| D[WorkOS AuthKit]
    C -->|No| E[Route Handler]
    D -->|Authenticated| E
    D -->|Unauthenticated| F[Redirect to Login]
    E --> G{Request Type}
    G -->|AI Chat| H[AI SDK Gateway]
    G -->|Image/Video| I[Gemini/Fal.ai]
    G -->|Data| J[Drizzle ORM]
    G -->|Container| K[Cloudflare API]
    G -->|ElizaOS| L[AgentRuntime]
    H --> M[Response]
    I --> M
    J --> N[PostgreSQL]
    K --> M
    L --> N
    N --> M
```

### Dual Database Architecture

The platform uses two separate database schemas:

1. **SaaS Database** (`db/sass/schema.ts`): Platform infrastructure
   - Organizations, users, authentication
   - API keys, usage tracking
   - Credit system, billing, Stripe integration
   - Containers, artifacts, deployments
   - Generations (image/video records)
   - Conversations (platform-level chat)

2. **ElizaOS Database** (`db/eliza/schema.ts`): Agent runtime
   - Agents (character definitions)
   - Memories with vector embeddings
   - Rooms and participants
   - Entities and relationships
   - Components and tasks
   - Message servers and channels

## 🛠 Tech Stack

### Core Framework

- **Next.js 15.5.4**: React framework with App Router, Turbopack, and Server Actions
- **React 19.2.0**: Latest UI library with server components
- **TypeScript 5**: Full type safety

### Database & ORM

- **Neon Serverless PostgreSQL**: Auto-scaling serverless database
- **Drizzle ORM 0.44.6**: Type-safe SQL ORM
- **Drizzle Kit 0.31.5**: Migrations and schema management
- **pgvector**: Vector similarity search for embeddings

### Authentication & Billing

- **WorkOS AuthKit 2.9.0**: Enterprise SSO and user management
- **Stripe 19.1.0**: Payment processing and subscriptions
- **@stripe/stripe-js 8.0.0**: Client-side Stripe integration

### AI & Machine Learning

- **AI SDK 5.0.60**: Vercel AI SDK for streaming
- **@ai-sdk/gateway 1.0.33**: Multi-provider AI routing
- **@ai-sdk/openai 2.0.43**: OpenAI provider
- **@ai-sdk/react 2.0.60**: React hooks for AI
- **@fal-ai/client 1.6.2**: Fal.ai video generation
- **@elizaos/core 1.6.1**: ElizaOS agent runtime
- **@elizaos/plugin-openai 1.5.15**: OpenAI plugin for ElizaOS
- **@elizaos/plugin-sql 1.6.1**: SQL database plugin for ElizaOS

### Storage & Infrastructure

- **Vercel Blob 2.0.0**: Media storage (images/videos)
- **@aws-sdk/client-s3 3.908.0**: R2 artifact storage
- **@cloudflare/containers 0.0.28**: Cloudflare Workers deployment

### Styling & UI

- **Tailwind CSS 4.1.14**: Utility-first CSS framework
- **Radix UI**: 20+ accessible, unstyled UI primitives
- **Lucide React 0.545.0**: Icon library (1000+ icons)
- **class-variance-authority 0.7.1**: Component variants
- **next-themes 0.4.6**: Dark/light mode support
- **motion 12.23.22**: Animation library
- **Sonner 2.0.7**: Toast notifications
- **Recharts 2.15.4**: Charts for analytics

### Development Tools

- **ESLint 9.37.0**: Code linting
- **Prettier 3.6.2**: Code formatting
- **tsx 4.19.2**: TypeScript execution
- **Zod 4.1.11**: Schema validation

## 📦 Prerequisites

### Required Software

- **Node.js**: v20 or higher
- **npm**: v10 or higher
- **Git**: For version control

### Required Services

1. **Neon Database** ([neon.tech](https://neon.tech))
   - Create a new project
   - Copy the connection string

2. **WorkOS** ([workos.com](https://workos.com))
   - Create an organization and application
   - Configure redirect URI: `http://localhost:3000/api/auth/callback`
   - Note your Client ID and API Key

3. **OpenAI or AI Gateway** (at least one)
   - OpenAI API key for direct access, OR
   - AI Gateway API key for multi-provider access

### Optional Services

4. **Vercel Blob** ([vercel.com](https://vercel.com/storage))
   - Required for Gallery feature
   - Create a Blob store and copy token

5. **Fal.ai** ([fal.ai](https://fal.ai))
   - Required for video generation
   - Create account and get API key

6. **Cloudflare** ([cloudflare.com](https://cloudflare.com))
   - Required for container deployments
   - Account ID, API token, R2 credentials

7. **Stripe** ([stripe.com](https://stripe.com))
   - Required for billing/credits
   - Secret key and webhook secret

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd eliza-cloud-v2
bun install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp example.env.local .env.local
```

Edit `.env.local` with your credentials (see [example.env.local](example.env.local) for all options).

**Minimum required variables:**

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# WorkOS Authentication
WORKOS_CLIENT_ID=client_your_id_here
WORKOS_API_KEY=sk_your_key_here
WORKOS_COOKIE_PASSWORD=generate_a_random_32+_character_string
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback

# AI (at least one)
OPENAI_API_KEY=sk-your_openai_key
# OR
AI_GATEWAY_API_KEY=your_gateway_key
```

**Generate secure passwords:**

```bash
# Generate WORKOS_COOKIE_PASSWORD (min 32 chars)
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -hex 32
```

### 3. Database Setup

Run migrations to create all tables:

```bash
bun run db:push
```

For production, use migration files:

```bash
bun run db:generate
bun run db:migrate
```

### 4. Seed Credit Packs (Optional)

If using Stripe billing:

```bash
bun run seed:credit-packs
```

This creates credit pack products in Stripe.

### 5. Start Development Server

```bash
bun run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### 6. First Login

1. Click "Sign In" → WorkOS will create your user
2. You'll be redirected to the dashboard
3. Your organization starts with 10,000 credits

## 💻 Development

### Available Scripts

```bash
# Development
bun run dev              # Start dev server with Turbopack
bun run build            # Production build with Turbopack
bun start                # Start production server

# Database
bun run db:generate      # Generate migrations
bun run db:migrate       # Run migrations
bun run db:push          # Push schema changes (dev only)
bun run db:studio        # Open Drizzle Studio

# Code Quality
bun run lint             # Run ESLint
bun run lint:fix         # Auto-fix ESLint issues
bun run format           # Format with Prettier
bun run format:check     # Check formatting
bun run check-types      # TypeScript type checking

# Utilities
bun run seed:credit-packs   # Seed Stripe credit packs
bun run bootstrapper:build  # Build container bootstrapper
```

### Development Workflow

1. **Start dev server**: `bun run dev`
2. **Make changes**: Edit files in `app/`, `components/`, `lib/`
3. **Instant feedback**: Turbopack provides sub-second HMR
4. **Test features**: Navigate to `/dashboard` routes
5. **Check types**: `bun run check-types`
6. **Database changes**: Edit `db/*/schema.ts` → `bun run db:push`

### Project Structure Guidelines

- **`app/`**: Routes, API handlers, server actions
- **`components/`**: Reusable React components
- **`lib/`**: Business logic, database queries, services
- **`db/`**: Database schemas and migrations
- **Server Components**: Default for all components
- **Client Components**: Only when needed (`'use client'`)

## 🔧 Platform Features

### 1. AI Text Generation

**Location**: `/dashboard/text` and `/app/api/v1/chat/route.ts`

**Features**:
- Multi-model support (GPT-4, Claude, Gemini, etc.)
- Real-time streaming responses with `useChat` hook
- Conversation persistence with full history
- Model selection dropdown
- Token usage and cost tracking

**Usage**:

```typescript
import { useChat } from "@ai-sdk/react";

const { messages, input, handleSubmit, isLoading } = useChat({
  api: "/api/v1/chat",
  body: { model: "gpt-4o" }
});
```

**Cost**: Token-based pricing from `lib/pricing.ts`

### 2. AI Image Generation

**Location**: `/dashboard/image` and `/app/api/v1/generate-image/route.ts`

**Features**:
- Google Gemini 2.5 Flash multimodal generation
- High-quality 1024x1024 images
- Automatic Vercel Blob upload
- Base64 preview for instant display
- Download functionality

**API**: See [Accessing AI Endpoints with API Keys](#accessing-ai-endpoints-with-api-keys) for detailed usage examples.

**Cost**: 100 credits per image

### 3. AI Video Generation

**Location**: `/dashboard/video` and `/app/api/v1/generate-video/route.ts`

**Features**:
- Multiple Fal.ai models (Veo3, Kling v2.1, MiniMax Hailuo)
- Automatic Vercel Blob upload
- Progress tracking with queue updates
- Fallback video on errors

**API**: See [Accessing AI Endpoints with API Keys](#accessing-ai-endpoints-with-api-keys) for detailed usage examples and available models.

**Cost**: 500 credits per video

### 4. Gallery & Media Storage

**Location**: `/dashboard/gallery`

**Features**:
- View all generated images and videos
- Filter by type (image, video, all)
- Grid layout with thumbnails
- Full-size preview with details
- Download media files
- Delete from both DB and Vercel Blob
- Storage usage statistics

**Vercel Blob Benefits**:
- Global CDN delivery (19 edge regions)
- Public access with unguessable URLs
- Automatic caching
- No upload fees (only downloads charged)
- Hierarchical folder structure

**Setup**:

```bash
# 1. Create Blob store in Vercel Dashboard
# 2. Copy BLOB_READ_WRITE_TOKEN to .env.local
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_your_token
```

### 5. Container Deployments

**Location**: `/dashboard/containers` and `/app/api/v1/containers/route.ts`

**Features**:
- Deploy ElizaOS projects via `elizaos deploy` CLI
- Bootstrapper architecture for artifact-based deployments
- Cloudflare Workers runtime
- Health checks and monitoring
- Quota enforcement (prevents race conditions)
- Environment variable injection

**How It Works**:

1. User gets API key from `/dashboard/api-keys`
2. User runs `elizaos deploy --api-key eliza_xxxxx`
3. CLI uploads project artifact to R2 storage
4. Cloud API deploys bootstrapper container
5. Bootstrapper fetches artifact and runs project
6. Container accessible via Cloudflare URL

**Bootstrapper Architecture**:

```dockerfile
FROM node:20-alpine
COPY bootstrap.sh /bootstrap.sh
RUN chmod +x /bootstrap.sh
ENTRYPOINT ["/bootstrap.sh"]
```

The bootstrapper:
- Downloads artifact from R2 using temporary credentials
- Extracts tarball
- Installs dependencies
- Runs the project

**API**:

```bash
POST /api/v1/containers
Content-Type: application/json
Authorization: Bearer eliza_your_api_key

{
  "name": "my-agent",
  "port": 3000,
  "max_instances": 1,
  "environment_vars": {
    "NODE_ENV": "production"
  },
  "artifact_url": "https://r2.../artifact.tar.gz",
  "artifact_checksum": "sha256:abcd..."
}
```

**Requirements**:
- Cloudflare account with Workers
- R2 storage configured
- Environment variables set (see `docs/DEPLOYMENT.md`)

### 6. ElizaOS Agent Integration

**Location**: `/dashboard/eliza` and `lib/eliza/`

**Features**:
- Full `AgentRuntime` from `@elizaos/core`
- PostgreSQL-backed memory system
- Vector embeddings (384-3072 dimensions)
- Rooms for conversations
- Participants and relationships
- Custom plugins and providers

**Database Schema**:
- `agents`: Character definitions
- `memories`: Conversation history
- `embeddings`: Vector similarity search
- `rooms`: Conversation contexts
- `entities`: Users and participants
- `relationships`: Entity connections

**API**:

```bash
# Create room
POST /api/eliza/rooms
{
  "agentId": "uuid",
  "name": "Chat Room"
}

# Send message
POST /api/eliza/rooms/{roomId}/messages
{
  "content": "Hello, agent!",
  "authorId": "user-uuid"
}
```

### 7. Character Creator

**Location**: `/dashboard/character-creator` and `/app/api/v1/character-assistant/route.ts`

**Features**:
- AI-assisted character building using GPT-4o-mini
- Progressive JSON generation
- Live preview of character definition
- Import/export ElizaOS-compatible JSON
- Support for all character fields:
  - name, username, bio, system prompt
  - messageExamples, postExamples
  - topics, adjectives, style
  - plugins, knowledge, settings

**Workflow**:
1. User describes character in natural language
2. AI generates JSON incrementally
3. User sees live preview
4. AI suggests improvements
5. Export as ElizaOS character file

**Example**:

```json
{
  "name": "Alex",
  "bio": ["A friendly AI assistant", "Specializes in technical support"],
  "adjectives": ["helpful", "knowledgeable", "patient"],
  "system": "You are a helpful technical support agent...",
  "style": {
    "chat": ["Be concise", "Use bullet points"],
    "post": ["Be professional", "Include examples"]
  },
  "plugins": ["@elizaos/plugin-sql", "@elizaos/plugin-openai"]
}
```

### 8. API Key Management

**Location**: `/dashboard/api-keys` and `/app/api/v1/api-keys/route.ts`

**Features**:
- Generate API keys for programmatic access
- Key rotation and regeneration
- Rate limiting per key (default 1000 req/day)
- Usage tracking and statistics
- Expires_at support for time-limited keys

**Key Format**: `eliza_<random_32_chars>`

**API**:

```bash
# Create API key
POST /api/v1/api-keys
{
  "name": "Production API Key",
  "description": "Main production key",
  "rate_limit": 10000
}

# Regenerate key
POST /api/v1/api-keys/{id}/regenerate

# Delete key
DELETE /api/v1/api-keys/{id}
```

#### Accessing AI Endpoints with API Keys

All AI generation endpoints support API key authentication for programmatic access. Here's how to use them:

##### 1. Create an API Key

First, generate an API key from the dashboard:

1. Navigate to `/dashboard/api-keys`
2. Click "Create API Key"
3. Give it a name and optional rate limit
4. Copy the key (it's only shown once!)

Or create one programmatically (requires existing authentication):

```bash
curl -X POST https://www.elizacloud.ai/api/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{
    "name": "My API Key",
    "description": "For AI generation",
    "rate_limit": 10000
  }'
```

##### 2. Text Generation (Chat)

Use your API key to generate text responses:

```bash
curl -X POST https://www.elizacloud.ai/api/v1/chat \
  -H "Authorization: Bearer eliza_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ],
    "model": "gpt-4o"
  }'
```

**Streaming Response:**

```typescript
const response = await fetch('https://www.elizacloud.ai/api/v1/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer eliza_your_key_here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    model: 'gpt-4o',
  }),
});

// Stream the response
const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  console.log(chunk);
}
```

**Available Models**: `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet`, `gemini-2.0-flash`, etc.

**Cost**: Token-based pricing (varies by model)

##### 3. Image Generation

Generate images using Google Gemini:

```bash
curl -X POST https://www.elizacloud.ai/api/v1/generate-image \
  -H "Authorization: Bearer eliza_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene Japanese garden with cherry blossoms and a koi pond at sunset"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "url": "https://blob.vercel-storage.com/...",
    "base64": "data:image/png;base64,iVBORw0KG...",
    "generationId": "uuid",
    "creditsUsed": 100,
    "creditsRemaining": 9900
  }
}
```

**TypeScript Example:**

```typescript
async function generateImage(prompt: string) {
  const response = await fetch('https://www.elizacloud.ai/api/v1/generate-image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ELIZA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error);
  }

  return data.data;
}

// Usage
const result = await generateImage('A futuristic cityscape');
console.log('Image URL:', result.url);
console.log('Credits remaining:', result.creditsRemaining);
```

**Cost**: 100 credits per image

##### 4. Video Generation

Generate videos using Fal.ai models:

```bash
curl -X POST https://www.elizacloud.ai/api/v1/generate-video \
  -H "Authorization: Bearer eliza_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of a spaceship flying through colorful nebulae",
    "model": "fal-ai/veo3"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "url": "https://blob.vercel-storage.com/...",
    "generationId": "uuid",
    "model": "fal-ai/veo3",
    "duration": 5,
    "creditsUsed": 500,
    "creditsRemaining": 9400
  }
}
```

**Available Models**:
- `fal-ai/veo3` - Google Veo 3 (high quality)
- `fal-ai/veo3/fast` - Google Veo 3 Fast (faster generation)
- `fal-ai/kling-video/v2.1/master/text-to-video` - Kling Master (highest quality)
- `fal-ai/kling-video/v2.1/pro/text-to-video` - Kling Pro (balanced)
- `fal-ai/kling-video/v2.1/standard/text-to-video` - Kling Standard (fastest)
- `fal-ai/minimax/hailuo-02/pro/text-to-video` - MiniMax Hailuo Pro
- `fal-ai/minimax/hailuo-02/standard/text-to-video` - MiniMax Hailuo Standard

**Python Example:**

```python
import requests
import os

API_KEY = os.environ['ELIZA_API_KEY']
BASE_URL = 'https://www.elizacloud.ai/api/v1'

def generate_video(prompt: str, model: str = 'fal-ai/veo3'):
    response = requests.post(
        f'{BASE_URL}/generate-video',
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json',
        },
        json={
            'prompt': prompt,
            'model': model,
        }
    )
    
    data = response.json()
    
    if not data['success']:
        raise Exception(data['error'])
    
    return data['data']

# Usage
result = generate_video('A time-lapse of a city from day to night')
print(f"Video URL: {result['url']}")
print(f"Credits remaining: {result['creditsRemaining']}")
```

**Cost**: 500 credits per video

##### 5. Error Handling

Always handle errors appropriately:

```typescript
async function callAIEndpoint(endpoint: string, body: object) {
  try {
    const response = await fetch(`https://www.elizacloud.ai/api/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ELIZA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.success) {
      // Handle API errors
      switch (response.status) {
        case 401:
          throw new Error('Invalid API key');
        case 402:
          throw new Error('Insufficient credits');
        case 429:
          throw new Error('Rate limit exceeded');
        case 503:
          throw new Error('Service unavailable - feature not configured');
        default:
          throw new Error(data.error || 'Unknown error');
      }
    }

    return data.data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}
```

##### 6. Rate Limits

Default rate limits per API key:
- **Standard**: 1000 requests/day
- **Text Generation**: Token-based throttling
- **Image Generation**: No specific limit (credit-based)
- **Video Generation**: No specific limit (credit-based)

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: When the limit resets

##### 7. Security Best Practices

- **Never expose API keys** in client-side code or public repositories
- Store keys in environment variables: `process.env.ELIZA_API_KEY`
- Use different keys for development and production
- Rotate keys regularly using the regenerate endpoint
- Delete unused keys to prevent unauthorized access
- Monitor usage in `/dashboard/api-keys` for anomalies

### 9. Credit System & Billing

**Location**: `/dashboard/billing` and `lib/queries/credits.ts`

**Features**:
- Credit-based pricing model
- Stripe integration for purchases
- Credit packs with volume discounts
- Automatic deduction on usage
- Transaction history
- Organization-level balance

**Credit Costs**:
- **Text Chat**: Token-based (varies by model)
- **Image Generation**: 100 credits
- **Video Generation**: 500 credits
- **Container Deployment**: Based on instance hours

**Stripe Integration**:
- Credit pack products defined in Stripe
- Checkout session for purchases
- Webhook processing for fulfillment
- Idempotency for duplicate webhooks

**Credit Packs** (example):

```typescript
[
  { name: "Starter", credits: 10000, price: 9.99 },
  { name: "Pro", credits: 50000, price: 39.99 },
  { name: "Enterprise", credits: 200000, price: 129.99 }
]
```

**Setup**:

See `docs/STRIPE_SETUP.md` for detailed Stripe configuration.

### 10. Analytics & Monitoring

**Location**: `/dashboard/analytics` and `lib/queries/usage.ts`

**Features**:
- Usage records per request (tokens, cost, model)
- Provider health monitoring
- Model usage breakdown (Recharts)
- Credit activity timeline
- Error rate tracking
- Response time monitoring

**Metrics Tracked**:
- Input/output tokens
- Cost per request
- Duration (ms)
- Success/failure status
- IP address and user agent
- Model and provider used

**Provider Health**:
- Automatic health checks for AI providers
- Status: healthy, degraded, unhealthy
- Response time percentiles
- Error rate calculation

## 🗄 Database Architecture

### SaaS Schema (`db/sass/schema.ts`)

**Core Tables**:

- **organizations**: Multi-tenant organization data
  - credit_balance, stripe_customer_id
  - allowed_models, allowed_providers
  - webhook_url for notifications

- **users**: User accounts linked to organizations
  - workos_user_id for SSO
  - role: admin, member
  - is_active for deactivation

- **api_keys**: API authentication
  - key_hash for secure storage
  - rate_limit, usage_count
  - permissions array

- **credit_transactions**: Credit ledger
  - amount (positive or negative)
  - type: purchase, deduction, refund, adjustment
  - stripe_payment_intent_id for reconciliation

- **credit_packs**: Purchasable credit packages
  - stripe_price_id, stripe_product_id
  - sort_order for display

- **usage_records**: Per-request usage tracking
  - input_tokens, output_tokens
  - input_cost, output_cost
  - model, provider, type
  - is_successful, error_message

- **generations**: Image/video generation records
  - type: image, video
  - status: pending, completed, failed
  - storage_url (Vercel Blob)
  - dimensions, file_size, mime_type

- **containers**: Cloudflare container deployments
  - cloudflare_worker_id, cloudflare_url
  - status: pending, building, deploying, running, failed
  - environment_vars, max_instances, port
  - Unique constraint on (organization_id, name)

- **artifacts**: Deployment artifact storage
  - r2_key, r2_url (Cloudflare R2)
  - checksum, size, version
  - Unique constraint on (organization_id, project_id, version)

- **conversations**: Platform-level chat history
  - title, model, settings
  - message_count, total_cost

- **conversation_messages**: Messages in conversations
  - role: user, assistant, system
  - sequence_number for ordering
  - tokens, cost, processing_time

- **user_characters**: User-created ElizaOS characters
  - character_data (full JSON)
  - is_template, is_public
  - Stored separately from agents

- **model_pricing**: Dynamic pricing per model
  - input_cost_per_1k, output_cost_per_1k
  - effective_from, effective_until
  - is_active for versioning

- **provider_health**: AI provider status
  - status: healthy, degraded, unhealthy
  - response_time, error_rate
  - last_checked timestamp

- **jobs**: Background job queue
  - type, status: pending, in_progress, completed, failed
  - attempts, max_attempts
  - webhook_url for callbacks

### ElizaOS Schema (`db/eliza/schema.ts`)

**Agent Runtime Tables**:

- **agents**: Character definitions
  - name, username, bio, system
  - messageExamples, postExamples
  - topics, adjectives, style
  - plugins, knowledge, settings

- **memories**: Conversation history
  - type (message, document, fragment)
  - content (JSONB)
  - unique flag for deduplication
  - metadata with document references

- **embeddings**: Vector similarity search
  - Multiple dimension columns:
    - dim384, dim512, dim768 (small-large)
    - dim1024, dim1536, dim3072 (XL-XXXL)
  - memory_id foreign key

- **rooms**: Conversation contexts
  - source (discord, telegram, web, etc.)
  - type (DM, group, channel)
  - world_id optional reference
  - channel_id for platform mapping

- **participants**: Room membership
  - entity_id, room_id, agent_id
  - room_state for custom data

- **entities**: Users and participants
  - names array for aliases
  - metadata JSONB

- **relationships**: Entity connections
  - source_entity_id, target_entity_id
  - agent_id scope
  - tags array
  - Unique constraint prevents duplicates

- **components**: ECS-style data
  - entity_id, room_id, world_id
  - type, data JSONB

- **worlds**: High-level grouping
  - agent_id, name, server_id

- **tasks**: Scheduled agent tasks
  - name, description, tags
  - metadata JSONB

- **cache**: Key-value cache
  - key, agent_id composite primary key
  - expires_at for TTL

- **logs**: Audit trail
  - entity_id, room_id, type
  - body JSONB

- **message_servers**: Central messaging (future)
  - source_type, source_id
  - For multi-platform agents

- **channels**: Message channels
  - message_server_id
  - type (text, voice, DM, etc.)

- **central_messages**: Cross-platform messages
  - channel_id, author_id
  - in_reply_to_root_message_id for threads

### Database Migrations

**Generate migration**:

```bash
bun run db:generate
```

This creates SQL migration files in `db/migrations/`.

**Apply migration**:

```bash
bun run db:migrate
```

**Push schema (dev only)**:

```bash
bun run db:push
```

⚠️ **Never use `db:push` in production** - always use migrations.

### Race Condition Prevention

The platform implements atomic operations to prevent quota bypass:

**Example**: Container quota enforcement

```typescript
await db.transaction(async (tx) => {
  // 1. Lock organization row
  const org = await tx.select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update");
  
  // 2. Count containers while holding lock
  const count = await tx.select()
    .from(containers)
    .where(eq(containers.organization_id, orgId));
  
  // 3. Check quota
  if (count >= maxAllowed) throw new QuotaExceededError();
  
  // 4. Create container
  return await tx.insert(containers).values(data);
});
```

See `lib/queries/container-quota.ts` for full implementation.

## 🔌 API Reference

### Authentication

All API routes support two authentication methods:

1. **Session Cookie** (WorkOS): Automatic for logged-in users
2. **API Key Header**: `Authorization: Bearer eliza_your_key`

### Base URL

- Development: `http://localhost:3000`
- Production: `https://www.elizacloud.ai`

### Endpoints

#### AI Generation

For detailed examples, request/response formats, and code samples, see [Accessing AI Endpoints with API Keys](#accessing-ai-endpoints-with-api-keys).

**Quick Reference**:
- `POST /api/v1/chat` - Text generation with streaming support
- `POST /api/v1/generate-image` - Image generation (100 credits)
- `POST /api/v1/generate-video` - Video generation (500 credits)
- `GET /api/v1/models` - List available AI models

#### Gallery

```bash
# List Media
GET /api/v1/gallery?type=image&limit=50&offset=0

# Response:
{
  "items": [...],
  "count": 10,
  "hasMore": false
}
```

#### Containers

```bash
# List Containers
GET /api/v1/containers

# Create Container
POST /api/v1/containers
{
  "name": "my-agent",
  "port": 3000,
  "artifact_url": "https://...",
  "environment_vars": {...}
}

# Get Container
GET /api/v1/containers/{id}

# Delete Container
DELETE /api/v1/containers/{id}

# Check Quota
GET /api/v1/containers/quota
```

#### Artifacts

```bash
# Upload Artifact
POST /api/v1/artifacts/upload
{
  "project_id": "my-project",
  "version": "1.0.0",
  "checksum": "sha256:...",
  "size": 1048576
}

# List Artifacts
GET /api/v1/artifacts?project_id=my-project

# Get Stats
GET /api/v1/artifacts/stats
```

#### API Keys

See [API Key Management](#8-api-key-management) for detailed usage.

**Quick Reference**:
- `POST /api/v1/api-keys` - Create new API key
- `GET /api/v1/api-keys` - List all keys
- `POST /api/v1/api-keys/{id}/regenerate` - Regenerate key
- `DELETE /api/v1/api-keys/{id}` - Delete key

#### User Info

```bash
# Get Current User
GET /api/v1/user

# Response:
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "organization": {...},
  "credit_balance": 5000
}
```

#### ElizaOS Agents

```bash
# Create Room
POST /api/eliza/rooms
{
  "agentId": "uuid",
  "name": "Chat"
}

# Get Room Messages
GET /api/eliza/rooms/{roomId}/messages

# Send Message
POST /api/eliza/rooms/{roomId}/messages
{
  "content": "Hello!",
  "authorId": "user-uuid"
}
```

### Rate Limiting

- **Default**: 1000 requests/day per API key
- **Container Deployments**: 5 per 5 minutes
- **Billing Endpoints**: 100 per hour

Rate limits return:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 3600
}
```

### Error Responses

```json
{
  "success": false,
  "error": "Error message",
  "details": {...}
}
```

HTTP Status Codes:
- `400`: Bad Request (validation error)
- `401`: Unauthorized (missing/invalid auth)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error
- `503`: Service Unavailable (feature not configured)

## 🚢 Deployment

### Deploying to Vercel (Recommended)

**1. Push to GitHub**:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

**2. Import to Vercel**:

- Go to [vercel.com/new](https://vercel.com/new)
- Import your repository
- Vercel auto-detects Next.js

**3. Configure Environment Variables**:

Add all variables from `.env.local` in Vercel dashboard:

- `DATABASE_URL`
- `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (use production URL)
- `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `FAL_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`
- `CRON_SECRET`

**4. Update WorkOS Redirect URI**:

- Add production callback URL to WorkOS dashboard
- Format: `https://www.elizacloud.ai/api/auth/callback`

**5. Deploy**:

- Click "Deploy"
- Vercel automatically builds and deploys
- Database migrations run on build

**6. Configure Stripe Webhook**:

- Add webhook endpoint in Stripe dashboard
- URL: `https://www.elizacloud.ai/api/stripe/webhook`
- Select events: `checkout.session.completed`, `payment_intent.succeeded`

### Database Migrations in Production

Vercel runs migrations automatically via build script. For manual migration:

```bash
# Connect to production database
DATABASE_URL=postgres://prod-url bun run db:migrate
```

### Monitoring

- **Vercel Analytics**: Built-in (automatically enabled)
- **Logs**: View in Vercel dashboard
- **Error Tracking**: Console logs captured
- **Provider Health**: Check `/dashboard/analytics`

## 🐛 Troubleshooting

### Common Issues

#### 1. Database Connection Errors

**Error**: `Connection refused` or `SSL required`

**Solutions**:
- Verify `DATABASE_URL` includes `?sslmode=require`
- Check Neon dashboard for correct connection string
- Ensure database is not paused (serverless auto-pause)

#### 2. Authentication Loops

**Error**: Continuous redirect between app and WorkOS

**Solutions**:
- Verify `NEXT_PUBLIC_WORKOS_REDIRECT_URI` matches exactly in WorkOS dashboard
- Check callback route exists: `/app/callback/route.ts`
- Clear browser cookies
- Ensure `WORKOS_COOKIE_PASSWORD` is at least 32 characters

#### 3. Environment Variables Not Loading

**Error**: `undefined` values in runtime

**Solutions**:
- Restart dev server after changing `.env.local`
- Ensure file is named exactly `.env.local` (not `.env`)
- Public variables must start with `NEXT_PUBLIC_`
- In production, verify all variables set in Vercel dashboard

#### 4. Container Deployment Fails

**Error**: "Container deployment failed" or "Deployment timeout"

**Solutions**:
- Check `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are correct
- Verify R2 credentials:
  - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - `R2_ENDPOINT` format: `https://account_id.r2.cloudflarestorage.com`
  - `R2_BUCKET_NAME` exists in Cloudflare
- Check quota: `GET /api/v1/containers/quota`
- View logs in Cloudflare Workers dashboard

See `docs/DEPLOYMENT_TROUBLESHOOTING.md` for detailed troubleshooting.

#### 5. Artifact Upload Fails

**Error**: "Failed to upload artifact" or "Artifact upload timeout"

**Solutions**:
- Check artifact size (max 500MB)
- Verify R2 credentials with AWS CLI:
  ```bash
  aws s3 ls --endpoint-url=$R2_ENDPOINT s3://eliza-artifacts/
  ```
- Check network allows S3 API calls
- Increase timeout for large files

#### 6. Image/Video Generation Fails

**Error**: "No image/video was generated" or timeout

**Solutions**:
- **Image**: Verify Google Gemini access in AI Gateway or OpenAI API key
- **Video**: Check `FAL_KEY` is set correctly
- Try simpler prompts first
- Check rate limits in provider dashboard
- View error in `/dashboard/analytics`

#### 7. Credits Not Deducting

**Error**: Usage not tracking or credits not deducted

**Solutions**:
- Check `credit_transactions` table for records
- Verify organization `credit_balance` column
- Check for database transaction errors in logs
- Ensure `calculateCost()` is being called

#### 8. Stripe Webhook Not Working

**Error**: Credits not added after purchase

**Solutions**:
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check webhook endpoint URL is correct
- View webhook events in Stripe dashboard → Developers → Webhooks
- Test locally with Stripe CLI:
  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```

### Getting Help

- Check detailed docs in `/docs` folder
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs)
- [WorkOS Documentation](https://workos.com/docs)
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [ElizaOS Documentation](https://github.com/elizaos/eliza)

## 📚 Additional Resources

### Core Framework

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Turbopack](https://turbo.build/pack)

### Database & ORM

- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Neon Serverless PostgreSQL](https://neon.tech/docs)
- [Drizzle Kit Guide](https://orm.drizzle.team/kit-docs/overview)
- [pgvector](https://github.com/pgvector/pgvector)

### AI & Machine Learning

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [AI SDK Gateway Guide](https://sdk.vercel.ai/docs/ai-sdk-core/providers-and-models)
- [Google Gemini API](https://ai.google.dev/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic Claude API](https://docs.anthropic.com)
- [Fal.ai Documentation](https://fal.ai/docs)
- [ElizaOS Repository](https://github.com/elizaos/eliza)

### Authentication & Billing

- [WorkOS AuthKit Guide](https://workos.com/docs/authkit)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)

### Storage & Infrastructure

- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Blob Pricing](https://vercel.com/docs/storage/vercel-blob/pricing)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)

### UI & Styling

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Lucide Icons](https://lucide.dev)
- [next-themes Documentation](https://github.com/pacocoursey/next-themes)
- [Recharts](https://recharts.org/)

### Development Tools

- [ESLint](https://eslint.org/docs)
- [Prettier](https://prettier.io/docs)
- [Zod](https://zod.dev/)

## 📄 License

See the LICENSE file in the repository root.

---

**Built with ❤️ for the ElizaOS ecosystem**
