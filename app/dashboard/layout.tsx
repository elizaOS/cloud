"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { PageHeaderProvider } from "@/components/layout/page-header-context";
import { OnboardingProvider, OnboardingOverlay } from "@/components/onboarding";

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

  // Check if we're on a page with custom layout - they render children directly
  const isCustomLayoutPage =
    pathname?.startsWith("/dashboard/chat") ||
    pathname?.startsWith("/dashboard/build");

  // Pages that need full width without padding (but keep sidebar/header)
  const isFullWidthPage = 
    pathname?.startsWith("/dashboard/apps/create") ||
    (pathname?.startsWith("/dashboard/workflows/") && pathname !== "/dashboard/workflows");

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
        <div className="flex h-screen w-full bg-[#0A0A0A]">
          {/* Sidebar */}
          <Sidebar isOpen={sidebarOpen} onToggle={handleToggleSidebar} />

          {/* Main Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header - pass auth state for signup button */}
            <Header
              onToggleSidebar={handleToggleSidebar}
              isAnonymous={!authenticated}
            />

            {/* Main Content Area */}
            <main className={`flex-1 bg-[#0A0A0A] ${isFullWidthPage ? "overflow-hidden relative" : "overflow-y-auto"}`}>
              <div className={isFullWidthPage ? "absolute inset-0" : "px-2 py-3 md:px-6 md:py-6"}>{children}</div>
            </main>
          </div>
        </div>
      </PageHeaderProvider>
      <OnboardingOverlay />
    </OnboardingProvider>
  );
}
