import { PageHeaderProvider, ScrollArea } from "@elizaos/cloud-ui";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";
import Header from "@/packages/ui/src/components/layout/header";
import Sidebar from "@/packages/ui/src/components/layout/sidebar";
import { OnboardingOverlay } from "@/packages/ui/src/components/onboarding/onboarding-overlay";
import { OnboardingProvider } from "@/packages/ui/src/components/onboarding/onboarding-provider";

/**
 * Free Mode Paths (accessible without auth):
 * - /dashboard/chat - AI agent chat
 * - /dashboard/build - AI agent builder
 */
const FREE_MODE_PATHS = ["/dashboard/chat", "/dashboard/build"];
const PLAYWRIGHT_TEST_AUTH_MARKER_COOKIE = "eliza-test-auth=1";
const AUTH_LOSS_GRACE_MS = 5000;

/**
 * Dashboard layout. Renders the sidebar + header chrome and an `<Outlet />`
 * for the active dashboard page. Handles auth gating: protected routes
 * redirect to `/login?returnTo=...`, with a 5s grace window so a transient
 * Steward token refresh doesn't yank the UI.
 */
export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { ready, authenticated } = useSessionAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const playwrightTestAuthEnabled =
    import.meta.env.VITE_PLAYWRIGHT_TEST_AUTH === "true" ||
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PLAYWRIGHT_TEST_AUTH === "true");

  const hasBeenAuthenticated = useRef(false);
  const authLossTimerRef = useRef<number | null>(null);
  const [authGraceActive, setAuthGraceActive] = useState(false);

  if (authenticated) {
    hasBeenAuthenticated.current = true;
  }

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const hasPlaywrightTestSession =
    playwrightTestAuthEnabled &&
    typeof document !== "undefined" &&
    document.cookie.includes(PLAYWRIGHT_TEST_AUTH_MARKER_COOKIE);
  const authReady = ready || playwrightTestAuthEnabled;

  const isFreeModePath = FREE_MODE_PATHS.some((path) => pathname?.startsWith(path));
  const shouldAllowProtectedContent = authenticated || authGraceActive || hasPlaywrightTestSession;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleAnonMigrationComplete = () => {
      window.location.reload();
    };
    window.addEventListener("anon-migration-complete", handleAnonMigrationComplete);
    return () => window.removeEventListener("anon-migration-complete", handleAnonMigrationComplete);
  }, []);

  useEffect(() => {
    if (authLossTimerRef.current !== null) {
      window.clearTimeout(authLossTimerRef.current);
      authLossTimerRef.current = null;
    }

    if (!authReady || isFreeModePath) {
      setAuthGraceActive(false);
      return;
    }

    if (authenticated) {
      setAuthGraceActive(false);
      return;
    }

    if (hasBeenAuthenticated.current) {
      setAuthGraceActive(true);
      authLossTimerRef.current = window.setTimeout(() => {
        hasBeenAuthenticated.current = false;
        setAuthGraceActive(false);
      }, AUTH_LOSS_GRACE_MS);

      return () => {
        if (authLossTimerRef.current !== null) {
          window.clearTimeout(authLossTimerRef.current);
          authLossTimerRef.current = null;
        }
      };
    }

    setAuthGraceActive(false);
  }, [authReady, authenticated, isFreeModePath]);

  useEffect(() => {
    if (authReady && !shouldAllowProtectedContent && !isFreeModePath) {
      const returnTo = encodeURIComponent(
        pathname + (typeof window !== "undefined" ? window.location.search : ""),
      );
      navigate(`/login?returnTo=${returnTo}`, { replace: true });
    }
  }, [authReady, shouldAllowProtectedContent, isFreeModePath, navigate, pathname]);

  if (!authReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!shouldAllowProtectedContent && !isFreeModePath) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  const isCustomLayoutPage =
    pathname?.startsWith("/dashboard/chat") || pathname?.startsWith("/dashboard/build");

  if (isCustomLayoutPage) {
    return (
      <OnboardingProvider>
        <PageHeaderProvider>
          <Outlet />
        </PageHeaderProvider>
        <OnboardingOverlay />
      </OnboardingProvider>
    );
  }

  return (
    <OnboardingProvider>
      <PageHeaderProvider>
        <div className="dashboard-theme flex h-screen w-full bg-neutral-950">
          <Sidebar isOpen={sidebarOpen} onToggle={handleToggleSidebar} />

          <div className="flex flex-1 max-md:pl-3 py-3 pr-3 flex-col overflow-hidden gap-1.5 md:gap-3">
            <Header
              onToggleSidebar={handleToggleSidebar}
              isAnonymous={!shouldAllowProtectedContent}
              authGraceActive={authGraceActive && !authenticated}
            />

            <ScrollArea className="flex-1 min-w-0 border border-white/10 bg-black/80">
              <main className="p-3 md:p-6 w-0 min-w-full overflow-hidden">
                <Outlet />
              </main>
            </ScrollArea>
          </div>
        </div>
      </PageHeaderProvider>
      <OnboardingOverlay />
    </OnboardingProvider>
  );
}
