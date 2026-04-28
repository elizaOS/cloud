import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import RootLayout from "./RootLayout";

// Page lazy imports. Each path mirrors the legacy Next.js App Router file
// system: `frontend/<dir>/page.tsx` → `/<dir>`. Dynamic segments `[param]`
// become `:param`. Catch-alls `[[...slug]]` become `*`. Route-group dirs
// `(group)` are not added to the URL.

const Home = lazy(() => import("../page"));
const TermsOfService = lazy(() => import("../terms-of-service/page"));
const SandboxProxy = lazy(() => import("../sandbox-proxy/page"));

// auth
const AuthSuccess = lazy(() => import("../auth/success/page"));
const AuthCliLogin = lazy(() => import("../auth/cli-login/page"));
const AuthError = lazy(() => import("../auth/error/page"));
const AppAuthAuthorize = lazy(() => import("../app-auth/authorize/page"));

// login
const LoginLayout = lazy(() => import("../login/layout"));
const LoginPage = lazy(() => import("../login/page"));

// invite
const InviteAcceptLayout = lazy(() => import("../invite/accept/layout"));
const InviteAcceptPage = lazy(() => import("../invite/accept/page"));

// payment
const PaymentSuccessLayout = lazy(() => import("../payment/success/layout"));
const PaymentSuccessPage = lazy(() => import("../payment/success/page"));

// chat (top-level)
const ChatCharacter = lazy(() => import("../chat/[characterId]/page"));

// blog
const BlogIndex = lazy(() => import("../blog/page"));
const BlogPost = lazy(() => import("../blog/[slug]/page"));

// docs
const DocsLayout = lazy(() => import("../docs/layout"));
const DocsCatchAll = lazy(() => import("../docs/[[...mdxPath]]/page"));

// dashboard
const DashboardLayout = lazy(() => import("../dashboard/layout"));
const Dashboard = lazy(() => import("../dashboard/page"));
const DashboardSettings = lazy(() => import("../dashboard/settings/page"));
const DashboardAccount = lazy(() => import("../dashboard/account/page"));
const DashboardApiKeys = lazy(() => import("../dashboard/api-keys/page"));
const DashboardBilling = lazy(() => import("../dashboard/billing/page"));
const DashboardBillingSuccess = lazy(() => import("../dashboard/billing/success/page"));
const DashboardAnalytics = lazy(() => import("../dashboard/analytics/page"));
const DashboardEarnings = lazy(() => import("../dashboard/earnings/page"));
const DashboardAffiliates = lazy(() => import("../dashboard/affiliates/page"));
const DashboardKnowledge = lazy(() => import("../dashboard/knowledge/page"));
const DashboardMcps = lazy(() => import("../dashboard/mcps/page"));
const DashboardVoices = lazy(() => import("../dashboard/voices/page"));
const DashboardImage = lazy(() => import("../dashboard/image/page"));
const DashboardVideo = lazy(() => import("../dashboard/video/page"));
const DashboardGallery = lazy(() => import("../dashboard/gallery/page"));
const DashboardMilady = lazy(() => import("../dashboard/milady/page"));
const DashboardMiladyAgent = lazy(() => import("../dashboard/milady/agents/[id]/page"));
const DashboardMyAgents = lazy(() => import("../dashboard/my-agents/page"));
const DashboardApps = lazy(() => import("../dashboard/apps/page"));
const DashboardAppsCreate = lazy(() => import("../dashboard/apps/create/page"));
const DashboardAppDetail = lazy(() => import("../dashboard/apps/[id]/page"));
const DashboardContainers = lazy(() => import("../dashboard/containers/page"));
const DashboardContainerDetail = lazy(() => import("../dashboard/containers/[id]/page"));
const DashboardContainerAgent = lazy(
  () => import("../dashboard/containers/agents/[id]/page"),
);
const DashboardInvoiceDetail = lazy(() => import("../dashboard/invoices/[id]/page"));

// admin
const DashboardAdminLayout = lazy(() => import("../dashboard/admin/layout"));
const DashboardAdmin = lazy(() => import("../dashboard/admin/page"));
const DashboardAdminMetrics = lazy(() => import("../dashboard/admin/metrics/page"));
const DashboardAdminInfra = lazy(() => import("../dashboard/admin/infrastructure/page"));
const DashboardAdminRedemptions = lazy(() => import("../dashboard/admin/redemptions/page"));

// chat-build group (route-group, no URL segment)
const ChatBuildLayout = lazy(() => import("../dashboard/(chat-build)/layout"));
const ChatBuildChat = lazy(() => import("../dashboard/(chat-build)/chat/page"));
const ChatBuildBuild = lazy(() => import("../dashboard/(chat-build)/build/page"));

// api-explorer
const ApiExplorerLayout = lazy(() => import("../dashboard/api-explorer/layout"));
const ApiExplorer = lazy(() => import("../dashboard/api-explorer/page"));

function PageFallback() {
  return <div className="p-8 text-sm text-neutral-400">Loading…</div>;
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<Home />} />
          <Route path="terms-of-service" element={<TermsOfService />} />
          <Route path="sandbox-proxy" element={<SandboxProxy />} />

          {/* auth */}
          <Route path="auth/success" element={<AuthSuccess />} />
          <Route path="auth/cli-login" element={<AuthCliLogin />} />
          <Route path="auth/error" element={<AuthError />} />
          <Route path="app-auth/authorize" element={<AppAuthAuthorize />} />

          {/* login */}
          <Route path="login" element={<LoginLayout />}>
            <Route index element={<LoginPage />} />
          </Route>

          {/* invite */}
          <Route path="invite/accept" element={<InviteAcceptLayout />}>
            <Route index element={<InviteAcceptPage />} />
          </Route>

          {/* payment */}
          <Route path="payment/success" element={<PaymentSuccessLayout />}>
            <Route index element={<PaymentSuccessPage />} />
          </Route>

          {/* chat */}
          <Route path="chat/:characterId" element={<ChatCharacter />} />

          {/* blog */}
          <Route path="blog">
            <Route index element={<BlogIndex />} />
            <Route path=":slug" element={<BlogPost />} />
          </Route>

          {/* docs (catch-all) */}
          <Route path="docs" element={<DocsLayout />}>
            <Route index element={<DocsCatchAll />} />
            <Route path="*" element={<DocsCatchAll />} />
          </Route>

          {/* dashboard */}
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="settings" element={<DashboardSettings />} />
            <Route path="account" element={<DashboardAccount />} />
            <Route path="api-keys" element={<DashboardApiKeys />} />
            <Route path="billing" element={<DashboardBilling />} />
            <Route path="billing/success" element={<DashboardBillingSuccess />} />
            <Route path="analytics" element={<DashboardAnalytics />} />
            <Route path="earnings" element={<DashboardEarnings />} />
            <Route path="affiliates" element={<DashboardAffiliates />} />
            <Route path="knowledge" element={<DashboardKnowledge />} />
            <Route path="mcps" element={<DashboardMcps />} />
            <Route path="voices" element={<DashboardVoices />} />
            <Route path="image" element={<DashboardImage />} />
            <Route path="video" element={<DashboardVideo />} />
            <Route path="gallery" element={<DashboardGallery />} />

            <Route path="milady" element={<DashboardMilady />} />
            <Route path="milady/agents/:id" element={<DashboardMiladyAgent />} />

            <Route path="my-agents" element={<DashboardMyAgents />} />

            <Route path="apps" element={<DashboardApps />} />
            <Route path="apps/create" element={<DashboardAppsCreate />} />
            <Route path="apps/:id" element={<DashboardAppDetail />} />

            <Route path="containers" element={<DashboardContainers />} />
            <Route path="containers/:id" element={<DashboardContainerDetail />} />
            <Route path="containers/agents/:id" element={<DashboardContainerAgent />} />

            <Route path="invoices/:id" element={<DashboardInvoiceDetail />} />

            {/* (chat-build) route-group: no URL segment */}
            <Route element={<ChatBuildLayout />}>
              <Route path="chat" element={<ChatBuildChat />} />
              <Route path="build" element={<ChatBuildBuild />} />
            </Route>

            {/* api-explorer */}
            <Route path="api-explorer" element={<ApiExplorerLayout />}>
              <Route index element={<ApiExplorer />} />
            </Route>

            {/* admin */}
            <Route path="admin" element={<DashboardAdminLayout />}>
              <Route index element={<DashboardAdmin />} />
              <Route path="metrics" element={<DashboardAdminMetrics />} />
              <Route path="infrastructure" element={<DashboardAdminInfra />} />
              <Route path="redemptions" element={<DashboardAdminRedemptions />} />
            </Route>
          </Route>

          <Route path="*" element={<div className="p-8">404 — not found</div>} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
