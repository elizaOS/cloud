# Frontend migration notes — Next.js → Vite + React Router (Cloudflare Pages)

Status as of `shaw/refactor` HEAD. Owner: Frontend agent (this worktree).

## What shipped

Scaffold + green `bun run build`:

- `cloud/frontend/package.json` — new `@elizaos/cloud-frontend` private
  workspace package (Vite 5, React 19, react-router-dom 6, react-helmet-async,
  nprogress, plus the runtime deps the existing pages already use).
- `cloud/frontend/vite.config.ts` — React + Tailwind v4 plugins, regex
  resolve aliases for `@/lib`, `@/db`, `@/types`, `@/components`,
  `@/packages`, `@/actions`, `@/app/actions`, `@elizaos/cloud-ui`, `@`,
  plus node-builtin shims (see `Why so many shims` below).
- `cloud/frontend/tsconfig.json` — extends the cloud root, sets
  `jsx: react-jsx`, `module: ESNext`, `moduleResolution: Bundler`, mirrors
  the alias paths.
- `cloud/frontend/index.html` + `cloud/frontend/src/main.tsx` — bootstraps
  React with `<HelmetProvider>` + `<BrowserRouter>`.
- `cloud/frontend/src/RootLayout.tsx` — replaces `frontend/layout.tsx`.
  Drops `next/font/google`, `next/font/local`, `@vercel/analytics`,
  `nextjs-toploader`. Keeps `PrivyProvider`, `MaybeStewardProvider`,
  `PostHogProvider`, `CreditsProvider`, `ThemeProvider`, sonner `Toaster`.
  Uses `<Helmet>` for the global `metadata` (title, description, og,
  twitter, icons, manifest). Renders `<Outlet />`.
- `cloud/frontend/src/components/NavigationProgress.tsx` — replaces
  `nextjs-toploader` by driving `nprogress` from
  `useLocation()`/`useNavigationType()`.
- `cloud/frontend/src/globals.css` — top-of-file adds Google Fonts import
  for DM Mono + Inter, `@font-face` rules for SF Pro pointing at
  `/fonts/sf-pro/*` in `public/`, and sets `--font-dm-mono`,
  `--font-inter`, `--font-sf-pro` on `:root`. Fixed `@source` path to
  `../../packages/ui/src` (was `../packages/ui/src`).
- `cloud/frontend/src/styles/` — moved from `frontend/styles/`.
- `cloud/frontend/public/fonts/sf-pro/*` — copied from
  `frontend/fonts/sf-pro/` so Vite serves them at `/fonts/sf-pro/*`.
- `cloud/frontend/src/shims/next-image.tsx` — drop-in replacement for
  `next/image`. Renders a plain `<img>` and ignores Next-only props
  (`fill`, `priority`, `sizes`, `placeholder`, `blurDataURL`, `quality`,
  `loader`, `unoptimized`).
- `cloud/frontend/src/shims/empty.ts` — defensive stub for every Node
  built-in that a transitive dep might import (`fs`, `path`, `os`,
  `crypto`, `stream`, `http`, `https`, `url`, `util`, `events`,
  `EventEmitter` class, `Buffer`, etc.). The browser bundle never executes
  those code paths because the surrounding helpers are server-only and
  guarded by `typeof window === "undefined"` checks; if the stub *is*
  called it throws so we fail loud rather than ship broken bytes.
- `cloud/frontend/scripts/convert-next.mjs` — idempotent codemod that ran
  once over every legacy `page.tsx` and `layout.tsx`. It performs all the
  mechanical conversions listed below and leaves `TODO(migrate)` markers
  for the rest.

## What's wired (build green, route reachable)

`cloud/frontend/src/App.tsx`:

- `/` → `frontend/page.tsx` (Privy-aware landing)
- `/terms-of-service`
- `/sandbox-proxy`
- `/auth/success`, `/auth/cli-login`, `/auth/error`
- `/app-auth/authorize`
- `/login` (with login layout, Privy + Steward branches)
- `/invite/accept`
- `/payment/success`
- `/blog`, `/blog/:slug`

That's **17 page modules + 4 layout modules** mechanically converted and
mounted on the route tree. Build verified with
`NODE_OPTIONS="--max-old-space-size=8192" bun run build` →
`✓ built in 35.72s`, `dist/index.html` + 1664 JS/CSS chunks.

## What's NOT wired (falls through to `<UnportedPlaceholder/>`)

All paths under `/dashboard/*`, `/chat/*`, `/docs/*`. The page modules
were mechanically converted (next/link → react-router Link, useRouter →
useNavigate, "use client" stripped, etc.) but they cannot mount because
they (or the dashboard layout, or shared UI components they consume)
import server-only helpers:

| Page                                                | Server import that blocks SPA bundling                       |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `dashboard/layout.tsx`                              | UI sidebar/header pull `@/db/schemas` (value, not type)      |
| `dashboard/page.tsx`                                | `@/lib/auth` `requireAuth`                                   |
| `dashboard/settings/page.tsx`                       | `@/lib/auth` `requireAuth`                                   |
| `dashboard/account/page.tsx`                        | `@/lib/auth` `requireAuth`                                   |
| `dashboard/api-keys/page.tsx`                       | `@/lib/auth` `requireAuthWithOrg`, `crypto`                  |
| `dashboard/billing/page.tsx`                        | UI billing-tab → `@/lib/services/auto-top-up` → posthog-node |
| `dashboard/billing/success/page.tsx`                | `@/lib/services/credits`                                     |
| `dashboard/analytics/page.tsx`                      | `@/lib/auth`                                                 |
| `dashboard/earnings/page.tsx`                       | `@/lib/auth` `requireAuth`                                   |
| `dashboard/affiliates/page.tsx`                     | `@/lib/auth` `requireAuth`                                   |
| `dashboard/knowledge/page.tsx`                      | `@/lib/auth`, `@/app/actions/characters`                     |
| `dashboard/mcps/page.tsx`                           | `@/lib/auth` `requireAuthWithOrg`                            |
| `dashboard/voices/page.tsx`                         | `@/lib/auth`                                                 |
| `dashboard/image/page.tsx`                          | `@/app/actions/gallery` (server action)                      |
| `dashboard/video/page.tsx`                          | clean, but lives under blocked dashboard layout              |
| `dashboard/gallery/page.tsx`                        | clean, but lives under blocked dashboard layout              |
| `dashboard/admin/*`                                 | `@/lib/auth` `requireAuthWithOrg`                            |
| `dashboard/api-explorer/*`                          | clean, but lives under blocked dashboard layout              |
| `dashboard/(chat-build)/chat/page.tsx`              | `cookies()` from next/headers, `@/lib/auth`                  |
| `dashboard/(chat-build)/build/page.tsx`             | `@/lib/auth`, `@/app/actions/characters`                     |
| `dashboard/my-agents/page.tsx`                      | `cookies()` from next/headers                                |
| `dashboard/apps/page.tsx`                           | `@/lib/auth`                                                 |
| `dashboard/apps/[id]/page.tsx`                      | `@/lib/auth`, `@/lib/services/apps` (uses crypto)            |
| `dashboard/apps/create/page.tsx`                    | clean — could be wired with one fix to its layout            |
| `dashboard/containers/*`                            | `@/lib/auth`, services that pull `pg`                        |
| `dashboard/invoices/[id]/page.tsx`                  | `@/lib/auth`, `@/lib/services/invoices` → `pg`               |
| `dashboard/milady/*`                                | `@/lib/auth`                                                 |
| `chat/[characterId]/page.tsx`                       | server-component shape: `getCurrentUser`, `redirect`         |
| `docs/[[...mdxPath]]/page.tsx` + `docs/layout.tsx`  | Nextra (Next-only); whole docs system needs replacement      |

The mechanical conversion pass already moved these as far as it can. The
remaining work for each is the same shape:

1. Replace the server-side data-fetch (`requireAuth*`, `cookies()`, direct
   `@/lib/services/*` calls) with client-side `useQuery(... fetch("/api/...")
   ...)` that hits a Workers route.
2. Replace `redirect("/login")` with a `<Navigate to="/login" replace />`
   guarded by the auth state from `useSessionAuth()`.
3. Drop the `params: Promise<{...}>` async signature and read params with
   `useParams()`.

Nothing about that work is creative — it's the same template applied per
page. A second focused pass on dashboard pages should knock out 10-15 of
them per session.

## What needs Agent B (API)

`cloud/api/` needs Workers routes that replace the 5 legacy server actions
(see `cloud/frontend/_legacy_actions/README.md`):

- `GET/POST /api/anon/cookie` — anonymous-session cookie issuance.
- `GET /api/auth/me` — replaces `auth.ts` (the `requireAuthWithOrg` helper
  itself already lives in `packages/lib/auth/`).
- `POST /api/characters/*` — character CRUD (replaces `characters.ts`).
- `POST /api/gallery/*` — gallery item CRUD (replaces `gallery.ts`).
- `POST /api/users/*` — user mutation (replaces `users.ts`).

Plus, every dashboard page in the table above needs at least one matching
`GET /api/...` to feed the client component once it's converted.

## What needs Agent C (infra)

1. Add `cloud/frontend` to the workspaces array in the root
   `cloud/package.json`. Right now `bun install` from inside
   `cloud/frontend/` works because it falls back to the cloud root's
   `node_modules`, but it's not officially part of the workspace graph.

2. Confirm the existing `cloud/frontend/public/_redirects` and
   `cloud/frontend/public/_headers` (already added by Agent C in commit
   `a11c14b48`) match the final API URL. The current `_redirects` proxies
   `/api/*` to `https://api.elizacloud.ai/api/:splat`.

3. Add a `bun run --cwd frontend build` step to the Pages CI so that
   `frontend/dist/` is what gets uploaded.

4. Decide on env var migration for client-side keys. Today the legacy
   pages read `process.env.NEXT_PUBLIC_*`; Vite's natural form is
   `import.meta.env.VITE_*`. The transitional code reads both. Eventually
   either rename all `NEXT_PUBLIC_FOO` → `VITE_FOO` or keep injecting
   them via `define: { "process.env.NEXT_PUBLIC_FOO": JSON.stringify(...) }`
   in `vite.config.ts`. I left `define: { "process.env": {} }` so the
   pages don't crash at import time, but real env values still need to be
   forwarded.

## Why so many node-builtin shims?

Several `packages/lib` modules (notably `packages/db/database-url.ts`,
`packages/lib/services/auto-top-up.ts`, the Twitter/Telegram/Sendgrid
helpers) are server-only but get pulled into the bundle through type
imports that aren't `import type`-prefixed (e.g. `import { App } from
"@/db/schemas"` in `packages/ui/src/components/apps/apps-table.tsx`). When
Rollup walks the graph it has to resolve `@/db/schemas` → `packages/db/...`
→ `pg`, `os`, `dns`, `nodemailer`, etc. Aliasing these to the throwing
stub lets the build complete; the runtime never reaches them because the
calling code is gated server-side.

The right long-term fix is:

1. Convert every UI-side `@/db/schemas` import to `import type { ... }`.
2. Split server-only `packages/lib/services/*` into their own subpath
   (e.g. `packages/lib/server/services/*`) that the UI cannot accidentally
   import.

Both are out of scope for this migration pass.

## Mechanical conversion patterns (for the next contributor)

`scripts/convert-next.mjs` performs these. Re-run with
`node frontend/scripts/convert-next.mjs` and it's idempotent.

- `"use client"` / `"use server"` directives → deleted.
- `export const dynamic|revalidate|runtime|fetchCache|preferredRegion|maxDuration|dynamicParams` → deleted.
- `import Link from "next/link"` → `import { Link } from "react-router-dom"`. `<Link href=...>` → `<Link to=...>`.
- `import Image from "next/image"` → `import Image from "@/shims/next-image"`. The shim renders `<img>` and swallows `fill`/`priority`/`sizes`/`placeholder`/`blurDataURL`/`quality`/`loader`/`unoptimized`.
- `import { useRouter, usePathname, useSearchParams, useParams, redirect, notFound } from "next/navigation"` → react-router-dom equivalents:
  - `useRouter()` → `useNavigate()`
  - `router.push(x)` → `navigate(x)`
  - `router.replace(x)` → `navigate(x, { replace: true })`
  - `router.back()` → `navigate(-1)`
  - `router.refresh()` → `window.location.reload()`
  - `usePathname()` → `useLocation().pathname`
  - `useSearchParams()` and `useParams()` are same-name in RR.
  - `redirect(...)` is left in place with a `TODO(migrate)` marker — needs hand-conversion to `<Navigate to=... replace />` or a `useEffect` calling `navigate(...)`.
  - `notFound()` is left in place with a `TODO(migrate)` marker.
- `import dynamic from "next/dynamic"` → `import { lazy } from "react"`. `dynamic(() => import("..."), { ssr: false })` → `lazy(() => import("..."))`.
- `next/headers`, `next/cache`, `next/font/*` imports → commented out, file flagged with `TODO(migrate)` block comment.
- `export const metadata = {...}` and `export async function generateMetadata` → file flagged with `TODO(migrate-metadata)` for hand-conversion to a `<Helmet>` block in the page body.

## Server actions

Moved `frontend/actions/` → `frontend/_legacy_actions/`. None of the
pages currently import them (verified via repo-wide grep). See
`frontend/_legacy_actions/README.md` for the per-file API endpoint that
Agent B should create.
