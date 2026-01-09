# App Builder Improvement Plan

## Comprehensive Review & Roadmap for AAA Eliza Cloud Apps

**Date:** January 8, 2026  
**Scope:** Full end-to-end review of app builder prompts, sandbox, and SDK

---

## Executive Summary

The current app builder successfully scaffolds Next.js apps with Eliza Cloud AI capabilities. However, it **cannot build production-ready apps** that users can sign into and pay for. This is the critical missing piece preventing the creation of real SaaS applications.

### The Vision

Users should be able to describe an app and have Claude build a fully functional SaaS with:

- ✅ User authentication (sign in with Eliza Cloud)
- ✅ Per-user credit system (users buy their own credits)
- ✅ Payment processing (Stripe checkout within apps)
- ✅ Real-time usage tracking
- ✅ Beautiful, polished UI

---

## Current State Analysis

### What's Working Well ✅

1. **Sandbox Infrastructure**
   - Vercel sandbox creation with GitHub repo integration
   - SDK injection for templates without it
   - HMR-based live preview
   - Build verification system

2. **Prompt System**
   - Well-structured template-specific prompts
   - Clear technical constraints (client/server components, Tailwind v4)
   - SDK reference documentation
   - Progressive file writing instructions

3. **SDK Foundation**
   - `@/lib/eliza.ts` - AI API functions (chat, images, video)
   - `@/hooks/use-eliza.ts` - React hooks
   - `@/components/eliza` - Provider and credit display

4. **Backend Infrastructure**
   - `app_credit_balances` table exists for per-user app credits
   - App monetization settings (markup percentages)
   - App user tracking (`app_users` table)
   - Earnings tracking for app creators

### Critical Gaps 🔴

#### 1. NO USER AUTHENTICATION FOR APPS

**Current State:**

- Apps authenticate with the APP's API key, not user tokens
- All API calls draw from the organization's credit balance
- No way for app users to sign in
- No user-specific state or data

**Impact:**

- Cannot build SaaS apps with user accounts
- Cannot track per-user usage
- Cannot bill individual users
- Apps are essentially "anonymous" experiences

**Evidence:**

```typescript
// Current SDK - uses org-level auth only
const apiKey = process.env.NEXT_PUBLIC_ELIZA_API_KEY || ""; // App's key
const { balance } = await getBalance(); // Returns ORG balance, not user balance
```

#### 2. NO PAYMENT RAILS FOR APP USERS

**Current State:**

- `AppCreditsService` exists but has no frontend integration
- No checkout flow components
- No Stripe integration for apps
- Credit purchases go through main platform only

**Impact:**

- App users cannot purchase credits
- App creators cannot monetize directly
- No revenue share mechanism for creators

**Evidence:**

```typescript
// Backend exists but no SDK/frontend exposure
class AppCreditsService {
  async processPurchase(params: AppCreditPurchaseParams) { ... }  // Unused by SDK!
  async deductCredits(params: AppCreditDeductionParams) { ... }   // Unused by SDK!
}
```

#### 3. PROMPTS LACK CRITICAL PATTERNS

**Missing from prompts:**

- User authentication flows (sign-in, sign-up, protected routes)
- Payment/checkout patterns
- User dashboard patterns
- Subscription management
- Usage limits and quotas
- Error states for insufficient credits

**Current prompt focus:**

- AI chat interfaces
- Dashboard layouts
- Credit display (but for org, not user)

#### 4. SDK MISSING USER CONTEXT

**Current SDK exports:**

```typescript
// What exists:
- chat, chatStream, generateImage, generateVideo
- getBalance()  // ORG balance only
- trackPageView()

// What's MISSING:
- signIn(), signOut(), getUser()
- getUserCredits()  // User's balance in THIS app
- purchaseCredits()
- isAuthenticated()
- requireAuth() HOC
```

#### 5. TEMPLATE TYPES TOO LIMITED

**Current:**

- chat, agent-dashboard, landing-page, analytics, blank

**Missing:**

- `saas-starter` - Full SaaS with auth + billing
- `ai-tool` - Single-purpose AI tool with pay-per-use
- `marketplace` - Multi-user platform
- `subscription-app` - Recurring billing model

---

## Improvement Plan

### Phase 1: User Authentication Infrastructure

#### 1.1 Create App User Auth System

**Goal:** Allow app users to sign in with their Eliza Cloud credentials

**New Components:**

```
lib/app-auth/
├── eliza-auth-client.ts     # Frontend auth client
├── use-eliza-auth.ts        # React hook
└── ElizaAuthProvider.tsx    # Context provider
```

**Key Functions:**

```typescript
// New SDK functions
export function signInWithEliza(): Promise<User>;
export function signOut(): Promise<void>;
export function getUser(): User | null;
export function isAuthenticated(): boolean;

// New hooks
export function useElizaAuth() {
  return { user, signIn, signOut, isAuthenticated, loading };
}
```

**Implementation Approach:**

- Use Eliza Cloud's existing Privy auth
- App generates a OAuth-style redirect to cloud login
- User authenticates on elizacloud.ai
- Redirect back to app with session token
- App stores token and includes in API calls

**Backend Changes:**

```
app/api/v1/app-auth/
├── authorize/route.ts       # Start OAuth flow
├── callback/route.ts        # Handle callback
├── session/route.ts         # Get/refresh session
└── logout/route.ts          # End session
```

#### 1.2 Update cloud-apps-template

Add new files to the template:

```
src/
├── lib/
│   ├── eliza.ts            # Existing
│   └── eliza-auth.ts       # NEW: Auth functions
├── hooks/
│   ├── use-eliza.ts        # Existing
│   └── use-eliza-auth.ts   # NEW: Auth hook
├── components/
│   └── eliza/
│       ├── index.ts
│       ├── eliza-provider.tsx   # Update to include auth
│       ├── eliza-auth-button.tsx  # NEW: Sign in button
│       └── protected-route.tsx    # NEW: Route protection
```

### Phase 2: Payment & Billing Rails

#### 2.1 App-Level Credit Purchases

**Goal:** Users can buy credits directly within apps

**New SDK Functions:**

```typescript
// Get user's credit balance in this app
export async function getUserAppCredits(): Promise<{
  balance: number;
  totalPurchased: number;
  totalSpent: number;
}>;

// Create checkout session for credit purchase
export async function createCheckoutSession(params: {
  amount: number; // Credits to purchase
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }>;

// Verify purchase completed
export async function verifyPurchase(sessionId: string): Promise<boolean>;
```

**New Hooks:**

```typescript
export function useAppCredits() {
  return {
    balance,
    loading,
    error,
    refresh,
    purchase: (amount) => createCheckoutSession({ amount, ... }),
    hasLowBalance,
  };
}
```

**Backend Changes:**

```
app/api/v1/app-credits/
├── balance/route.ts         # Get user's app balance
├── checkout/route.ts        # Create Stripe checkout
├── webhook/route.ts         # Handle Stripe webhook
└── history/route.ts         # Purchase history
```

#### 2.2 Stripe Integration for Apps

**Configuration:**

- Each app can have its own Stripe Connect account (optional)
- Default: purchases go through platform with revenue share
- Platform takes X%, app creator gets Y%, user spends Z

**Environment Variables:**

```env
# App-level (injected at build)
NEXT_PUBLIC_ELIZA_APP_ID=app_xxx
NEXT_PUBLIC_ELIZA_API_KEY=eliza_xxx
# Optional: App's Stripe Connect ID
NEXT_PUBLIC_STRIPE_CONNECTED_ACCOUNT_ID=acct_xxx
```

#### 2.3 Credit Usage & Billing

**Automatic deduction from user's app balance:**

```typescript
// Before AI operation
const hasCredits = await checkUserAppCredits(userId, appId, estimatedCost);
if (!hasCredits) {
  return { error: "INSUFFICIENT_CREDITS", balance, required: estimatedCost };
}

// After AI operation
await deductUserAppCredits(userId, appId, actualCost, {
  operation: "chat",
  model: "gpt-4o",
  tokens: 1500,
});
```

### Phase 3: Enhanced Prompts

#### 3.1 New Template Types

**`saas-starter` Template:**

```typescript
export const SAAS_STARTER_PROMPT = `${FULL_APP_BASE_PROMPT}

## SaaS Starter Template

Build a complete SaaS application with:

### Authentication
- Sign in with Eliza Cloud (pre-built, just use \`SignInButton\`)
- Protected routes using \`<ProtectedRoute>\` wrapper
- User profile display with \`<UserMenu>\`

### Billing
- Credit purchase flow using \`usePurchaseCredits()\`
- Balance display with \`<AppCreditDisplay>\`
- Checkout integration (Stripe handled by platform)

### Architecture
\`\`\`
src/app/
├── page.tsx                    # Public landing
├── (auth)/
│   ├── login/page.tsx          # Login page (optional customization)
│   └── callback/page.tsx       # OAuth callback handler
├── dashboard/
│   ├── layout.tsx              # Protected layout
│   ├── page.tsx                # Main dashboard
│   ├── settings/page.tsx       # User settings
│   └── billing/page.tsx        # Credit purchase
\`\`\`

### Pre-built Components
\`\`\`typescript
import { 
  SignInButton,           // One-click sign in
  SignOutButton,          // Logout
  UserMenu,               // Avatar + dropdown
  ProtectedRoute,         // Route protection
  AppCreditDisplay,       // User's balance
  PurchaseCreditsButton,  // Buy credits
  UsageMeter,             // Visual usage display
} from '@/components/eliza';
\`\`\`

### Example Protected Dashboard
\`\`\`tsx
// app/dashboard/layout.tsx
'use client';
import { ProtectedRoute, UserMenu, AppCreditDisplay } from '@/components/eliza';

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen">
        <aside className="w-64 border-r border-gray-800 p-4">
          <nav>...</nav>
          <div className="mt-auto">
            <AppCreditDisplay />
            <UserMenu />
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
\`\`\`

### AI Operations with Billing
\`\`\`typescript
'use client';
import { useChat, useAppCredits } from '@/hooks/use-eliza';

function ChatInterface() {
  const { balance, hasLowBalance } = useAppCredits();
  const { send, loading, error } = useChat();

  const handleSend = async (message) => {
    // SDK automatically checks/deducts user's app credits
    const response = await send([{ role: 'user', content: message }]);
    
    if (response?.error === 'INSUFFICIENT_CREDITS') {
      // Show purchase prompt
      showPurchaseModal();
      return;
    }
  };

  return (
    <div>
      {hasLowBalance && <LowBalanceWarning />}
      {/* Chat UI */}
    </div>
  );
}
\`\`\`
`;
```

**`ai-tool` Template:**

```typescript
export const AI_TOOL_PROMPT = `${FULL_APP_BASE_PROMPT}

## AI Tool Template

Build a focused, single-purpose AI tool with pay-per-use model.

### Architecture
- Simple landing explaining the tool
- One main "do the thing" interface
- Clear credit cost display per operation
- No complex navigation needed

### Example: Image Generator Tool
\`\`\`tsx
'use client';
import { useImageGeneration, useAppCredits } from '@/hooks/use-eliza';
import { SignInButton, AppCreditDisplay, PurchaseCreditsButton } from '@/components/eliza';

export default function ImageTool() {
  const { generate, loading, imageUrl } = useImageGeneration();
  const { balance, isAuthenticated } = useAppCredits();
  
  const COST_PER_IMAGE = 0.50; // Show users the cost

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h1>AI Image Generator</h1>
        <p>Generate stunning images for ${COST_PER_IMAGE} credits each</p>
        <SignInButton />
      </div>
    );
  }

  return (
    <div>
      <header className="flex justify-between p-4">
        <h1>Image Generator</h1>
        <div className="flex items-center gap-4">
          <AppCreditDisplay />
          <PurchaseCreditsButton />
        </div>
      </header>
      {/* Tool interface */}
    </div>
  );
}
\`\`\`
`;
```

#### 3.2 Updated Example Prompts

```typescript
export const FULL_APP_EXAMPLE_PROMPTS: Record<FullAppTemplateType, string[]> = {
  // ... existing ...

  "saas-starter": [
    "Set up protected dashboard with sidebar navigation",
    "Add user settings page with profile editing",
    "Create billing page with credit purchase options",
    "Add usage history table showing past operations",
    "Create onboarding flow for new users",
  ],

  "ai-tool": [
    "Create a one-page image generator with cost display",
    "Add before/after comparison for generated content",
    "Create a history of past generations",
    "Add download buttons for generated content",
  ],
};
```

#### 3.3 New Knowledge Patterns

Add to `knowledge-context.ts`:

```typescript
const AUTH_PATTERNS: Record<string, { description: string; code: string }> = {
  "protected-route": {
    description: "Protect routes that require authentication",
    code: `'use client';
import { ProtectedRoute } from '@/components/eliza';

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute 
      fallback={<LoginPrompt />}
      loadingFallback={<LoadingSpinner />}
    >
      {children}
    </ProtectedRoute>
  );
}`,
  },

  "sign-in-flow": {
    description: "Add sign in/sign out functionality",
    code: `'use client';
import { useElizaAuth, SignInButton, UserMenu } from '@/components/eliza';

export function Header() {
  const { user, isAuthenticated } = useElizaAuth();

  return (
    <header className="flex justify-between p-4">
      <Logo />
      {isAuthenticated ? (
        <UserMenu user={user} />
      ) : (
        <SignInButton variant="primary" />
      )}
    </header>
  );
}`,
  },

  "credit-purchase": {
    description: "Allow users to purchase credits",
    code: `'use client';
import { useAppCredits, PurchaseCreditsModal } from '@/components/eliza';
import { useState } from 'react';

export function BillingSection() {
  const { balance, loading } = useAppCredits();
  const [showPurchase, setShowPurchase] = useState(false);

  return (
    <div className="card-eliza">
      <h2>Your Credits</h2>
      <p className="text-3xl font-bold">{balance}</p>
      <button 
        onClick={() => setShowPurchase(true)}
        className="btn-eliza mt-4"
      >
        Purchase More
      </button>
      
      <PurchaseCreditsModal 
        open={showPurchase} 
        onClose={() => setShowPurchase(false)}
        presets={[10, 50, 100, 500]} // Credit amounts
      />
    </div>
  );
}`,
  },
};
```

### Phase 4: SDK Updates

#### 4.1 New `lib/eliza-auth.ts`

```typescript
/**
 * Eliza Cloud Authentication
 *
 * Sign in app users with their Eliza Cloud accounts.
 */

const apiBase =
  process.env.NEXT_PUBLIC_ELIZA_API_URL || "https://www.elizacloud.ai";
const appId = process.env.NEXT_PUBLIC_ELIZA_APP_ID || "";

export interface ElizaUser {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  createdAt: string;
}

export interface AuthState {
  user: ElizaUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Token storage
const TOKEN_KEY = "eliza_app_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Initiate sign in with Eliza Cloud
 * Redirects to Eliza Cloud login page
 */
export function signIn(options?: { redirectUrl?: string }): void {
  const redirectUrl = options?.redirectUrl || window.location.href;
  const loginUrl = new URL(`${apiBase}/app-auth/authorize`);
  loginUrl.searchParams.set("app_id", appId);
  loginUrl.searchParams.set("redirect_uri", redirectUrl);
  window.location.href = loginUrl.toString();
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  const token = getToken();
  if (token) {
    await fetch(`${apiBase}/api/v1/app-auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearToken();
  window.location.reload();
}

/**
 * Get current user (if authenticated)
 */
export async function getUser(): Promise<ElizaUser | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${apiBase}/api/v1/app-auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const { user } = await res.json();
    return user;
  } catch {
    return null;
  }
}

/**
 * Handle OAuth callback
 * Call this on the callback page to complete sign-in
 */
export async function handleCallback(): Promise<ElizaUser | null> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const error = params.get("error");

  if (error) {
    throw new Error(error);
  }

  if (token) {
    setToken(token);
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
    return getUser();
  }

  return null;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/**
 * Get auth headers for API calls
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

#### 4.2 New `lib/eliza-credits.ts`

```typescript
/**
 * App-level credit management
 *
 * Users have their own credit balance per app.
 */

import { getAuthHeaders } from "./eliza-auth";

const apiBase =
  process.env.NEXT_PUBLIC_ELIZA_API_URL || "https://www.elizacloud.ai";
const appId = process.env.NEXT_PUBLIC_ELIZA_APP_ID || "";

export interface AppCreditBalance {
  balance: number;
  totalPurchased: number;
  totalSpent: number;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

/**
 * Get current user's credit balance for this app
 */
export async function getAppCredits(): Promise<AppCreditBalance> {
  const res = await fetch(
    `${apiBase}/api/v1/app-credits/balance?app_id=${appId}`,
    {
      headers: getAuthHeaders(),
    },
  );
  if (!res.ok) throw new Error("Failed to fetch credits");
  return res.json();
}

/**
 * Create a checkout session for purchasing credits
 */
export async function createCheckout(params: {
  amount: number;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutSession> {
  const res = await fetch(`${apiBase}/api/v1/app-credits/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      app_id: appId,
      amount: params.amount,
      success_url:
        params.successUrl || `${window.location.origin}/billing/success`,
      cancel_url: params.cancelUrl || `${window.location.origin}/billing`,
    }),
  });
  if (!res.ok) throw new Error("Failed to create checkout");
  return res.json();
}

/**
 * Get credit purchase history
 */
export async function getPurchaseHistory(): Promise<{
  purchases: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
}> {
  const res = await fetch(
    `${apiBase}/api/v1/app-credits/history?app_id=${appId}`,
    {
      headers: getAuthHeaders(),
    },
  );
  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
}
```

#### 4.3 Update Main `lib/eliza.ts`

Add user context to all API calls:

```typescript
import { getAuthHeaders, isAuthenticated } from "./eliza-auth";

// Update elizaFetch to include user auth when available
async function elizaFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${apiBase}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...getAuthHeaders(), // Include user token if authenticated
  };

  if (apiKey) {
    headers["X-Api-Key"] = apiKey; // Still include app API key
  }

  if (appId) {
    headers["X-App-Id"] = appId; // Include app ID for routing
  }

  // ... rest of function
}
```

### Phase 5: Components Library

#### 5.1 New Auth Components

Add to `components/eliza/`:

```typescript
// SignInButton.tsx
'use client';
import { signIn } from '@/lib/eliza-auth';

export function SignInButton({
  children = 'Sign in with Eliza',
  variant = 'primary',
  className = '',
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'outline';
  className?: string;
}) {
  return (
    <button
      onClick={() => signIn()}
      className={`${variant === 'primary' ? 'btn-eliza' : 'btn-eliza-outline'} ${className}`}
    >
      <ElizaLogo className="w-5 h-5 mr-2" />
      {children}
    </button>
  );
}

// ProtectedRoute.tsx
'use client';
import { useElizaAuth } from '@/hooks/use-eliza-auth';
import { SignInButton } from './SignInButton';

export function ProtectedRoute({
  children,
  fallback,
  loadingFallback = <DefaultLoader />,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useElizaAuth();

  if (isLoading) return loadingFallback;

  if (!isAuthenticated) {
    return fallback || <DefaultLoginPrompt />;
  }

  return children;
}

// UserMenu.tsx
'use client';
import { useElizaAuth } from '@/hooks/use-eliza-auth';
import { signOut } from '@/lib/eliza-auth';

export function UserMenu() {
  const { user } = useElizaAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2">
        <img src={user.avatar} className="w-8 h-8 rounded-full" />
        <span>{user.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 card-eliza">
          <div className="p-2 border-b border-gray-700">
            <p className="text-sm">{user.email}</p>
          </div>
          <button onClick={signOut} className="w-full text-left p-2 hover:bg-gray-700">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// PurchaseCreditsButton.tsx
'use client';
import { createCheckout } from '@/lib/eliza-credits';

export function PurchaseCreditsButton({
  amount = 50,
  children = 'Buy Credits',
}: {
  amount?: number;
  children?: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const { url } = await createCheckout({ amount });
      window.location.href = url;
    } catch (e) {
      console.error('Checkout failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handlePurchase} disabled={loading} className="btn-eliza">
      {loading ? 'Loading...' : children}
    </button>
  );
}
```

---

## Implementation Priority

### Week 1-2: User Authentication

1. Create `/api/v1/app-auth/*` endpoints
2. Add `eliza-auth.ts` to cloud-apps-template
3. Create auth hooks and components
4. Update ElizaProvider to include auth context
5. Test end-to-end auth flow

### Week 3-4: Payment Rails

1. Create `/api/v1/app-credits/*` endpoints
2. Integrate Stripe for app checkouts
3. Add `eliza-credits.ts` to template
4. Create purchase components
5. Update SDK to use user credits in API calls

### Week 5: Prompts & Templates

1. Create `saas-starter` template prompt
2. Create `ai-tool` template prompt
3. Add auth patterns to knowledge-context.ts
4. Add billing patterns to knowledge-context.ts
5. Update example prompts

### Week 6: Polish & Testing

1. End-to-end testing of complete flows
2. Documentation updates
3. Error handling improvements
4. Rate limiting for app user APIs
5. Analytics for app usage

---

## Backend API Additions Required

### New Routes

```
app/api/v1/app-auth/
├── authorize/route.ts      # OAuth authorize endpoint
├── callback/route.ts       # OAuth callback
├── session/route.ts        # Get/validate session
└── logout/route.ts         # End session

app/api/v1/app-credits/
├── balance/route.ts        # User's balance in app
├── checkout/route.ts       # Create Stripe checkout
├── webhook/route.ts        # Stripe webhook for app purchases
├── history/route.ts        # Purchase history
└── usage/route.ts          # Usage breakdown
```

### Database Schema Updates

```sql
-- App user sessions (for OAuth)
CREATE TABLE app_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id),
  user_id UUID NOT NULL REFERENCES users(id),
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX app_user_sessions_token_idx ON app_user_sessions(session_token);
CREATE INDEX app_user_sessions_app_user_idx ON app_user_sessions(app_id, user_id);
```

---

## Success Metrics

After implementation, the app builder should be able to create:

1. **SaaS Applications** - "Build me a SaaS where users sign in, buy credits, and can generate images"
2. **Pay-per-use Tools** - "Create an AI writing assistant that charges per document"
3. **Subscription Apps** - "Build a chat app where users subscribe monthly"
4. **Marketplaces** - "Create a platform where creators sell AI-generated content"

Each of these should result in:

- ✅ Working authentication (sign in with Eliza)
- ✅ User-specific credit balance
- ✅ Functional payment processing
- ✅ Per-user usage tracking
- ✅ Production-ready code that builds successfully

---

## Appendix: File Changes Summary

### New Files in cloud-apps-template

```
src/
├── lib/
│   ├── eliza.ts           (update)
│   ├── eliza-auth.ts      (new)
│   └── eliza-credits.ts   (new)
├── hooks/
│   ├── use-eliza.ts       (update)
│   ├── use-eliza-auth.ts  (new)
│   └── use-eliza-credits.ts (new)
├── components/
│   └── eliza/
│       ├── index.ts       (update)
│       ├── eliza-provider.tsx (update)
│       ├── sign-in-button.tsx (new)
│       ├── sign-out-button.tsx (new)
│       ├── protected-route.tsx (new)
│       ├── user-menu.tsx (new)
│       ├── app-credit-display.tsx (new)
│       ├── purchase-credits-button.tsx (new)
│       └── purchase-credits-modal.tsx (new)
```

### Updated Files in eliza-cloud-v2

```
lib/
├── fragments/
│   ├── prompt.ts (update: add saas-starter, ai-tool templates)
│   └── eliza-sdk.ts (update: add auth/credits reference)
├── app-builder/
│   └── knowledge-context.ts (update: add auth/billing patterns)
├── config/
│   └── claude-prompts.ts (update: add new template prompts)
└── services/
    └── sandbox.ts (update: inject auth files)

app/api/v1/
├── app-auth/ (new directory)
└── app-credits/ (new directory)
```

---

_This plan transforms the app builder from a demo tool into a production-ready platform for building monetizable AI applications._
