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

  const handleGetStarted = () => {
    router.push("/login?intent=signup");
  };

  return (
    <header className="fixed top-0 left-0 z-[100] w-full pointer-events-auto">
      <div className="flex h-16 items-center justify-between w-full px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center gap-2">
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
                // onClick={handleDashboard}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              {/* Unauthenticated - show Login + Sign Up */}
              <Button
                variant="ghost"
                size="sm"
                disabled={!ready}
                className="text-white/70 hover:text-white hover:bg-white/5"
              >
                <Link href="/login">Log in</Link>
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
