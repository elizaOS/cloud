/**
 * Build Mode Bottom Panel Component
 * Minimalistic bottom panel for /build route only
 */

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Settings, Settings2, User } from "lucide-react";

export function BuildModeBottomPanel() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();

  // Get user name
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
    <div className="m-6">
      <div onClick={() => {
        router.push("/dashboard/settings");
      }} className="px-4 py-4 flex items-center gap-3 justify-center cursor-pointer hover:bg-white/5 transition-colors">
        <Settings2 className="h-4 w-4 text-white/60" />
        <div className="flex-1 text-sm text-white/70 truncate"
          style={{
            fontFamily: "var(--font-roboto-mono)",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "18px",
            letterSpacing: "-0.003em",
          }}>
          Settings
        </div>
      </div>
      <div className="border border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          {/* Settings Icon */}
          <button
            onClick={() => router.push("/dashboard/settings")}
            className="flex items-center justify-center w-8 h-8 hover:bg-white/5 transition-colors rounded-none"
            title="Settings"
          >
            <User className="h-4 w-4 text-white/60" />
          </button>

          {/* User Name */}
          <div
            className="flex-1 text-sm text-white/70 truncate"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "18px",
              letterSpacing: "-0.003em",
            }}
          >
            {getUserName()}
          </div>
        </div>
      </div>
    </div>
  );
}
