"use client";

import {
  useState,
  useEffect,
  useCallback,
  Profiler,
  type ProfilerOnRenderCallback,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { PageHeaderProvider } from "@/components/layout/page-header-context";
import {
  OnboardingProvider,
  OnboardingOverlay,
} from "@/components/onboarding";

// Import render tracker for profiling (dev only)
let onRenderCallback: ProfilerOnRenderCallback | undefined;
if (process.env.NODE_ENV === "development") {
  const tracker = require("@/lib/debug/render-tracker");
  onRenderCallback = tracker.onRenderCallback;
}

/**
 * Free Mode Paths (accessible without auth):
 * - /dashboard/chat - AI agent chat
 * - /dashboard/build - AI agent builder
 */
const FREE_MODE_PATHS = ["/dashboard/chat", "/dashboard/build"];

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
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();

  // Memoize toggle callback to prevent child re-renders
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Check if current path allows free access
  const isFreeModePath = FREE_MODE_PATHS.some((path) =>
    pathname?.startsWith(path),
  );

  // Redirect to login if not authenticated and trying to access protected path
  useEffect(() => {
    if (ready && !authenticated && !isFreeModePath) {
      router.push("/login");
    }
  }, [ready, authenticated, isFreeModePath, router]);

  // Show loading state while checking authentication
  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow free mode paths for anonymous users
  // Redirect other paths to home if not authenticated
  if (!authenticated && !isFreeModePath) {
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
    const content = (
      <OnboardingProvider>
        <PageHeaderProvider>{children}</PageHeaderProvider>
        <OnboardingOverlay />
      </OnboardingProvider>
    );
    if (process.env.NODE_ENV === "development" && onRenderCallback) {
      return (
        <Profiler id="Dashboard-Chat-Build" onRender={onRenderCallback}>
          {content}
        </Profiler>
      );
    }
    return content;
  }

  // Standard dashboard layout for all other pages
  const dashboardContent = (
    <OnboardingProvider>
      <PageHeaderProvider>
        <div className="flex h-screen w-full bg-[#0A0A0A]">
          {/* Sidebar */}
          <Profiler id="Sidebar" onRender={onRenderCallback || (() => {})}>
            <Sidebar isOpen={sidebarOpen} onToggle={handleToggleSidebar} />
          </Profiler>

          {/* Main Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header - pass auth state for signup button */}
            <Profiler id="Header" onRender={onRenderCallback || (() => {})}>
              <Header
                onToggleSidebar={handleToggleSidebar}
                isAnonymous={!authenticated}
              />
            </Profiler>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto bg-[#0A0A0A]">
              <Profiler
                id="Dashboard-Main"
                onRender={onRenderCallback || (() => {})}
              >
                <div className="h-full px-2 py-3 md:px-6 md:py-6">
                  {children}
                </div>
              </Profiler>
            </main>
          </div>
        </div>
      </PageHeaderProvider>
      <OnboardingOverlay />
    </OnboardingProvider>
  );

  if (process.env.NODE_ENV === "development" && onRenderCallback) {
    return (
      <Profiler id="Dashboard-Layout" onRender={onRenderCallback}>
        {dashboardContent}
      </Profiler>
    );
  }

  return dashboardContent;
}
