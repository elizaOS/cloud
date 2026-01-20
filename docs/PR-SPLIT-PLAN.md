# Updated PR Split Plan for ui/redesign-dashboard

> **Last Updated:** After landing page reorganization (-new/-old file swap)

## Current State Summary

**Branch:** `ui/redesign-dashboard`
**Compared to:** `origin/dev`
**Total Changes:** 100 files (+9,574 / -10,360 lines)

| Type | Count |
|------|-------|
| Added | 34 files |
| Modified | 63 files |
| Deleted | 3 files |

### Uncommitted Changes
- `bun.lock` - from adding `canvas-confetti` package

---

## Complete File Inventory

### Added Files (34)

| Category | Files |
|----------|-------|
| **Auth (archived old versions)** | `app/auth/cli-login/page-old.tsx`, `app/auth/error/page-old.tsx`, `app/login/page-old.tsx` |
| **Landing (archived)** | `app/oldlanding/page.tsx`, `components/landing/TopHero-old.tsx`, `components/layout/landing-header-old.tsx` |
| **Landing (new components)** | `components/landing/hero-chat-input.tsx`, `components/landing/landing-page-new.tsx`, `components/landing/discover-agents.tsx`, `components/landing/discover-apps.tsx`, `components/landing/bottom-chat-bar.tsx`, `components/landing/chat-message.tsx` |
| **Apps Pages** | `app/dashboard/apps/[id]/app-page-wrapper.tsx`, `apps-empty-state.tsx`, `apps-page-wrapper.tsx`, `build-with-ai-button.tsx` |
| **Containers Pages** | `app/dashboard/containers/containers-empty-state.tsx`, `containers-page-wrapper.tsx`, `deploy-from-cli.tsx` |
| **MCPs Pages** | `app/dashboard/mcps/mcps-page-wrapper.tsx`, `mcps-section.tsx` |
| **Agents Components** | `components/agents/agent-card.tsx`, `components/agents/index.ts` |
| **Brand** | `components/brand/eliza-logo.tsx` |
| **Dashboard** | `components/dashboard/survey-banner.tsx` |
| **Hooks** | `lib/hooks/use-typing-placeholder.ts` |
| **Docs** | `docs/PENDING-FEATURES.md` |

### Deleted Files (3)

- `components/mcps/index.ts`
- `components/mcps/mcps-page-client.tsx`
- `components/my-agents/character-library-card.tsx`

### Modified Files (63)

| Category | Files |
|----------|-------|
| **Global/Layout** | `app/layout.tsx`, `app/globals.css`, `app/dashboard/layout.tsx`, `app/dashboard/(chat-build)/layout.tsx` |
| **Root Page** | `app/page.tsx` (now uses landing-page-new) |
| **Auth Pages** | `app/login/page.tsx`, `app/auth/cli-login/page.tsx`, `app/auth/error/page.tsx`, `app/app-auth/authorize/page.tsx` |
| **Dashboard Home** | `app/dashboard/page.tsx` |
| **Apps Section** | `app/dashboard/apps/page.tsx`, `[id]/page.tsx`, `create/page.tsx` |
| **Containers** | `app/dashboard/containers/page.tsx` |
| **MCPs** | `app/dashboard/mcps/page.tsx` |
| **My Agents** | `app/dashboard/my-agents/my-agents.tsx` |
| **API Explorer** | `app/dashboard/api-explorer/page.tsx` |
| **Apps Components (10)** | `app-analytics.tsx`, `app-details-tabs.tsx`, `app-domains.tsx`, `app-overview.tsx`, `app-promote.tsx`, `app-settings.tsx`, `app-users.tsx`, `apps-table.tsx` |
| **App Builder (3)** | `agent-picker.tsx`, `chat-input.tsx`, `session-loader.tsx` |
| **API Explorer Comp (3)** | `auth-manager.tsx`, `endpoint-card.tsx`, `openapi-viewer.tsx` |
| **Brand (2)** | `brand-button.tsx`, `brand-card.tsx` |
| **Builders** | `quick-create-dialog.tsx` |
| **Chat (2)** | `build-mode-assistant.tsx`, `eliza-chat-interface.tsx` |
| **Containers Comp** | `containers-table.tsx` |
| **Dashboard Comp (4)** | `agents-section.tsx`, `apps-section.tsx`, `containers-section.tsx`, `overview-metrics.tsx` |
| **Landing (3)** | `Footer.tsx`, `TopHero.tsx`, `landing-page.tsx` |
| **Layout (10)** | `chat-header.tsx`, `chat-sidebar.tsx`, `header.tsx`, `landing-header.tsx`, `sidebar-chat-rooms.tsx`, `sidebar-data.ts`, `sidebar-item.tsx`, `sidebar-section.tsx`, `sidebar.tsx`, `user-menu.tsx` |
| **My Agents (3)** | `character-filters.tsx`, `character-library-grid.tsx`, `empty-state.tsx` |
| **Promotion** | `promote-app-dialog.tsx` |
| **UI (3)** | `button.tsx`, `dialog.tsx`, `select.tsx` |
| **Other** | `billing/credit-pack-card.tsx`, `image/image-generator-advanced.tsx`, `invoices/invoice-detail-client.tsx`, `video/video-page-client.tsx` |
| **DB/Lib** | `db/repositories/apps.ts`, `lib/actions/dashboard.ts`, `lib/app-builder/markdown-components.tsx` |

---

## Recommended PR Split (10 PRs)

### PR #1: Foundation (Merge First)
**Branch:** `ui/foundation`

Core shared components and styles that other PRs depend on.

```
components/brand/eliza-logo.tsx (A)
components/brand/brand-button.tsx (M)
components/brand/brand-card.tsx (M)
components/ui/button.tsx (M)
components/ui/dialog.tsx (M)
components/ui/select.tsx (M)
app/globals.css (M)
lib/hooks/use-typing-placeholder.ts (A)
```

---

### PR #2: Auth/Login Pages
**Branch:** `ui/auth-pages` | **Depends on:** #1

Updated auth pages (new designs are now default, old archived).

```
app/login/page.tsx (M) - now the new design
app/login/page-old.tsx (A) - archived old design
app/auth/cli-login/page.tsx (M)
app/auth/cli-login/page-old.tsx (A)
app/auth/error/page.tsx (M)
app/auth/error/page-old.tsx (A)
app/app-auth/authorize/page.tsx (M)
```

---

### PR #3: New Landing Page
**Branch:** `ui/new-landing` | **Depends on:** #1

New landing page design (now served at `/`, old at `/oldlanding`).

```
app/page.tsx (M) - now uses landing-page-new
app/oldlanding/page.tsx (A) - archived old landing

components/landing/landing-page-new.tsx (A) - new main landing
components/landing/landing-page.tsx (M) - imports -old components
components/landing/hero-chat-input.tsx (A)
components/landing/discover-agents.tsx (A)
components/landing/discover-apps.tsx (A)
components/landing/bottom-chat-bar.tsx (A)
components/landing/chat-message.tsx (A)

components/landing/TopHero.tsx (M) - now the new version
components/landing/TopHero-old.tsx (A) - archived
components/landing/Footer.tsx (M)

components/layout/landing-header.tsx (M) - now the new version
components/layout/landing-header-old.tsx (A) - archived
```

---

### PR #4: Sidebar & Layout
**Branch:** `ui/sidebar-layout` | **Depends on:** #1

Dashboard layout, sidebar, and header updates.

```
app/layout.tsx (M)
app/dashboard/layout.tsx (M)
app/dashboard/(chat-build)/layout.tsx (M)

components/layout/sidebar.tsx (M)
components/layout/sidebar-data.ts (M)
components/layout/sidebar-item.tsx (M)
components/layout/sidebar-section.tsx (M)
components/layout/header.tsx (M)
components/layout/chat-header.tsx (M)
components/layout/chat-sidebar.tsx (M)
components/layout/sidebar-chat-rooms.tsx (M)
components/layout/user-menu.tsx (M)
```

---

### PR #5: Dashboard Home
**Branch:** `ui/dashboard-home` | **Depends on:** #1, #4

Dashboard home page and sections.

```
app/dashboard/page.tsx (M)
components/dashboard/survey-banner.tsx (A)
components/dashboard/agents-section.tsx (M)
components/dashboard/apps-section.tsx (M)
components/dashboard/containers-section.tsx (M)
components/dashboard/overview-metrics.tsx (M)
lib/actions/dashboard.ts (M)
```

---

### PR #6: Apps Pages & Components
**Branch:** `ui/apps-pages` | **Depends on:** #1, #4

Apps management pages and components.

```
app/dashboard/apps/page.tsx (M)
app/dashboard/apps/[id]/page.tsx (M)
app/dashboard/apps/[id]/app-page-wrapper.tsx (A)
app/dashboard/apps/apps-empty-state.tsx (A)
app/dashboard/apps/apps-page-wrapper.tsx (A)
app/dashboard/apps/build-with-ai-button.tsx (A)

components/apps/app-analytics.tsx (M)
components/apps/app-details-tabs.tsx (M)
components/apps/app-domains.tsx (M)
components/apps/app-overview.tsx (M)
components/apps/app-promote.tsx (M)
components/apps/app-settings.tsx (M)
components/apps/app-users.tsx (M)
components/apps/apps-table.tsx (M)

components/promotion/promote-app-dialog.tsx (M)
db/repositories/apps.ts (M)
```

---

### PR #7: App Builder UI
**Branch:** `ui/app-builder` | **Depends on:** #1

App builder/create page updates.

```
app/dashboard/apps/create/page.tsx (M)
components/app-builder/agent-picker.tsx (M)
components/app-builder/chat-input.tsx (M)
components/app-builder/session-loader.tsx (M)
lib/app-builder/markdown-components.tsx (M)
```

---

### PR #8: Containers & MCPs Pages
**Branch:** `ui/containers-mcps` | **Depends on:** #1, #4

Containers and MCPs pages.

```
app/dashboard/containers/page.tsx (M)
app/dashboard/containers/containers-empty-state.tsx (A)
app/dashboard/containers/containers-page-wrapper.tsx (A)
app/dashboard/containers/deploy-from-cli.tsx (A)
components/containers/containers-table.tsx (M)

app/dashboard/mcps/page.tsx (M)
app/dashboard/mcps/mcps-page-wrapper.tsx (A)
app/dashboard/mcps/mcps-section.tsx (A)
components/mcps/index.ts (D)
components/mcps/mcps-page-client.tsx (D)
```

---

### PR #9: Agents & My Agents
**Branch:** `ui/agents` | **Depends on:** #1, #4

Agent components and my-agents page.

```
app/dashboard/my-agents/my-agents.tsx (M)
components/agents/agent-card.tsx (A)
components/agents/index.ts (A)
components/my-agents/character-filters.tsx (M)
components/my-agents/character-library-grid.tsx (M)
components/my-agents/character-library-card.tsx (D)
components/my-agents/empty-state.tsx (M)
```

---

### PR #10: Misc Components
**Branch:** `ui/misc` | **Depends on:** #1

Miscellaneous component updates.

```
app/dashboard/api-explorer/page.tsx (M)
components/api-explorer/auth-manager.tsx (M)
components/api-explorer/endpoint-card.tsx (M)
components/api-explorer/openapi-viewer.tsx (M)

components/builders/quick-create-dialog.tsx (M)
components/chat/build-mode-assistant.tsx (M)
components/chat/eliza-chat-interface.tsx (M)
components/billing/credit-pack-card.tsx (M)
components/image/image-generator-advanced.tsx (M)
components/invoices/invoice-detail-client.tsx (M)
components/video/video-page-client.tsx (M)

docs/PENDING-FEATURES.md (A)
```

---

## Merge Order Diagram

```
#1 Foundation ──────────┬── #2 Auth Pages
                        ├── #3 New Landing
                        ├── #4 Sidebar/Layout ──┬── #5 Dashboard Home
                        │                       ├── #6 Apps Pages
                        │                       ├── #8 Containers & MCPs
                        │                       └── #9 Agents
                        ├── #7 App Builder
                        └── #10 Misc
```

---

## Execution Steps

### Step 0: Commit uncommitted changes
```bash
git add bun.lock
git commit -m "Add canvas-confetti dependency"
```

### Step 1: Create each PR branch
```bash
# For each PR:
git checkout dev && git pull origin dev
git checkout -b ui/[branch-name]
git checkout ui/redesign-dashboard -- [files...]
git add . && git commit -m "[message]"
git push -u origin ui/[branch-name]
gh pr create --base dev --title "[title]"
```

---

## Verification Checklist (per PR)

- [ ] `bun install` succeeds
- [ ] `bun run build` succeeds
- [ ] No TypeScript errors
- [ ] Visual inspection of affected pages
- [ ] No missing imports
