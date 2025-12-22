/**
 * Chat/Build Shared Layout
 * Fullscreen layout for /chat and /build pages with custom sidebar and header
 * Sidebar is hidden in build mode (both creator and edit modes)
 */

"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ChatSidebar } from "@/components/layout/chat-sidebar";
import { ChatHeader } from "@/components/layout/chat-header";

/**
 * Shared layout component for chat and build pages.
 * Provides a fullscreen layout with sidebar and header navigation.
 * Sidebar is only shown on chat pages, hidden on build pages.
 *
 * @param children - The page content to render.
 * @returns The rendered layout with sidebar, header, and content area.
 */
export default function ChatBuildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  
  // Hide sidebar on build pages (creator mode and edit mode)
  const isBuildPage = pathname?.startsWith("/dashboard/build");

  // Memoize toggle callback to prevent child re-renders
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#0A0A0A] overflow-hidden">
      {/* Chat Sidebar - hidden in build mode */}
      {!isBuildPage && (
        <ChatSidebar isOpen={sidebarOpen} onToggle={handleToggleSidebar} />
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header - mode toggle handled by pathname, sidebar toggle hidden in build mode */}
        <ChatHeader onToggleSidebar={isBuildPage ? undefined : handleToggleSidebar} />

        {/* Content Area - Full Height */}
        <main className="flex-1 overflow-hidden bg-[#0A0A0A]">{children}</main>
      </div>
    </div>
  );
}
