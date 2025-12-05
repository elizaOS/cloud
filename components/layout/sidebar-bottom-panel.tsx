/**
 * Sidebar Bottom Panel Component
 * Displays user info, balance, and settings menu items
 */

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { UserPlus, LogIn, Settings, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";
import { useCredits } from "@/providers/CreditsProvider";

interface SidebarBottomPanelProps {
  className?: string;
}

export function SidebarBottomPanel({ className }: SidebarBottomPanelProps) {
  const { ready, authenticated, user, logout } = usePrivy();
  const router = useRouter();

  // If not authenticated, show sign up/login CTA
  if (!ready || !authenticated || !user) {
    // Don't show anything while checking auth state
    if (!ready) {
      return null;
    }

    // Anonymous user CTA panel
    return (
      <div className={cn("relative border-t border-white/10", className)}>
        <CornerBrackets size="sm" className="opacity-20" />

        <div className="relative z-10 px-3 py-3">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-white/40 mb-1">
              Sign up for full access
            </p>

            <button
              onClick={() => router.push("/login")}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FF5800] hover:bg-[#FF5800]/90 text-white text-xs font-medium rounded-sm transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Sign Up</span>
            </button>

            <button
              onClick={() => router.push("/login")}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-white/15 hover:bg-white/5 text-white/70 hover:text-white text-xs rounded-sm transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Log In</span>
            </button>

            <div className="mt-1 space-y-1 text-[10px] text-white/30">
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-[#FF5800]/60" />
                <span>Unlimited chats</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-[#FF5800]/60" />
                <span>Custom agents</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
