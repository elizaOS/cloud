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
- `cloud/frontend/src/RootLayout.tsx` — replaced and removed `frontend/layout.tsx`.
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
- `cloud/frontend/src/shims/empty.ts` — defensive stub for every Node
  built-in that a transitive dep might import (`fs`, `path`, `os`,
  `crypto`, `stream`, `http`, `https`, `url`, `util`, `events`,
  `EventEmitter` class, `Buffer`, etc.). The browser bundle never executes
  those code paths because the surrounding helpers are server-only and
  guarded by `typeof window === "undefined"` checks; if the stub *is*
  called it throws so we fail loud rather than ship broken bytes.
- `cloud/frontend/scripts/convert-next.mjs` _(deleted)_ — idempotent
  codemod that ran once over every legacy `page.tsx` and `layout.tsx`.
  Performed the mechanical conversions listed below and left
  `TODO(migrate)` markers for the rest. Removed after the migration
  pass; resurrect from git history if a similar conversion is needed
  again.

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

`/api/*` is proxied server-side to the Workers API by a Cloudflare Pages
Function at `cloud/frontend/functions/api/[[path]].ts`. Upstream is
selected via the `API_UPSTREAM` env var on the Pages project
(`https://api.elizacloud.ai` for production, `https://api-staging.elizacloud.ai`
for staging; falls back to production if unset). This replaces the dead
`_redirects` 200-rewrite (which never actually proxied on the free tier)
and gives the SPA true same-origin behavior — no CORS preflight, no API
URL baked into the bundle.

## Docs system (React-only MDX)

`/docs/*` is served by a Vite-native MDX pipeline that replaced Nextra:

- `vite.config.ts` plugins `@mdx-js/rollup` (with `remark-gfm`,
  `remark-frontmatter`, `remark-mdx-frontmatter`) and aliases
  `nextra/components` → `src/docs/components.tsx` so existing
  `cloud/packages/content/**/*.mdx` files (which still
  `import { Callout, Cards, Steps, Tabs } from "nextra/components"`)
  resolve without rewrites.
- `src/docs/components.tsx` — minimal React + CSS replacements for the
  four nextra components actually used in MDX content. `Cards.Card` and
  `Tabs.Tab` are static compound members.
- `src/docs/nav.ts` — uses `import.meta.glob('../../../../content/**/*.mdx')`
  and the same for `_meta.ts`. Builds a `NavItem[]` tree and a
  `Map<urlPath, () => Promise<MdxModule>>` keyed by `/docs/<slug>`.
- `src/docs/DocsLayout.tsx` — sticky sidebar (sections, separators,
  active-state highlighting from `useLocation`) + content slot.
- `src/docs/DocsRouter.tsx` — wired at `<Route path="docs/*">`. Reads
  pathname, looks up the loader, calls it, renders the MDX page,
  forwards frontmatter `title` / `description` to `<Helmet>`.
- `src/docs/docs.css` — replaces the deleted Nextra theme. Covers
  sidebar, article typography, `docs-callout`, `docs-cards-grid`,
  `docs-steps` (CSS counter), `docs-tabs`, the `docs-hero` /
  `docs-quickstart-card` classes that `content/index.mdx` references,
  and `status-badge`.
- The MDX plugin runs **without** `providerImportSource` because
  `@mdx-js/react` can't be resolved from `cloud/packages/content/*.mdx`
  (it's hoisted only under frontend's `node_modules`). We don't need
  `<MDXProvider>` overrides since component substitution happens via the
  `nextra/components` alias and markdown elements are styled by CSS.

What's NOT in this pass (easy follow-ups):

- Syntax highlighting on code fences. Add `rehype-pretty-code` or
  `shiki` to the `mdx({ rehypePlugins })` array.
- In-page table of contents. Walk the MDX AST in a remark plugin.
- Search (Algolia, pagefind, or simple in-bundle index).
- Light-mode theme toggle (everything is dark-mode only right now).

## What's NOT wired (falls through to `<UnportedPlaceholder/>`)

All paths under `/dashboard/*` and `/chat/*`. (`/docs/*` is now wired —
see "Docs system" below.) The page modules
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
| `chat/[characterId]/page.tsx`                       | _deleted_; rewrite as client component once `/api/characters/{id}` lands |
| `docs/[[...mdxPath]]/page.tsx` + `docs/layout.tsx`  | _replaced_ by React-only MDX system at `src/docs/` — see "Docs system" below |

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
- `import Image from "next/image"` → switch to a plain `<img>`. (The
  earlier pass aliased `next/image` to `@/shims/next-image`, but that
  shim and its only consumer were removed; future Next pages should be
  hand-converted.)
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

Moved `frontend/actions/` → `frontend/src/legacy/_legacy_actions/`. None
of the wired pages import them; the unported dashboard pages still
reference them via the `@/app/actions` and `@/actions` aliases. See
`frontend/src/legacy/_legacy_actions/README.md` for the per-file API
endpoint that Agent B should create.

## Layout

Top-level page directories (`auth/`, `login/`, `blog/`, etc.) now live
under `cloud/frontend/src/pages/`. Unported Next.js dashboard pages live
under `cloud/frontend/src/legacy/dashboard/` until they are rewritten as
SPA components. The new SPA dashboard scaffolding lives at
`cloud/frontend/src/dashboard/` (separate from legacy).
