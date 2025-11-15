/**
 * Chat Sidebar Bottom Panel Component
 * Simple bottom panel for chat route matching Figma design
 */

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatSidebarBottomPanelProps {
  className?: string;
}

export function ChatSidebarBottomPanel({ className }: ChatSidebarBottomPanelProps) {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();

  const getUserName = () => {
    if (user?.google?.name) {
      return user.google.name;
    }
    if (user?.github?.username) {
      return user.github.username;
    }
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        if ("name" in account && typeof account.name === "string") {
          return account.name;
        }
        if ("username" in account && typeof account.username === "string") {
          return account.username;
        }
      }
    }
    if (user?.email?.address) {
      return user.email.address.split("@")[0];
    }
    return "User";
  };

  // If not authenticated, don't show anything
  if (!ready || !authenticated || !user) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2 px-6 py-4", className)}>
      {/* Settings Row */}
      <div className="px-4 py-4">
        <button
          onClick={() => router.push("/dashboard/settings")}
          className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
        >
          <Settings className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
          <p
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "normal",
              color: "#a2a2a2",
            }}
          >
            Settings
          </p>
        </button>
      </div>

      {/* User Row */}
      <div className="border border-[#2e2e2e] px-4 py-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
          <p
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "normal",
              color: "#a2a2a2",
            }}
          >
            {getUserName()}
          </p>
        </div>
      </div>
    </div>
  );
}
