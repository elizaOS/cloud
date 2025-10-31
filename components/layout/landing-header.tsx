/**
 * Landing Header Component
 * Header for the unauthenticated landing page
 */

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingHeader() {
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
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAuth}
            className="text-white/70 hover:text-white hover:bg-white/5"
          >
            Log in
          </Button>
          <Button
            size="sm"
            onClick={handleAuth}
            className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
          >
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
}
