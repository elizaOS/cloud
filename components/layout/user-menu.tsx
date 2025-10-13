/**
 * User Menu Component
 * Displays authentication state and user actions
 */

"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
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
import { useEffect, useState } from "react";
import { handleSignOut } from "@/app/actions/auth";
import { useRouter } from "next/navigation";
import { useCreditsStream } from "@/hooks/use-credits-stream";

export default function UserMenu() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [signUpUrl, setSignUpUrl] = useState<string | null>(null);
  const {
    creditBalance,
    isLoading: loadingCredits,
  } = useCreditsStream();

  useEffect(() => {
    async function getAuthUrls() {
      const [signIn, signUp] = await Promise.all([
        getSignInUrl(),
        getSignUpUrl(),
      ]);
      setSignInUrl(signIn);
      setSignUpUrl(signUp);
    }
    if (!user && !loading) {
      getAuthUrls();
    }
  }, [user, loading]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  // Signed out state
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {signInUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={signInUrl}>Log in</a>
          </Button>
        )}
        {signUpUrl && (
          <Button size="sm" asChild>
            <a href={signUpUrl}>Sign Up</a>
          </Button>
        )}
      </div>
    );
  }

  // Handle sign out using server action
  const onSignOut = async () => {
    await handleSignOut();
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (user.firstName) {
      const firstInitial = user.firstName.charAt(0).toUpperCase();
      const lastInitial = user.lastName
        ? user.lastName.charAt(0).toUpperCase()
        : "";
      return `${firstInitial}${lastInitial}`;
    }
    return user.email?.charAt(0).toUpperCase() || "U";
  };

  const getUserDisplayName = () => {
    if (user.firstName) {
      return `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`;
    }
    return user.email || "User";
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
            <p className="text-sm font-medium leading-none">
              {getUserDisplayName()}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
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
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 w-full justify-center">
              <Coins className="h-3.5 w-3.5" />
              <span className="font-semibold">
                {creditBalance !== null ? creditBalance.toLocaleString() : "0"}
              </span>
              <span className="text-xs opacity-80">credits</span>
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
