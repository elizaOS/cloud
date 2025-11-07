"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { PageHeaderProvider } from "@/components/layout/page-header-context";
import { useAuthRedirect } from "@/lib/hooks/use-auth-redirect";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { ready, authenticated } = useAuthRedirect({ requireAuth: true });

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

  // Don't render dashboard if not authenticated (during redirect)
  if (!authenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

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
          {/* Header */}
          <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto bg-[#0A0A0A]">
            <div className="h-full px-4 py-4 md:px-6 md:py-6">{children}</div>
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  );
}
