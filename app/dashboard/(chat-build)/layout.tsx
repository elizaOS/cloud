/**
 * Chat/Build Shared Layout
 * Fullscreen layout for /chat and /build pages with custom sidebar and header
 */

"use client";

import { useState, useCallback } from "react";
import { ChatSidebar } from "@/components/layout/chat-sidebar";
import { ChatHeader } from "@/components/layout/chat-header";

/**
 * Shared layout component for chat and build pages.
 * Provides a fullscreen layout with sidebar and header navigation.
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

  // Memoize toggle callback to prevent child re-renders
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#0A0A0A] overflow-hidden">
      {/* Chat Sidebar */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onToggle={handleToggleSidebar}
      />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header - mode toggle handled by pathname */}
        <ChatHeader onToggleSidebar={handleToggleSidebar} />

        {/* Content Area - Full Height */}
        <main className="flex-1 overflow-hidden bg-[#0A0A0A]">{children}</main>
      </div>
    </div>
  );
}
