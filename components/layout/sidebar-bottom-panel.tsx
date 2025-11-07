/**
 * Sidebar Bottom Panel Component
 * Displays user info, balance, and settings menu items
 */

"use client";

import { usePrivy, useLogout } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { useCreditsStream } from "@/hooks/use-credits-stream";
import { CreditCard, LogOut, Loader2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";

interface SidebarBottomPanelProps {
  className?: string;
}

export function SidebarBottomPanel({ className }: SidebarBottomPanelProps) {
  const { ready, authenticated, user } = usePrivy();
  const { logout } = useLogout();
  const router = useRouter();
  const pathname = usePathname();
  const { creditBalance, isLoading: loadingCredits } = useCreditsStream();

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
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
      router.push("/");
    }
  };

  // If not authenticated or not ready, don't show the panel
  if (!ready || !authenticated || !user) {
    return null;
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
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-white truncate">
            {getUserName()}
          </div>
          <div className="text-xs text-white/40 truncate">
            {getUserIdentifier()}
          </div>
        </div>
      </div>

      {/* Balance Display - Always Visible */}
      <div className="relative z-10 px-4 py-3 border-b border-white/10">
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
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 border-l-2 cursor-pointer",
                isActive
                  ? "bg-white/10 text-white border-[#FF5800]"
                  : "text-white/60 hover:bg-white/5 hover:text-white border-transparent",
              )}
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
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-red-400 transition-all duration-200 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
