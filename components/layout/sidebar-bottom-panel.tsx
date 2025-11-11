/**
 * Sidebar Bottom Panel Component
 * Displays user info, balance, and settings menu items
 */

"use client";

import { usePrivy, useLogout } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { useCreditsStream } from "@/hooks/use-credits-stream";
import { CreditCard, LogOut, Loader2, Settings, UserPlus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";
import { useChatStore } from "@/stores/chat-store";

interface SidebarBottomPanelProps {
  className?: string;
}

export function SidebarBottomPanel({ className }: SidebarBottomPanelProps) {
  const { ready, authenticated, user } = usePrivy();
  const { logout } = useLogout();
  const router = useRouter();
  const pathname = usePathname();
  const { creditBalance, isLoading: loadingCredits } = useCreditsStream();
  const { clearChatData } = useChatStore();

  // Get user details
  const getUserWallet = () => {
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        if (
          account.type === "wallet" &&
          "address" in account &&
          typeof account.address === "string"
        ) {
          return account.address;
        }
      }
    }
    return null;
  };

  const getUserEmail = () => {
    if (user?.email?.address) {
      return user.email.address;
    }
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        if ("address" in account && account.type === "email") {
          return account.address;
        }
        if ("email" in account && typeof account.email === "string") {
          return account.email;
        }
      }
    }
    return null;
  };

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
    const email = getUserEmail();
    if (email) {
      return email.split("@")[0];
    }
    const wallet = getUserWallet();
    if (wallet) {
      return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
    }
    return "User";
  };

  const getUserIdentifier = () => {
    const wallet = getUserWallet();
    if (wallet) {
      return `${wallet.substring(0, 8)}...${wallet.substring(wallet.length - 6)}`;
    }
    const email = getUserEmail();
    if (email) {
      return email;
    }
    return "No identifier";
  };

  // Handle sign out
  const onSignOut = async () => {
    try {
      // Clear chat data (rooms, entityId, localStorage)
      clearChatData();

      await logout();
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
      router.push("/");
    }
  };

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
              fontFamily: 'var(--font-roboto-mono)',
              fontWeight: 400,
              letterSpacing: '-0.003em',
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
                fontFamily: 'var(--font-roboto-mono)',
                fontWeight: 500,
                fontSize: '14px',
                lineHeight: '18px',
                letterSpacing: '-0.003em',
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
                fontFamily: 'var(--font-roboto-mono)',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '18px',
                letterSpacing: '-0.003em',
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

  const menuItems = [
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      href: "/dashboard/settings",
    },
  ];

  return (
    <div className={cn("relative border-t border-white/10", className)}>
      {/* Corner brackets for the panel */}
      <CornerBrackets size="sm" className="opacity-30" />

      {/* User Info Header - Clickable to expand/collapse */}
      <div className="relative z-10 px-4 py-3 border-b border-white/10">
        <div 
          className="flex flex-col gap-2"
          style={{
            fontFamily: 'var(--font-roboto-mono)',
            fontWeight: 400,
            letterSpacing: '-0.003em',
          }}
        >
          <div className="text-sm font-medium text-white truncate">
            {getUserName()}
          </div>
          <div className="text-xs text-white/40 truncate">
            {getUserIdentifier()}
          </div>
        </div>
      </div>

      {/* Balance Display - Always Visible */}
      <div 
        className="relative z-10 px-4 py-3 border-b border-white/10"
        style={{
          fontFamily: 'var(--font-roboto-mono)',
          fontWeight: 400,
          letterSpacing: '-0.003em',
        }}
      >
        {loadingCredits && creditBalance === null ? (
          <div className="flex items-center gap-2 text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: "#FF5800" }}
            />
            <span className="text-lg font-bold text-white">
              {creditBalance !== null
                ? Number(creditBalance).toFixed(2)
                : "0.00"}
            </span>
            <span className="text-xs text-white/40 ml-1">balance</span>
          </div>
        )}
      </div>

      {/* Menu Items - Always Visible */}
      <div className="relative z-10 py-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-200 border-l-2 cursor-pointer",
                isActive
                  ? "bg-white/10 text-white border-[#FF5800]"
                  : "text-white/60 hover:bg-white/5 hover:text-white border-transparent",
              )}
              style={{
                fontFamily: 'var(--font-roboto-mono)',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '18px',
                letterSpacing: '-0.003em',
              }}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  isActive && "text-[#FF5800]",
                )}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Logout Button - Always Visible */}
      <div className="relative z-10 border-t border-white/5">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-white/60 hover:bg-white/5 hover:text-red-400 transition-all duration-200 cursor-pointer"
          style={{
            fontFamily: 'var(--font-roboto-mono)',
            fontWeight: 400,
            fontSize: '14px',
            lineHeight: '18px',
            letterSpacing: '-0.003em',
          }}
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
