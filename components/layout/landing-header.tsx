/**
 * Landing Header Component
 * Header for the unauthenticated landing page
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useThemeLogo } from "./use-theme-logo";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingHeader() {
  const logoSrc = useThemeLogo();
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();

  // Auto-redirect to dashboard when authenticated
  useEffect(() => {
    if (ready && authenticated) {
      console.log("User authenticated in header, redirecting to dashboard...");
      router.push("/dashboard");
    }
  }, [ready, authenticated, router]);

  const handleAuth = () => {
    console.log("Header auth button clicked:", { authenticated, ready });

    if (!ready) {
      console.log("Privy not ready yet");
      return;
    }

    if (authenticated) {
      router.push("/dashboard");
    } else {
      console.log("Calling Privy login from header...");
      login();
    }
  };

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logoSrc}
            alt="elizaOS"
            width={120}
            height={40}
            className="h-8 w-auto"
            priority
            key={logoSrc}
          />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={handleAuth}>
            Log in
          </Button>
          <Button size="sm" onClick={handleAuth}>
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
}
