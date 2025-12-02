/**
 * Sidebar Bottom Panel Component
 * Displays user info, balance, and settings menu items
 */

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { UserPlus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";

interface SidebarBottomPanelProps {
  className?: string;
}

export function SidebarBottomPanel({ className }: SidebarBottomPanelProps) {
  const { ready, authenticated, user } = usePrivy();
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
        {/* Corner brackets for the panel */}
        <CornerBrackets size="sm" className="opacity-30" />

        {/* Anonymous User CTA */}
        <div className="relative z-10 px-4 py-4">
          <div
            className="flex flex-col gap-3"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontWeight: 400,
              letterSpacing: "-0.003em",
            }}
          >
            <div className="text-sm text-white/60 mb-1">
              Sign up for full access
            </div>

            {/* Sign Up Button */}
            <button
              onClick={() => router.push("/login")}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5",
                "bg-[#FF5800] hover:bg-[#FF5800]/90",
                "text-white font-medium rounded-none",
                "transition-all duration-200 cursor-pointer"
              )}
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontWeight: 500,
                fontSize: "14px",
                lineHeight: "18px",
                letterSpacing: "-0.003em",
              }}
            >
              <UserPlus className="h-4 w-4" />
              <span>Sign Up</span>
            </button>

            {/* Login Button */}
            <button
              onClick={() => router.push("/login")}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5",
                "border border-white/20 hover:bg-white/5",
                "text-white/80 hover:text-white rounded-none",
                "transition-all duration-200 cursor-pointer"
              )}
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontWeight: 400,
                fontSize: "14px",
                lineHeight: "18px",
                letterSpacing: "-0.003em",
              }}
            >
              <LogIn className="h-4 w-4" />
              <span>Log In</span>
            </button>

            {/* Benefits list */}
            <div className="mt-2 space-y-1.5 text-xs text-white/40">
              <div className="flex items-center gap-2">
                <div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <span>Unlimited conversations</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <span>Create custom agents</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <span>Access premium features</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
