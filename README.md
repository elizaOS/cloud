# Eliza Cloud V2

A modern, cloud-native web application built with Next.js 15, featuring authentication, database integration, and production-ready infrastructure.

## 📋 Table of Contents

- [Overview](#overview)
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

## 🎯 Overview

Eliza Cloud V2 is a full-stack web application that provides:

- **User Authentication**: Secure authentication powered by WorkOS AuthKit
- **Database Integration**: Serverless PostgreSQL with Neon and Drizzle ORM
- **Modern UI**: Built with React 19, Next.js 15, and Tailwind CSS v4
- **Production Ready**: Configured for deployment on Vercel with analytics
- **Type Safety**: Full TypeScript support throughout the stack

## 🏗 Architecture

```
eliza-cloud-v2/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   └── auth/            # Authentication endpoints
│   │       └── callback/    # OAuth callback handler
│   ├── layout.tsx           # Root layout with fonts & analytics
│   ├── page.tsx             # Home page
│   └── globals.css          # Global styles
├── db/                       # Database layer
│   ├── schema.ts            # Drizzle schema definitions
│   ├── drizzle.ts           # Database client setup
│   └── migrations/          # Database migration files
├── lib/                      # Shared utilities
│   └── utils.ts             # Helper functions
├── public/                   # Static assets
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
    E --> G[Database Query via Drizzle]
    G --> H[Neon PostgreSQL]
    H --> I[Response to Client]
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

### Styling
- **Tailwind CSS v4**: Utility-first CSS framework
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management
- **tw-animate-css**: Animation utilities

### Analytics & Monitoring
- **Vercel Analytics**: Real-time web analytics

### Additional Services
- **Cloudflare Containers**: Container deployment support
- **AI SDK 5.0.59**: AI integration capabilities

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

3. **Vercel** (for deployment): [vercel.com](https://vercel.com)

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
```

**Important**: 
- Generate a secure `WORKOS_COOKIE_PASSWORD` (minimum 32 characters)
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

### 1. Authentication Service (WorkOS AuthKit)

**Location**: Middleware and `/app/api/auth/callback/route.ts`

**How it works**:
- **Middleware Protection**: `middleware.ts` intercepts all requests
- **Session Management**: WorkOS handles secure session cookies
- **OAuth Flow**: Supports multiple identity providers
- **Callback Handler**: `/api/auth/callback` processes authentication results

**Usage**:
```typescript
import { getSignInUrl, signOut, getUser } from '@workos-inc/authkit-nextjs';

// Get current user in Server Components
const user = await getUser();

// Get sign-in URL
const signInUrl = await getSignInUrl();

// Sign out
await signOut();
```

**Configuration**:
- Protected routes are defined by `matcher` in `middleware.ts`
- By default, all routes are protected (middleware runs on all requests)
- Uncomment and modify the `config` export in `middleware.ts` to protect specific routes only

### 2. Database Service (Neon + Drizzle)

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
import { db } from '@/db/drizzle';
import { todo } from '@/db/schema';

// Query data
const todos = await db.select().from(todo);

// Insert data
await db.insert(todo).values({
  text: 'Learn Drizzle ORM',
  done: false,
});

// Update data
await db.update(todo)
  .set({ done: true })
  .where(eq(todo.id, 1));
```

**Connection Details**:
- Uses `@neondatabase/serverless` for HTTP-based queries
- Serverless-friendly (no persistent connections)
- Automatic connection pooling
- Edge-compatible

### 3. UI Components

**Location**: `/lib/utils.ts` and Tailwind configuration

**How it works**:
- **Utility Functions**: `cn()` for conditional class merging
- **Component Variants**: Using `class-variance-authority`
- **Tailwind CSS v4**: Modern utility-first styling
- **Responsive Design**: Mobile-first approach

**Utility Example**:
```typescript
import { cn } from '@/lib/utils';

// Merge classes conditionally
className={cn(
  "base-class",
  isActive && "active-class",
  props.className
)}
```

### 4. Analytics Service (Vercel Analytics)

**Location**: `/app/layout.tsx`

**How it works**:
- **Automatic Tracking**: Page views and Web Vitals
- **Privacy-Friendly**: GDPR compliant
- **Real-time Dashboard**: Available in Vercel dashboard
- **Zero Configuration**: Works out of the box when deployed to Vercel

### 5. AI Service Integration

**Available**: AI SDK 5.0.59

**Potential Uses**:
- Chat interfaces
- Content generation
- Embeddings for search
- Stream responses from LLMs

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
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/protected/:path*'
  ] 
};
```

**Option 3: Public by Default**
```typescript
// middleware.ts
export default authkitMiddleware();

export const config = { 
  matcher: [
    '/((?!api/public|_next/static|_next/image|favicon.ico).*)'
  ] 
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
import { getUser } from '@workos-inc/authkit-nextjs';

export async function GET() {
  const user = await getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Process request...
}
```

### Sign Out

```typescript
import { signOut } from '@workos-inc/authkit-nextjs';

async function handleSignOut() {
  'use server';
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

### Getting Help

- Check [Next.js Documentation](https://nextjs.org/docs)
- Review [Drizzle ORM Docs](https://orm.drizzle.team/docs)
- Visit [WorkOS Documentation](https://workos.com/docs)
- Join the ElizaOS community

## 📚 Additional Resources

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [WorkOS AuthKit Guide](https://workos.com/docs/authkit)
- [Neon Serverless PostgreSQL](https://neon.tech/docs)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Vercel Analytics](https://vercel.com/analytics)

## 📄 License

See the LICENSE file in the repository root.

---

**Built with ❤️ for the ElizaOS ecosystem**

