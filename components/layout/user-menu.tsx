/**
 * User Menu Component
 * Displays authentication state and user actions
 */

"use client";

import { usePrivy, useLogin, useLogout } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Loader2, Coins, Settings, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCreditsStream } from "@/hooks/use-credits-stream";

export default function UserMenu() {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const router = useRouter();
  const { creditBalance, isLoading: loadingCredits } = useCreditsStream();

  // Loading state
  if (!ready) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  // Signed out state
  if (!authenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={login}>
          Log in
        </Button>
        <Button size="sm" onClick={login}>
          Sign Up
        </Button>
      </div>
    );
  }

  // Handle sign out
  const onSignOut = async () => {
    try {
      // Call Privy's logout to clear authentication state
      await logout();

      // Force redirect to home page
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
      // Still try to redirect even if there's an error
      router.push("/");
    }
  };

  // Get user details
  const getUserWallet = () => {
    // Check linked accounts for wallet
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        // Type guard: check if account is a wallet
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
    // Check linked accounts for email
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        // Type guard: check if account has email property
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
    // Try to get name from various sources
    if (user?.google?.name) {
      return user.google.name;
    }
    if (user?.github?.username) {
      return user.github.username;
    }
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        // Type guard: check if account has name property
        if ("name" in account && typeof account.name === "string") {
          return account.name;
        }
        // Type guard: check if account has username property
        if ("username" in account && typeof account.username === "string") {
          return account.username;
        }
      }
    }
    // Fall back to email or wallet
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
    // Show wallet (preferred) or email
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

  // Get user initials for avatar
  const getUserInitials = () => {
    const name = getUserName();
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  // Signed in state
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{getUserName()}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {getUserIdentifier()}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          {loadingCredits && creditBalance === null ? (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <Badge
              variant="secondary"
              className="gap-1.5 px-3 py-1.5 w-full justify-center"
            >
              <Coins className="h-3.5 w-3.5" />
              <span className="font-semibold">
                ${creditBalance !== null ? creditBalance.toFixed(2) : "0.00"}
              </span>
              <span className="text-xs opacity-80">balance</span>
            </Badge>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/account")}>
          <UserCircle className="mr-2 h-4 w-4" />
          <span>Account</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/dashboard/billing")}>
          <Coins className="mr-2 h-4 w-4" />
          <span>Billing</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/dashboard/api-keys")}>
          <Settings className="mr-2 h-4 w-4" />
          <span>API Keys</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
