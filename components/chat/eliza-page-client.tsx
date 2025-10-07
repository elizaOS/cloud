"use client";

import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { useSetPageHeader } from "@/components/layout/page-header-context";

export function ElizaPageClient() {
  useSetPageHeader({
    title: "Eliza Agent",
    description:
      "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <ElizaChatInterface />
      </div>
    </div>
  );
}
