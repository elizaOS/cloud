/**
 * Chat Page Layout
 * Special fullscreen layout for the /chat page with custom sidebar and header
 */

"use client";

import { useState } from "react";
import { ChatSidebar } from "@/components/layout/chat-sidebar";
import { ChatHeader } from "@/components/layout/chat-header";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[#0A0A0A] overflow-hidden">
      {/* Chat Sidebar */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header */}
        <ChatHeader
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Chat Content Area - Full Height */}
        <main className="flex-1 overflow-hidden bg-[#0A0A0A]">
          {children}
        </main>
      </div>
    </div>
  );
}

