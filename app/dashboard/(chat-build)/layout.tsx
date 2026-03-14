/**
 * Chat/Build Shared Layout
 * Fullscreen layout for /chat and /build pages with sidebar
 * Sidebar is hidden in build mode (both creator and edit modes)
 */

"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { ChatSidebar } from "@/components/layout/chat-sidebar";

/**
 * Shared layout component for chat and build pages.
 * Provides a fullscreen layout with sidebar navigation.
 * Sidebar is only shown on chat pages, hidden on build pages.
 *
 * @param children - The page content to render.
 * @returns The rendered layout with sidebar and content area.
 */
export default function ChatBuildLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Hide sidebar on build pages (creator mode and edit mode)
  const isBuildPage = pathname?.startsWith("/dashboard/build");

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="dashboard-theme flex h-screen w-full overflow-hidden bg-neutral-950">
      {/* Chat Sidebar - hidden in build mode */}
      {!isBuildPage && <ChatSidebar isOpen={sidebarOpen} onToggle={handleToggleSidebar} />}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Mobile Menu Button - only on chat pages */}
        {!isBuildPage && (
          <button
            onClick={handleToggleSidebar}
            className="fixed left-4 top-4 z-30 border border-white/10 bg-white/5 p-2 transition-colors hover:border-white/20 hover:bg-white/10 md:hidden"
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5 text-white" />
          </button>
        )}

        {/* Content Area - Full Height */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
