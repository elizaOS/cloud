import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import RootLayout from "./RootLayout";

// Page lazy imports. Each path mirrors the legacy Next.js App Router file
// system: `frontend/<dir>/page.tsx` → `/<dir>`. Dynamic segments `[param]`
// become `:param`. Catch-alls `[[...slug]]` become `*`. Route-group dirs
// `(group)` are not added to the URL.
//
// SCOPE: only routes whose page module imports are SPA-safe (no `next/headers`,
// `next/cache`, server-side `requireAuth*`, `@/db/*` etc.) are wired here.
// Pages that still call server-only helpers are listed in MIGRATION_NOTES.md
// and rendered by `<UnportedPlaceholder />` until they are ported to client
// components + API calls (Agent B owns the API endpoints).

const Home = lazy(() => import("./pages/page"));
const TermsOfService = lazy(() => import("./pages/terms-of-service/page"));
const SandboxProxy = lazy(() => import("./pages/sandbox-proxy/page"));

// auth
const AuthSuccess = lazy(() => import("./pages/auth/success/page"));
const AuthCliLogin = lazy(() => import("./pages/auth/cli-login/page"));
const AuthError = lazy(() => import("./pages/auth/error/page"));
const AppAuthAuthorize = lazy(() => import("./pages/app-auth/authorize/page"));

// login
const LoginLayout = lazy(() => import("./pages/login/layout"));
const LoginPage = lazy(() => import("./pages/login/page"));

// invite
const InviteAcceptLayout = lazy(() => import("./pages/invite/accept/layout"));
const InviteAcceptPage = lazy(() => import("./pages/invite/accept/page"));

// payment
const PaymentSuccessLayout = lazy(() => import("./pages/payment/success/layout"));
const PaymentSuccessPage = lazy(() => import("./pages/payment/success/page"));

// blog
const BlogIndex = lazy(() => import("./pages/blog/page"));
const BlogPost = lazy(() => import("./pages/blog/[slug]/page"));

// docs — React-only MDX system. Reads cloud/packages/content/**/*.mdx +
// _meta.ts at build time via import.meta.glob. Replaces the deleted Nextra
// layout.
const DocsRouter = lazy(() => import("./docs/DocsRouter"));

// dashboard pages intentionally NOT wired in this pass. The legacy dashboard
// layout pulls in UI components that transitively import server-only code
// (`@/db/schemas`, `@/lib/services/*`, `posthog-node`). Wiring them blows up
// the rollup graph with `os.networkInterfaces`, `pg`, `nodemailer`, etc. The
// fix is to convert UI imports to `import type` and split server-only
// services out of the shared `packages/lib` tree — see MIGRATION_NOTES.md.

function PageFallback() {
  return <div className="p-8 text-sm text-neutral-400">Loading…</div>;
}

function UnportedPlaceholder() {
  return (
    <div className="p-8 max-w-prose mx-auto text-sm text-neutral-400">
      <h1 className="text-lg font-semibold text-white mb-3">Page not yet ported to SPA</h1>
      <p>
        This route exists in the legacy Next.js tree but its page module still calls server-only
        helpers (e.g. <code>requireAuthWithOrg()</code>, <code>cookies()</code>, direct DB access).
        It needs to be ported to a client component that fetches data from an API endpoint. See{" "}
        <code>frontend/MIGRATION_NOTES.md</code> for the full list.
      </p>
    </div>
  );
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

          {/* blog */}
          <Route path="blog">
            <Route index element={<BlogIndex />} />
            <Route path=":slug" element={<BlogPost />} />
          </Route>

          {/* docs (React-only MDX). */}
          <Route path="docs/*" element={<DocsRouter />} />

          {/* dashboard / chat are not wired yet — see MIGRATION_NOTES.md.
             They fall through to UnportedPlaceholder via the catch-all below. */}
          <Route path="dashboard/*" element={<UnportedPlaceholder />} />
          <Route path="chat/*" element={<UnportedPlaceholder />} />

          <Route path="*" element={<UnportedPlaceholder />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
