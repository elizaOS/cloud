/**
 * Landing header component for the landing page.
 * Displays different UI for authenticated vs unauthenticated users with navigation links.
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LockOnButton } from "@/components/brand";
import { usePrivy } from "@/lib/providers/PrivyProvider";
import { useRouter } from "next/navigation";
import UserMenu from "@/components/layout/user-menu";
import { motion } from "framer-motion";

export default function LandingHeader() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  // No auto-redirect - let users stay on landing page even when logged in

  const handleGetStarted = () => {
    router.push("/login?intent=signup");
  };

  return (
    <motion.header className="fixed top-0 left-0 z-[100] w-full pointer-events-auto pr-4 sm:pr-[20px] bg-black/40 backdrop-blur-md md:bg-transparent md:backdrop-blur-none">
      <div className="flex h-16 items-center justify-between w-full pl-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/cloudlogo.svg"
              alt="ELIZA"
              width={100}
              height={100}
              className="w-20 sm:w-24 invert shrink-0"
            />
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <>
              {/* Authenticated user - show Dashboard + UserMenu */}
              <Button
                size="sm"
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
                className="text-base text-white hover:text-white hover:bg-white/5"
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <LockOnButton
                size="sm"
                onClick={handleGetStarted}
                disabled={!ready}
                className="text-sm"
              >
                Sign Up
              </LockOnButton>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}
