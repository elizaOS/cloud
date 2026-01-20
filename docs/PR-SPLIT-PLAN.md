# Plan: Split ui/redesign-dashboard Branch into Multiple PRs

## Current State Summary

**Branch:** `ui/redesign-dashboard`
**Total Changes:** 97 files changed (+9,475 / -10,622 lines)
- **27 Added** files
- **3 Deleted** files
- **67 Modified** files

### ⚠️ Uncommitted Changes (must commit first)
| File | Change |
|------|--------|
| `components/brand/eliza-logo.tsx` | New compact logo SVG |
| `components/landing/hero-chat-input.tsx` | Typing effect, toggle switch, marquee |
| `components/landing/landing-page-new.tsx` | Commented out discover sections |
| `app/newlanding/page.tsx` | **NEW untracked** - preview route |

---

## Complete File Inventory

### 🆕 Added Files (27)

| Category | Files |
|----------|-------|
| **Auth/Login (3)** | `app/auth/cli-login/page-new.tsx`, `app/auth/error/page-new.tsx`, `app/login/page-new.tsx` |
| **Apps Pages (4)** | `app/dashboard/apps/[id]/app-page-wrapper.tsx`, `apps-empty-state.tsx`, `apps-page-wrapper.tsx`, `build-with-ai-button.tsx` |
| **Containers Pages (3)** | `app/dashboard/containers/containers-empty-state.tsx`, `containers-page-wrapper.tsx`, `deploy-from-cli.tsx` |
| **MCPs Pages (2)** | `app/dashboard/mcps/mcps-page-wrapper.tsx`, `mcps-section.tsx` |
| **Agents Components (2)** | `components/agents/agent-card.tsx`, `index.ts` |
| **Brand (1)** | `components/brand/eliza-logo.tsx` |
| **Dashboard (1)** | `components/dashboard/survey-banner.tsx` |
| **Landing (8)** | `hero-chat-input.tsx`, `landing-page-new.tsx`, `discover-agents.tsx`, `discover-apps.tsx`, `Footer-new.tsx`, `TopHero-new.tsx`, `bottom-chat-bar.tsx`, `chat-message.tsx` |
| **Layout (1)** | `components/layout/landing-header-new.tsx` |
| **Hooks (1)** | `lib/hooks/use-typing-placeholder.ts` |
| **Docs (1)** | `docs/PENDING-FEATURES.md` |

### 🗑️ Deleted Files (3)

- `components/mcps/index.ts`
- `components/mcps/mcps-page-client.tsx`
- `components/my-agents/character-library-card.tsx`

### ✏️ Modified Files (67)

| Category | Files |
|----------|-------|
| **App Layout (3)** | `app/layout.tsx`, `app/globals.css`, `app/dashboard/layout.tsx` |
| **Auth (2)** | `app/app-auth/authorize/page.tsx`, `app/login/page.tsx` |
| **Dashboard Home (1)** | `app/dashboard/page.tsx` |
| **Apps Section (3)** | `app/dashboard/apps/page.tsx`, `[id]/page.tsx`, `create/page.tsx` |
| **Containers (1)** | `app/dashboard/containers/page.tsx` |
| **MCPs (1)** | `app/dashboard/mcps/page.tsx` |
| **My Agents (1)** | `app/dashboard/my-agents/my-agents.tsx` |
| **API Explorer (1)** | `app/dashboard/api-explorer/page.tsx` |
| **Chat Build (1)** | `app/dashboard/(chat-build)/layout.tsx` |
| **Apps Components (10)** | `app-analytics.tsx`, `app-details-tabs.tsx`, `app-domains.tsx`, `app-earnings-dashboard.tsx`, `app-monetization-settings.tsx`, `app-overview.tsx`, `app-promote.tsx`, `app-settings.tsx`, `app-users.tsx`, `apps-table.tsx` |
| **App Builder (3)** | `agent-picker.tsx`, `chat-input.tsx`, `session-loader.tsx` |
| **API Explorer Comp (3)** | `auth-manager.tsx`, `endpoint-card.tsx`, `openapi-viewer.tsx` |
| **Billing (1)** | `credit-pack-card.tsx` |
| **Brand (2)** | `brand-button.tsx`, `brand-card.tsx`, `index.ts` |
| **Builders (1)** | `quick-create-dialog.tsx` |
| **Chat (2)** | `build-mode-assistant.tsx`, `eliza-chat-interface.tsx` |
| **Containers Comp (1)** | `containers-table.tsx` |
| **Dashboard Comp (4)** | `agents-section.tsx`, `apps-section.tsx`, `containers-section.tsx`, `overview-metrics.tsx` |
| **Image (1)** | `image-generator-advanced.tsx` |
| **Invoices (1)** | `invoice-detail-client.tsx` |
| **Landing (2)** | `Footer.tsx`, `landing-page.tsx` |
| **Layout (9)** | `chat-header.tsx`, `chat-sidebar.tsx`, `header.tsx`, `landing-header.tsx`, `sidebar-chat-rooms.tsx`, `sidebar-data.ts`, `sidebar-item.tsx`, `sidebar-section.tsx`, `sidebar.tsx`, `user-menu.tsx` |
| **My Agents Comp (3)** | `character-filters.tsx`, `character-library-grid.tsx`, `empty-state.tsx` |
| **Promotion (1)** | `promote-app-dialog.tsx` |
| **UI (3)** | `button.tsx`, `dialog.tsx`, `select.tsx` |
| **Video (1)** | `video-page-client.tsx` |
| **DB (1)** | `db/repositories/apps.ts` |
| **Lib (2)** | `lib/actions/dashboard.ts`, `lib/app-builder/markdown-components.tsx` |

---

## Dependency Analysis

| Shared Component | Used By |
|------------------|---------|
| `components/brand/eliza-logo.tsx` | `landing-header.tsx`, `landing-header-new.tsx`, `sidebar.tsx`, `chat-sidebar.tsx` |
| `components/brand/brand-button.tsx` | `survey-banner.tsx`, various pages |
| `components/ui/button.tsx` | Many files |
| `components/ui/dialog.tsx` | `promote-app-dialog.tsx`, admin, organization |
| `components/ui/select.tsx` | API explorer, MCPs, docs |
| `lib/hooks/use-typing-placeholder.ts` | `bottom-chat-bar.tsx` |
| `app/globals.css` | Global styles |

---

## Recommended PR Split (12 PRs)

### PR #1: Foundation 🏗️ (Merge First)
**Branch:** `ui/foundation`

```
components/brand/eliza-logo.tsx (A)
components/brand/brand-button.tsx (M)
components/brand/brand-card.tsx (M)
components/brand/index.ts (M)
components/ui/button.tsx (M)
components/ui/dialog.tsx (M)
components/ui/select.tsx (M)
app/globals.css (M)
lib/hooks/use-typing-placeholder.ts (A)
```

### PR #2: Auth/Login Pages 🔐
**Branch:** `ui/auth-pages` | **Depends on:** #1

```
app/login/page-new.tsx (A)
app/login/page.tsx (M)
app/auth/cli-login/page-new.tsx (A)
app/auth/error/page-new.tsx (A)
app/app-auth/authorize/page.tsx (M)
```

### PR #3: New Landing Page 🚀
**Branch:** `ui/new-landing` | **Depends on:** #1

```
components/landing/hero-chat-input.tsx (A)
components/landing/landing-page-new.tsx (A)
components/landing/discover-agents.tsx (A)
components/landing/discover-apps.tsx (A)
components/landing/Footer-new.tsx (A)
components/landing/TopHero-new.tsx (A)
components/landing/bottom-chat-bar.tsx (A)
components/landing/chat-message.tsx (A)
components/landing/Footer.tsx (M)
components/landing/landing-page.tsx (M)
components/layout/landing-header-new.tsx (A)
components/layout/landing-header.tsx (M)
app/newlanding/page.tsx (A) ← UNTRACKED
```

### PR #4: Sidebar & Layout 📐
**Branch:** `ui/sidebar-layout` | **Depends on:** #1

```
components/layout/sidebar.tsx (M)
components/layout/sidebar-data.ts (M)
components/layout/sidebar-item.tsx (M)
components/layout/sidebar-section.tsx (M)
components/layout/header.tsx (M)
components/layout/chat-header.tsx (M)
components/layout/chat-sidebar.tsx (M)
components/layout/sidebar-chat-rooms.tsx (M)
components/layout/user-menu.tsx (M)
app/layout.tsx (M)
app/dashboard/layout.tsx (M)
app/dashboard/(chat-build)/layout.tsx (M)
```

### PR #5: Dashboard Home 🏠
**Branch:** `ui/dashboard-home` | **Depends on:** #1, #4

```
app/dashboard/page.tsx (M)
components/dashboard/survey-banner.tsx (A)
components/dashboard/agents-section.tsx (M)
components/dashboard/apps-section.tsx (M)
components/dashboard/containers-section.tsx (M)
components/dashboard/overview-metrics.tsx (M)
lib/actions/dashboard.ts (M)
```

### PR #6: Apps Pages & Components 📱
**Branch:** `ui/apps-pages` | **Depends on:** #1, #4

```
app/dashboard/apps/page.tsx (M)
app/dashboard/apps/[id]/page.tsx (M)
app/dashboard/apps/[id]/app-page-wrapper.tsx (A)
app/dashboard/apps/apps-empty-state.tsx (A)
app/dashboard/apps/apps-page-wrapper.tsx (A)
app/dashboard/apps/build-with-ai-button.tsx (A)
components/apps/*.tsx (10 files - M)
components/promotion/promote-app-dialog.tsx (M)
db/repositories/apps.ts (M)
```

### PR #7: App Builder UI 🛠️
**Branch:** `ui/app-builder` | **Depends on:** #1

```
app/dashboard/apps/create/page.tsx (M)
components/app-builder/agent-picker.tsx (M)
components/app-builder/chat-input.tsx (M)
components/app-builder/session-loader.tsx (M)
lib/app-builder/markdown-components.tsx (M)
```

### PR #8: Containers Pages 📦
**Branch:** `ui/containers` | **Depends on:** #1, #4

```
app/dashboard/containers/page.tsx (M)
app/dashboard/containers/containers-empty-state.tsx (A)
app/dashboard/containers/containers-page-wrapper.tsx (A)
app/dashboard/containers/deploy-from-cli.tsx (A)
components/containers/containers-table.tsx (M)
```

### PR #9: MCPs Pages 🔌
**Branch:** `ui/mcps` | **Depends on:** #1, #4

```
app/dashboard/mcps/page.tsx (M)
app/dashboard/mcps/mcps-page-wrapper.tsx (A)
app/dashboard/mcps/mcps-section.tsx (A)
components/mcps/index.ts (D)
components/mcps/mcps-page-client.tsx (D)
```

### PR #10: Agents & My Agents 🤖
**Branch:** `ui/agents` | **Depends on:** #1, #4

```
app/dashboard/my-agents/my-agents.tsx (M)
components/agents/agent-card.tsx (A)
components/agents/index.ts (A)
components/my-agents/character-filters.tsx (M)
components/my-agents/character-library-grid.tsx (M)
components/my-agents/character-library-card.tsx (D)
components/my-agents/empty-state.tsx (M)
```

### PR #11: API Explorer 🔍
**Branch:** `ui/api-explorer` | **Depends on:** #1

```
app/dashboard/api-explorer/page.tsx (M)
components/api-explorer/auth-manager.tsx (M)
components/api-explorer/endpoint-card.tsx (M)
components/api-explorer/openapi-viewer.tsx (M)
```

### PR #12: Misc Components 🧩
**Branch:** `ui/misc` | **Depends on:** #1

```
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

## Execution Steps

### Step 0: Commit uncommitted changes
```bash
git add app/newlanding/ components/brand/eliza-logo.tsx components/landing/hero-chat-input.tsx components/landing/landing-page-new.tsx
git commit -m "Add newlanding preview route and finalize hero chat input"
```

### Step 1: Create each PR branch
```bash
git checkout dev && git pull origin dev
git checkout -b ui/[branch-name]
git checkout ui/redesign-dashboard -- [files...]
git add . && git commit -m "[message]"
git push -u origin ui/[branch-name]
gh pr create --base dev --title "[title]"
```

---

## Merge Order

```
#1 Foundation ──────────┐
                        ├── #2 Auth Pages
                        ├── #3 New Landing
                        ├── #4 Sidebar/Layout ──┐
                        │                       ├── #5 Dashboard Home
                        │                       ├── #6 Apps Pages
                        │                       ├── #8 Containers
                        │                       ├── #9 MCPs
                        │                       └── #10 Agents
                        ├── #7 App Builder
                        ├── #11 API Explorer
                        └── #12 Misc
```

---

## Verification Checklist (per PR)

- [ ] `bun install` succeeds
- [ ] `bun run build` succeeds
- [ ] No TypeScript errors
- [ ] Visual inspection of affected pages
- [ ] No missing imports
