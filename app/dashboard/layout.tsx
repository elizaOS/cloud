"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { PageHeaderProvider } from "@/components/layout/page-header-context";

/**
 * Dashboard Layout - Supports both authenticated and anonymous users
 *
 * Free Mode Paths (accessible without auth):
 * - /dashboard/chat - AI agent chat (FREE!)
 * - /dashboard/build - AI agent builder (FREE!)
 *
 * Protected Paths (require authentication):
 * - All other /dashboard/* routes
 */

// Paths that allow anonymous/free access
const FREE_MODE_PATHS = ["/dashboard/chat", "/dashboard/build"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();

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
          <p className="ml-4 text-sm text-muted-foreground">Loading...</p>
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
    return <PageHeaderProvider>{children}</PageHeaderProvider>;
  }

  // Standard dashboard layout for all other pages
  return (
    <PageHeaderProvider>
      <div className="flex h-screen w-full bg-[#0A0A0A]">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header - pass auth state for signup button */}
          <Header
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            isAnonymous={!authenticated}
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto bg-[#0A0A0A]">
            <div className="h-full px-2 py-3 md:px-6 md:py-6">{children}</div>
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  );
}
