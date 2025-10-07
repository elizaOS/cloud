# Eliza Cloud V2

A modern AI agent development platform built with Next.js 15, featuring multi-model text generation, AI image creation, enterprise authentication, and production-ready cloud infrastructure.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development](#development)
- [Services & Components](#services--components)
- [Database Management](#database-management)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## 🎯 Overview

Eliza Cloud V2 is a full-stack AI agent development platform that provides:

- **User Authentication**: Secure authentication powered by WorkOS AuthKit with SSO support
- **AI Text Generation**: Multi-model chat interface with support for GPT-4, Claude, and more
- **AI Image Generation**: Advanced image creation using Google Gemini 2.5 Flash with multimodal capabilities
- **Model Gateway**: Unified API for accessing multiple AI models through AI SDK Gateway
- **Database Integration**: Serverless PostgreSQL with Neon and Drizzle ORM for state management
- **Container Deployment**: Support for deploying custom containers via Cloudflare Containers
- **Modern UI**: Beautiful, responsive interface built with React 19, Next.js 15, and Tailwind CSS v4
- **Theme Support**: Dark and light mode with persistent user preferences
- **Production Ready**: Configured for deployment on Vercel with real-time analytics
- **Type Safety**: Full TypeScript support throughout the stack

## ✨ Key Features

### 🤖 AI Generation Studio

- **Text & Chat**: Engage with multiple AI models (GPT-4, Claude, etc.) in a beautiful chat interface
- **Image Creation**: Generate high-quality images from text descriptions using Google Gemini 2.5 Flash
- **Video Generation**: Create AI-powered videos using Fal.ai models (Veo3, Kling, MiniMax Hailuo)
- **Model Selection**: Switch between different AI models on the fly
- **Real-time Streaming**: See AI responses appear in real-time
- **Cloud Storage**: Automatic upload to Vercel Blob for persistent media storage

### 🎨 User Experience

- **Modern Dashboard**: Clean, intuitive interface with sidebar navigation
- **Dark/Light Mode**: Full theme support with system preference detection
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Beautiful Animations**: Smooth transitions and loading states

### 🔐 Security & Infrastructure

- **Enterprise Auth**: WorkOS AuthKit with SSO support
- **Protected Routes**: Middleware-based authentication for secure pages
- **Type Safety**: Full TypeScript coverage for reliability
- **Container Support**: Deploy custom containers with Cloudflare

### 📊 Management & Analytics

- **Usage Analytics**: Track your AI usage and costs
- **API Key Management**: Secure API key storage and rotation
- **Media Gallery**: Browse, download, and manage generated images and videos with Vercel Blob storage
- **Account Settings**: Customize your profile and preferences

## 🏗 Architecture

```
eliza-cloud-v2/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── auth/            # Authentication endpoints
│   │   │   └── callback/    # OAuth callback handler
│   │   ├── chat/            # AI chat/text generation
│   │   ├── generate-image/  # AI image generation
│   │   └── models/          # Available AI models list
│   ├── dashboard/           # Protected dashboard pages
│   │   ├── text/            # Text & chat interface
│   │   ├── image/           # Image generation studio
│   │   ├── gallery/         # Generated content gallery
│   │   ├── containers/      # Container management
│   │   ├── storage/         # Cloud storage management
│   │   ├── api-keys/        # API key management
│   │   ├── analytics/       # Usage analytics
│   │   ├── account/         # User account settings
│   │   └── layout.tsx       # Dashboard layout with sidebar
│   ├── actions/             # Server actions
│   ├── layout.tsx           # Root layout with analytics
│   ├── page.tsx             # Landing page
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── chat/                # Chat interface components
│   ├── image/               # Image generation components
│   ├── layout/              # Layout components (header, sidebar)
│   ├── theme/               # Theme provider and toggle
│   └── ui/                  # Reusable UI components
├── db/                      # Database layer
│   ├── schema.ts            # Drizzle schema definitions
│   ├── drizzle.ts           # Database client setup
│   └── migrations/          # Database migration files
├── lib/                     # Shared utilities
│   └── utils.ts             # Helper functions (cn, etc.)
├── public/                  # Static assets
├── middleware.ts            # Next.js middleware (auth)
└── drizzle.config.ts        # Drizzle Kit configuration
```

### Request Flow

```mermaid
graph LR
    A[Client Request] --> B[Next.js Middleware]
    B --> C{Auth Required?}
    C -->|Yes| D[WorkOS AuthKit]
    C -->|No| E[Route Handler]
    D -->|Authenticated| E
    D -->|Unauthenticated| F[Redirect to Login]
    E --> G{Request Type}
    G -->|AI Request| H[AI SDK Gateway]
    G -->|Data Request| I[Drizzle ORM]
    H --> J[LLM Providers]
    I --> K[Neon PostgreSQL]
    J --> L[Response to Client]
    K --> L
```

## 🛠 Tech Stack

### Core Framework

- **Next.js 15.5.4**: React framework with App Router and Turbopack
- **React 19.1.0**: UI library with latest features
- **TypeScript 5**: Type-safe development

### Database & ORM

- **Neon Serverless PostgreSQL**: Serverless, auto-scaling PostgreSQL
- **Drizzle ORM 0.44.5**: TypeScript ORM for SQL databases
- **Drizzle Kit 0.31.5**: Database migrations and schema management

### Authentication

- **WorkOS AuthKit 2.9.0**: Enterprise-grade authentication
  - SSO support
  - OAuth providers
  - User management

### AI & Machine Learning

- **AI SDK 5.0.59**: Vercel AI SDK for streaming AI responses
- **AI SDK Gateway 1.0.32**: Unified interface for multiple AI providers
- **AI SDK React 2.0.59**: React hooks for AI chat and streaming
- **Model Support**:
  - GPT-4, GPT-4 Turbo, GPT-3.5 (OpenAI)
  - Claude 3 Opus, Sonnet, Haiku (Anthropic)
  - Gemini 2.5 Flash (Google) - Text and Image generation
  - Open-source models via compatible providers

### Styling & UI

- **Tailwind CSS v4**: Utility-first CSS framework with modern features
- **Radix UI**: Accessible, unstyled UI components
- **Lucide React**: Beautiful icon library with 1000+ icons
- **class-variance-authority**: Type-safe component variants
- **tw-animate-css**: Animation utilities
- **next-themes**: Theme management with dark/light mode
- **Sonner**: Toast notifications

### Analytics & Monitoring

- **Vercel Analytics**: Real-time web analytics and performance monitoring

### Infrastructure

- **Cloudflare Containers**: Container deployment and orchestration
- **Neon Branching**: Database branching for preview environments

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v20 or higher
- **npm**: v10 or higher (comes with Node.js)
- **Git**: For version control

### Required Accounts

1. **Neon Database**: [neon.tech](https://neon.tech)
   - Create a new project
   - Copy the connection string

2. **WorkOS**: [workos.com](https://workos.com)
   - Create an organization
   - Set up an application
   - Note your Client ID and API Key
   - Configure redirect URI (e.g., `http://localhost:3000/api/auth/callback`)

3. **AI Gateway**: AI SDK Gateway or compatible provider
   - Set up your AI Gateway API key
   - Configure model access for OpenAI, Anthropic, Google, etc.

4. **Vercel** (for deployment): [vercel.com](https://vercel.com)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
cd eliza-cloud-v2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file:

```bash
cp example.env.local .env.local
```

Edit `.env.local` and add your credentials:

```env
# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# WorkOS Authentication
WORKOS_CLIENT_ID=your_workos_client_id
WORKOS_API_KEY=your_workos_api_key
WORKOS_COOKIE_PASSWORD=your_secure_random_string_min_32_chars
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback

# AI Gateway
AI_GATEWAY_API_KEY=your_ai_gateway_api_key

# Vercel Blob Storage (for Gallery feature)
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# Fal.ai (for Video Generation)
FAL_KEY=your_fal_api_key
```

**Important**:

- Generate a secure `WORKOS_COOKIE_PASSWORD` (minimum 32 characters)
- Configure `AI_GATEWAY_API_KEY` to access multiple AI models
- Set up `BLOB_READ_WRITE_TOKEN` from Vercel Blob for media storage (see [Vercel Blob Setup](#vercel-blob-storage))
- Add `FAL_KEY` from Fal.ai for video generation capabilities
- For production, update `NEXT_PUBLIC_WORKOS_REDIRECT_URI` to your production domain

### 4. Database Setup

Run database migrations:

```bash
npx drizzle-kit push:pg
```

Or for a more controlled migration:

```bash
npx drizzle-kit generate:pg
npx drizzle-kit migrate
```

### 5. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your application.

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev          # Start dev server with Turbopack (fast HMR)

# Building
npm run build        # Create production build

# Production
npm start            # Start production server (requires build first)

# Code Quality
npm run lint         # Run ESLint
```

### Development Workflow

1. **Start the dev server**: `npm run dev`
2. **Make changes**: Edit files in `app/`, `db/`, or `lib/`
3. **See changes instantly**: Turbopack provides instant feedback
4. **Test authentication**: Navigate to protected routes to trigger auth flow
5. **Check database**: Use Drizzle Studio or your database client

### Hot Module Replacement

With Turbopack, changes are reflected instantly without full page reloads:

- Edit React components → instant update
- Modify styles → instant update
- Change API routes → automatic restart

## 🔧 Services & Components

### Dashboard Overview

The platform includes a comprehensive dashboard with the following pages:

- **Text & Chat** (`/dashboard/text`): Multi-model AI chat interface
- **Image Generation** (`/dashboard/image`): AI-powered image creation
- **Gallery** (`/dashboard/gallery`): View and manage generated content
- **Containers** (`/dashboard/containers`): Deploy and manage containerized applications
- **Storage** (`/dashboard/storage`): Cloud storage management
- **API Keys** (`/dashboard/api-keys`): Manage API authentication
- **Analytics** (`/dashboard/analytics`): Usage statistics and insights
- **Account** (`/dashboard/account`): Profile and preferences

### 1. AI Text Generation Service

**Location**: `/app/api/chat/route.ts` and `/components/chat/chat-interface.tsx`

**Features**:

- Multi-model support (GPT-4, Claude, etc.)
- Real-time streaming responses
- Chat history management
- Model selection interface
- Dynamic model list from AI Gateway

**Usage**:

```typescript
import { useChat } from "@ai-sdk/react";

const { messages, sendMessage, status } = useChat({
  id: selectedModel,
});
```

**How it works**:

1. User types a message in the chat interface
2. Frontend calls `/api/chat` with the message and selected model
3. API uses AI SDK to stream responses from the chosen model
4. Messages display in real-time with typing indicators
5. Full conversation history maintained

### 2. AI Image Generation Service

**Location**: `/app/api/generate-image/route.ts` and `/components/image/image-generator.tsx`

**Features**:

- Text-to-image generation using Google Gemini 2.5 Flash
- Multimodal output (both text and image)
- Base64 image encoding for instant display
- Download functionality
- High-quality image generation (1024x1024)

**Usage**:

```typescript
const response = await fetch("/api/generate-image", {
  method: "POST",
  body: JSON.stringify({ prompt: "Your description" }),
});
const { image, text } = await response.json();
```

**How it works**:

1. User provides a detailed image description
2. API calls Gemini 2.5 Flash with multimodal capabilities
3. Model generates both an image and descriptive text
4. Image returned as base64 for instant display
5. User can download or generate new variations

### 3. Model Gateway Service

**Location**: `/app/api/models/route.ts`

**How it works**:

- Fetches available models from AI SDK Gateway
- Caches results for 1 hour (revalidate: 3600)
- Provides unified interface for multiple AI providers
- Supports dynamic model discovery

**API Endpoint**:

```bash
GET /api/models
```

**Response**:

```json
{
  "models": [
    { "id": "gpt-4o", "name": "GPT-4 Optimized", "provider": "openai" },
    { "id": "claude-3-opus", "name": "Claude 3 Opus", "provider": "anthropic" }
  ]
}
```

### 4. Authentication Service (WorkOS AuthKit)

**Location**: Middleware and `/app/api/auth/callback/route.ts`

**How it works**:

- **Middleware Protection**: `middleware.ts` intercepts all requests
- **Session Management**: WorkOS handles secure session cookies
- **OAuth Flow**: Supports multiple identity providers
- **Callback Handler**: `/api/auth/callback` processes authentication results

**Usage**:

```typescript
import { getSignInUrl, signOut, getUser } from "@workos-inc/authkit-nextjs";

// Get current user in Server Components
const user = await getUser();

// Get sign-in URL
const signInUrl = await getSignInUrl();

// Sign out
await signOut();
```

**Configuration**:

```typescript
// middleware.ts
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/api/models"],
  },
});
```

- Landing page (`/`) and model list API are public
- All dashboard routes are protected automatically
- Middleware runs on all routes except static assets and images
- Custom matcher pattern excludes `_next/static`, `_next/image`, and image files

### 5. Database Service (Neon + Drizzle)

**Location**: `/db/`

**How it works**:

- **Drizzle ORM**: Type-safe database client
- **Neon Serverless**: Auto-scaling PostgreSQL via HTTP
- **Schema Definition**: Type-safe table schemas in `db/schema.ts`
- **Migration System**: Version-controlled database changes

**Schema Example** (Current):

```typescript
export const todo = pgTable("todo", {
  id: integer("id").primaryKey(),
  text: text("text").notNull(),
  done: boolean("done").default(false).notNull(),
});
```

**Usage**:

```typescript
import { db } from "@/db/drizzle";
import { todo } from "@/db/schema";

// Query data
const todos = await db.select().from(todo);

// Insert data
await db.insert(todo).values({
  text: "Learn Drizzle ORM",
  done: false,
});

// Update data
await db.update(todo).set({ done: true }).where(eq(todo.id, 1));
```

**Connection Details**:

- Uses `@neondatabase/serverless` for HTTP-based queries
- Serverless-friendly (no persistent connections)
- Automatic connection pooling
- Edge-compatible

### 6. Theme Service

**Location**: `/components/theme/` and `/app/layout.tsx`

**Features**:

- Dark and light mode support
- System preference detection
- Persistent theme selection (localStorage)
- Smooth theme transitions
- Theme toggle component in header

**How it works**:

```typescript
import { ThemeProvider } from '@/components/theme/theme-provider';

// In root layout
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {children}
</ThemeProvider>
```

**Usage**:

- Theme toggle button in navigation
- Automatically respects system preferences
- User selection persists across sessions

### 7. UI Components

**Location**: `/components/ui/` and `/lib/utils.ts`

**Available Components**:

- **Button**: Multiple variants and sizes
- **Card**: Container component with header/content sections
- **Badge**: Status and label indicators
- **Skeleton**: Loading placeholders
- All components built with Radix UI primitives

**Utility Functions**:

```typescript
import { cn } from '@/lib/utils';

// Merge classes conditionally
className={cn(
  "base-class",
  isActive && "active-class",
  props.className
)}
```

**Features**:

- Full TypeScript support
- Accessible by default (Radix UI)
- Customizable with Tailwind CSS
- Responsive design patterns

### 8. Analytics Service (Vercel Analytics)

**Location**: `/app/layout.tsx`

**How it works**:

- **Automatic Tracking**: Page views and Web Vitals
- **Privacy-Friendly**: GDPR compliant
- **Real-time Dashboard**: Available in Vercel dashboard
- **Zero Configuration**: Works out of the box when deployed to Vercel
- **Performance Monitoring**: Core Web Vitals tracking

### 9. Gallery & Media Storage (Vercel Blob)

**Location**: `/app/dashboard/gallery/`, `/lib/blob.ts`, `/app/actions/gallery.ts`

**How it works**:

The Gallery feature provides a centralized location to view, manage, and download all AI-generated images and videos. Media files are automatically uploaded to Vercel Blob for reliable, scalable cloud storage.

**Features**:

- **Automatic Upload**: Images and videos are automatically uploaded to Vercel Blob after generation
- **Media Grid Display**: Beautiful grid layout with image previews and video thumbnails
- **Filter by Type**: View all media, or filter by images or videos only
- **Media Details**: View full-size media with generation details (prompt, model, dimensions, file size)
- **Download**: Download any media file to your local device
- **Delete**: Remove media from both the database and Vercel Blob storage
- **Usage Statistics**: Track total images, videos, and storage used

**Vercel Blob Storage**:

Vercel Blob is used for persistent storage of generated media with the following benefits:

- **Global CDN**: Fast delivery from 19 regional hubs worldwide
- **Public Access**: Direct URL access with unguessable paths
- **Cost-Efficient**: 3x more cost-efficient than Fast Data Transfer
- **No Upload Fees**: Only pay for downloads (outbound traffic)
- **Automatic Caching**: Browser and edge caching for optimal performance
- **File Organization**: Hierarchical folder structure (`images/userId/timestamp-filename`)

**Setup**:

1. Create a Vercel Blob store in your Vercel account:
   - Go to the [Vercel Dashboard](https://vercel.com/dashboard)
   - Navigate to Storage → Create → Blob
   - Select your preferred region (closest to your users)
   - Copy the `BLOB_READ_WRITE_TOKEN`

2. Add the token to your `.env.local`:
   ```env
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```

3. Deploy your application - the Gallery will automatically start uploading media to Vercel Blob

**API Endpoints**:

```bash
# List user's media
GET /api/v1/gallery?type=image&limit=100&offset=0

# Response
{
  "items": [
    {
      "id": "uuid",
      "type": "image",
      "url": "https://...blob.vercel-storage.com/...",
      "prompt": "A beautiful sunset",
      "model": "google/gemini-2.5-flash-image-preview",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "dimensions": { "width": 1024, "height": 1024 },
      "fileSize": "2048576"
    }
  ],
  "count": 1,
  "hasMore": false
}
```

**Server Actions**:

```typescript
import { listUserMedia, deleteMedia, getUserMediaStats } from '@/app/actions/gallery';

// List media
const items = await listUserMedia({ type: 'image', limit: 50 });

// Delete media
await deleteMedia(generationId);

// Get statistics
const stats = await getUserMediaStats();
// { totalImages: 10, totalVideos: 5, totalSize: 52428800 }
```

**Blob Utility Functions**:

```typescript
import { uploadBase64Image, uploadFromUrl, deleteBlob } from '@/lib/blob';

// Upload base64 image
const result = await uploadBase64Image(base64Data, {
  filename: 'myimage.png',
  folder: 'images',
  userId: user.id,
});

// Upload from URL (for videos)
const result = await uploadFromUrl('https://example.com/video.mp4', {
  filename: 'myvideo.mp4',
  contentType: 'video/mp4',
  folder: 'videos',
  userId: user.id,
});

// Delete blob
await deleteBlob(blobUrl);
```

**Storage Pricing**:

- **Storage**: Measured as GB-month average (snapshot every 15 minutes)
- **Operations**: 
  - Simple operations: `head()` and cache MISS reads
  - Advanced operations: `put()`, `copy()`, `list()` (uploads are free)
  - Delete operations: Free (no billing charge)
- **Data Transfer**: Only downloads (outbound) are charged

For detailed pricing, see [Vercel Blob Pricing](https://vercel.com/docs/storage/vercel-blob/pricing).

## 🗄 Database Management

### Creating Migrations

When you modify the schema in `db/schema.ts`:

```bash
# Generate migration files
npx drizzle-kit generate:pg

# Apply migrations
npx drizzle-kit migrate

# Or push directly (dev only)
npx drizzle-kit push:pg
```

### Drizzle Studio

Explore your database with Drizzle Studio:

```bash
npx drizzle-kit studio
```

This opens a visual database browser at `https://local.drizzle.studio`

### Adding New Tables

1. Edit `db/schema.ts`:

```typescript
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

2. Generate migration:

```bash
npx drizzle-kit generate:pg
```

3. Review the migration in `db/migrations/`

4. Apply the migration:

```bash
npx drizzle-kit migrate
```

### Database Best Practices

- Always use migrations in production (never `push:pg`)
- Test migrations on a staging database first
- Back up your database before running migrations
- Use transactions for data migrations
- Keep schema.ts as the single source of truth

## 🔐 Authentication

### How Authentication Works

1. **User visits protected route**
2. **Middleware intercepts** request (`middleware.ts`)
3. **Checks for valid session** cookie
4. **If no session**: Redirects to WorkOS sign-in page
5. **User authenticates** with chosen provider
6. **WorkOS redirects** to `/api/auth/callback`
7. **Callback handler** validates and creates session
8. **User redirected** to original destination

### Protecting Routes

**Option 1: Protect Everything (Default)**

```typescript
// middleware.ts
export default authkitMiddleware();
// All routes are protected
```

**Option 2: Protect Specific Routes**

```typescript
// middleware.ts
export default authkitMiddleware();

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/protected/:path*"],
};
```

**Option 3: Public by Default**

```typescript
// middleware.ts
export default authkitMiddleware();

export const config = {
  matcher: ["/((?!api/public|_next/static|_next/image|favicon.ico).*)"],
};
```

### Getting User Information

**In Server Components**:

```typescript
import { getUser } from '@workos-inc/authkit-nextjs';

export default async function ProfilePage() {
  const user = await getUser();

  if (!user) {
    return <div>Not authenticated</div>;
  }

  return <div>Hello, {user.firstName}!</div>;
}
```

**In API Routes**:

```typescript
import { getUser } from "@workos-inc/authkit-nextjs";

export async function GET() {
  const user = await getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Process request...
}
```

### Sign Out

```typescript
import { signOut } from "@workos-inc/authkit-nextjs";

async function handleSignOut() {
  "use server";
  await signOut();
}
```

## 🚢 Deployment

### Deploying to Vercel (Recommended)

1. **Push to GitHub**:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Import to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your repository
   - Configure environment variables (copy from `.env.local`)

3. **Environment Variables**:
   Add all variables from your `.env.local`:
   - `DATABASE_URL`
   - `WORKOS_CLIENT_ID`
   - `WORKOS_API_KEY`
   - `WORKOS_COOKIE_PASSWORD`
   - `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (use production URL)
   - `AI_GATEWAY_API_KEY`

4. **Update WorkOS Redirect URI**:
   - Add your Vercel URL to WorkOS redirect URIs
   - Format: `https://your-app.vercel.app/api/auth/callback`

5. **Deploy**:
   - Click "Deploy"
   - Vercel automatically runs migrations and builds

### Deploying to Cloudflare

The project includes Cloudflare Containers support:

```bash
# Install Cloudflare CLI
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler deploy
```

### Database Migrations in Production

Vercel automatically runs build commands, but for manual migration:

```bash
# SSH into your environment or run in CI/CD
npx drizzle-kit migrate
```

**Recommended Approach**:

- Use Vercel's "Ignored Build Step" feature
- Run migrations in a separate step before deployment
- Or use a database migration service

## 🐛 Troubleshooting

### Common Issues

#### 1. Database Connection Errors

**Error**: `Connection refused` or `SSL required`

**Solutions**:

- Verify `DATABASE_URL` includes `?sslmode=require`
- Check Neon dashboard for correct connection string
- Ensure your IP is not blocked by database firewall

#### 2. Authentication Loops

**Error**: Continuous redirect between app and WorkOS

**Solutions**:

- Verify `NEXT_PUBLIC_WORKOS_REDIRECT_URI` matches exactly in WorkOS dashboard
- Check that callback route exists: `/app/api/auth/callback/route.ts`
- Clear cookies and try again
- Verify `WORKOS_COOKIE_PASSWORD` is at least 32 characters

#### 3. Environment Variables Not Loading

**Error**: `undefined` values in runtime

**Solutions**:

- Restart dev server after changing `.env.local`
- Ensure file is named exactly `.env.local` (not `.env`)
- Public variables must start with `NEXT_PUBLIC_`
- In production, verify all variables are set in Vercel dashboard

#### 4. Build Errors with Turbopack

**Error**: Build fails with Turbopack

**Solutions**:

```bash
# Try standard build
npm run build -- --no-turbo

# Or update package.json scripts to remove --turbopack
```

#### 5. Type Errors with Drizzle

**Error**: TypeScript errors with database queries

**Solutions**:

```bash
# Regenerate Drizzle types
npx drizzle-kit generate:pg

# Restart TypeScript server in your editor
# VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

#### 6. AI Model Not Available

**Error**: Model not found or unavailable in chat interface

**Solutions**:

- Verify `AI_GATEWAY_API_KEY` is set correctly
- Check AI Gateway dashboard for model access
- Ensure model ID matches exactly (case-sensitive)
- Try fetching `/api/models` to see available models

#### 7. Image Generation Fails

**Error**: "No image was generated" or timeout

**Solutions**:

- Verify Google Gemini API access in AI Gateway
- Check prompt is clear and descriptive (avoid vague descriptions)
- Ensure `maxDuration` is set to 30 seconds in route
- Try a simpler prompt first to test connectivity
- Check AI Gateway quota/rate limits

#### 8. Streaming Responses Not Working

**Error**: Messages don't appear in real-time

**Solutions**:

- Ensure API route exports `maxDuration` constant
- Verify AI SDK version compatibility (5.0.59+)
- Check browser console for network errors
- Disable browser extensions that block streaming
- Verify AI Gateway supports streaming for selected model

### Getting Help

- Check [Next.js Documentation](https://nextjs.org/docs)
- Review [Drizzle ORM Docs](https://orm.drizzle.team/docs)
- Visit [WorkOS Documentation](https://workos.com/docs)
- Read [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- Join the elizaOS community

## 📚 Additional Resources

### Core Framework

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

### AI & Machine Learning

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [AI SDK Gateway Guide](https://sdk.vercel.ai/docs/ai-sdk-core/providers-and-models)
- [Google Gemini API](https://ai.google.dev/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic Claude API](https://docs.anthropic.com)

### Database & ORM

- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Neon Serverless PostgreSQL](https://neon.tech/docs)
- [Drizzle Kit Guide](https://orm.drizzle.team/kit-docs/overview)

### Authentication & Security

- [WorkOS AuthKit Guide](https://workos.com/docs/authkit)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)

### UI & Styling

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Lucide Icons](https://lucide.dev)
- [next-themes Documentation](https://github.com/pacocoursey/next-themes)

### Infrastructure & Deployment

- [Vercel Deployment Guide](https://vercel.com/docs)
- [Vercel Analytics](https://vercel.com/analytics)
- [Cloudflare Containers](https://developers.cloudflare.com/workers/)

## 📄 License

See the LICENSE file in the repository root.

---

**Built with ❤️ for the elizaOS ecosystem**
