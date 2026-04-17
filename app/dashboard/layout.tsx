"use client";

import { PageHeaderProvider, ScrollArea } from "@elizaos/cloud-ui";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
/**
 * Grace period (ms) for transient Privy token refresh gaps.
 *
 * During this window the dashboard stays mounted even though `authenticated`
 * is momentarily false. API calls will still fail correctly (auth middleware
 * rejects expired tokens), so no data is exposed — only the previously-
 * rendered UI remains visible. 5 seconds covers observed Privy refresh
 * latency with margin. If a user genuinely logs out, the redirect fires
 * once this timer expires.
 */
const AUTH_LOSS_GRACE_MS = 5000;

/**
 * Dashboard layout component that wraps all dashboard pages.
 * Supports both authenticated and anonymous users for free mode paths.
 *
 * Free Mode Paths (accessible without auth):
 * - /dashboard/chat - AI agent chat
 * - /dashboard/build - AI agent builder
 *
 * Protected Paths (require authentication):
 * - All other /dashboard/* routes
 *
 * @param children - The dashboard page content.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Unified auth state (Privy + Steward). Reactive to cross-tab storage changes
  // and steward-token-sync custom events, so no manual cookie polling needed.
  const { ready, authenticated } = useSessionAuth();
  const router = useRouter();
  const pathname = usePathname();
  const _isAppCreatePage = pathname?.startsWith("/dashboard/apps/create");
  const playwrightTestAuthEnabled =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_AUTH === "true";

  // Track whether we've confirmed authentication at least once and allow a short
  // grace period for transient auth loss during Privy token refresh.
  const hasBeenAuthenticated = useRef(false);
  const authLossTimerRef = useRef<number | null>(null);
  const [authGraceActive, setAuthGraceActive] = useState(false);

  // Deliberately mutated during render — idempotent (only ever set to true) and
  // safe under Strict Mode double-render. This ref tracks whether the user was
  // ever authenticated so we can apply the grace period on transient auth loss.
  if (authenticated) {
    hasBeenAuthenticated.current = true;
  }

  // Memoize toggle callbacks to prevent child re-renders
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const hasPlaywrightTestSession =
    playwrightTestAuthEnabled &&
    typeof document !== "undefined" &&
    document.cookie.includes(PLAYWRIGHT_TEST_AUTH_MARKER_COOKIE);
  const authReady = ready || playwrightTestAuthEnabled;

  // Check if current path allows free access
  const isFreeModePath = FREE_MODE_PATHS.some((path) =>
    pathname?.startsWith(path),
  );
  const shouldAllowProtectedContent =
    authenticated || authGraceActive || hasPlaywrightTestSession;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAnonMigrationComplete = () => {
      router.refresh();
    };

    window.addEventListener(
      "anon-migration-complete",
      handleAnonMigrationComplete,
    );
    return () =>
      window.removeEventListener(
        "anon-migration-complete",
        handleAnonMigrationComplete,
      );
  }, [router]);

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

  // Redirect to login if not authenticated and trying to access protected path.
  // A short grace period prevents transient Privy refreshes from breaking navigation,
  // but real auth loss still redirects once the grace window expires.
  useEffect(() => {
    if (authReady && !shouldAllowProtectedContent && !isFreeModePath) {
      // Build login URL with returnTo parameter to preserve intended destination
      const returnTo = encodeURIComponent(
        pathname +
          (typeof window !== "undefined" ? window.location.search : ""),
      );
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [
    authReady,
    shouldAllowProtectedContent,
    isFreeModePath,
    router,
    pathname,
  ]);

  // Show loading state while checking authentication
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

  // Allow free mode paths for anonymous users.
  // Protected pages stay mounted during the short auth-refresh grace window.
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

  // Check if we're on the chat or build page - they have their own custom layout
  const isCustomLayoutPage =
    pathname?.startsWith("/dashboard/chat") ||
    pathname?.startsWith("/dashboard/build");

  // For chat/build pages, render children directly without standard layout
  if (isCustomLayoutPage) {
    return (
      <OnboardingProvider>
        <PageHeaderProvider>{children}</PageHeaderProvider>
        <OnboardingOverlay />
      </OnboardingProvider>
    );
  }

  // Standard dashboard layout for all other pages
  return (
    <OnboardingProvider>
      <PageHeaderProvider>
        <div className="dashboard-theme flex h-screen w-full bg-neutral-950">
          {/* Sidebar */}
          <Sidebar isOpen={sidebarOpen} onToggle={handleToggleSidebar} />

          {/* Main Content */}
          <div className="flex flex-1 max-md:pl-3 py-3 pr-3 flex-col overflow-hidden gap-1.5 md:gap-3">
            {/* Header - keep authenticated UI stable during short auth refresh windows */}
            <Header
              onToggleSidebar={handleToggleSidebar}
              // During the auth grace window shouldAllowProtectedContent is true
              // even though `authenticated` is false, so the header shows as
              // authenticated. This is intentional for UX stability — prevents
              // the header from flickering to anonymous during Privy refreshes.
              isAnonymous={!shouldAllowProtectedContent}
              authGraceActive={authGraceActive && !authenticated}
            />

            {/* Main Content Area */}
            <ScrollArea className="flex-1 min-w-0 border border-white/10 bg-black/80">
              <main className="p-3 md:p-6 w-0 min-w-full overflow-hidden">
                {children}
              </main>
            </ScrollArea>
          </div>
        </div>
      </PageHeaderProvider>
      <OnboardingOverlay />
    </OnboardingProvider>
  );
}
