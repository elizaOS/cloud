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
  const pathname = usePathname();
  const { creditBalance, isLoading: loadingCredits } = useCredits();

  // Get user display info
  const getUserName = () => {
    if (user?.google?.name) return user.google.name;
    if (user?.email?.address) return user.email.address.split("@")[0];
    if (user?.wallet?.address)
      return `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`;
    return "User";
  };

  const getUserIdentifier = () => {
    if (user?.email?.address) return user.email.address;
    if (user?.wallet?.address)
      return `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`;
    return "";
  };

  const onSignOut = async () => {
    await logout();
    router.push("/");
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
        <CornerBrackets size="sm" className="opacity-20" />

        <div className="relative z-10 px-3 py-3">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-white/40 mb-1">Sign up for full access</p>

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
      <CornerBrackets size="sm" className="opacity-20" />

      {/* User Info */}
      <div className="relative z-10 px-3 py-2.5 border-b border-white/10">
        <div className="text-xs font-medium text-white truncate">
          {getUserName()}
        </div>
        <div className="text-[10px] text-white/30 truncate">
          {getUserIdentifier()}
        </div>
      </div>

      {/* Balance */}
      <div className="relative z-10 px-3 py-2 border-b border-white/10">
        {loadingCredits && creditBalance === null ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#FF5800]" />
            <span className="text-sm font-semibold text-white">
              {creditBalance !== null
                ? Number(creditBalance).toFixed(2)
                : "0.00"}
            </span>
            <span className="text-[10px] text-white/30">credits</span>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="relative z-10 py-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 transition-colors text-xs border-l-2",
                isActive
                  ? "bg-white/10 text-white border-[#FF5800]"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80 border-transparent",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", isActive && "text-[#FF5800]")} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Logout */}
      <div className="relative z-10 border-t border-white/5">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/40 hover:bg-white/5 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
