/**
 * Landing Header Component
 * Header for the landing page - shows different UI for authenticated vs unauthenticated users
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LockOnButton } from "@/components/brand";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import UserMenu from "@/components/layout/user-menu";

export default function LandingHeader() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  // No auto-redirect - let users stay on landing page even when logged in

  const handleLogin = () => {
    router.push("/login");
  };

  const handleGetStarted = () => {
    router.push("/login?intent=signup");
  };

  const handleDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <header className="absolute top-0 z-50 w-full">
      <div className="flex h-16 items-center justify-between w-full px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <Image
              src="/eliza-font.svg"
              alt="ELIZA"
              width={80}
              height={24}
              className="h-5 w-auto"
            />
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
              {/* Unauthenticated - show Login + Sign Up */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogin}
                disabled={!ready}
                className="text-white/70 hover:text-white hover:bg-white/5"
              >
                Log in
              </Button>
              <LockOnButton
                size="sm"
                onClick={handleGetStarted}
                disabled={!ready}
              >
                Sign Up
              </LockOnButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
