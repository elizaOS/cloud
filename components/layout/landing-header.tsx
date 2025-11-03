/**
 * Landing Header Component
 * Header for the landing page - shows different UI for authenticated vs unauthenticated users
 */

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import UserMenu from "@/components/layout/user-menu";

export default function LandingHeader() {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // No auto-redirect - let users stay on landing page even when logged in

  const handleLogin = async () => {
    if (!ready) return;

    setIsLoggingIn(true);
    try {
      await login();
    } finally {
      setTimeout(() => setIsLoggingIn(false), 1000);
    }
  };

  const handleDashboard = () => {
    router.push("/dashboard");
  };

  const isLoading = !ready || isLoggingIn;

  return (
    <header className="border-b border-white/10 bg-[#0A0A0A] sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <span className="text-white text-xl font-bold">ELIZA</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {authenticated ? (
            <>
              {/* Authenticated user - show Dashboard + UserMenu */}
              <Button
                size="sm"
                onClick={handleDashboard}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                Dashboard
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              {/* Unauthenticated - show Login + Get Started */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogin}
                disabled={isLoading}
                className="text-white/70 hover:text-white hover:bg-white/5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  "Log in"
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleLogin}
                disabled={isLoading}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  "Get Started"
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
