/**
 * User Menu Component
 * Displays authentication state and user actions
 */

"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, User, Loader2, Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { handleSignOut, getCreditBalance } from "@/app/actions/auth";

export default function UserMenu() {
  const { user, loading } = useAuth();
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [signUpUrl, setSignUpUrl] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

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

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function fetchCreditBalance() {
      if (!user || loading) return;

      setLoadingCredits(true);
      try {
        const balance = await getCreditBalance();
        setCreditBalance(balance);
      } catch (error) {
        console.error("Failed to fetch credit balance:", error);
      } finally {
        setLoadingCredits(false);
      }
    }

    if (user && !loading) {
      fetchCreditBalance();
      interval = setInterval(fetchCreditBalance, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
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

  // Signed in state
  return (
    <div className="flex items-center gap-3">
      {/* Credit Balance */}
      <div className="flex items-center gap-2">
        {loadingCredits && creditBalance === null ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
            <Coins className="h-3.5 w-3.5" />
            <span className="font-semibold">
              {creditBalance !== null ? creditBalance.toLocaleString() : "0"}
            </span>
            <span className="text-xs opacity-80">credits</span>
          </Badge>
        )}
      </div>

      {/* User info */}
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="hidden sm:inline-block font-medium">
          {user.firstName
            ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
            : user.email}
        </span>
      </div>

      {/* Logout button */}
      <Button onClick={onSignOut} variant="outline" size="sm" className="gap-2">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline-block">Sign out</span>
      </Button>
    </div>
  );
}
