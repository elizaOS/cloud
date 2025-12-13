/**
 * Main landing page component.
 *
 * Web: Shows landing page for anonymous users, redirects authenticated to dashboard.
 * Mobile (Tauri): Skips landing page entirely.
 *   - Not authenticated → /login
 *   - Authenticated → /dashboard
 */

"use client";

import LandingHeader from "@/components/layout/landing-header";
import TopHero from "@/components/landing/TopHero";
import OnChainTrust from "@/components/landing/OnChainTrust";
import Installation from "@/components/landing/Installation";
import Footer from "@/components/landing/Footer";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePlatform } from "@/lib/hooks/use-platform";

export function LandingPage() {
  const { ready, authenticated } = usePrivy();
  const { isTauri, isLoading: platformLoading } = usePlatform();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!ready || platformLoading || hasRedirectedRef.current) return;

    // Mobile (Tauri): Skip landing page entirely
    if (isTauri) {
      hasRedirectedRef.current = true;
      if (authenticated) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
      return;
    }

    // Web: Redirect authenticated users to dashboard
    if (authenticated) {
      hasRedirectedRef.current = true;
      router.replace("/dashboard");
    }
  }, [ready, authenticated, isTauri, platformLoading, router]);

  // Still loading
  if (!ready || platformLoading) return null;

  // Mobile: Show loading while redirecting
  if (isTauri) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-2 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Web: Show loading while redirecting authenticated users
  if (authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Redirecting to dashboard...</span>
      </div>
    );
  }

  // Web: Show landing page for anonymous users
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <TopHero />
      <OnChainTrust />
      <Installation />
      <Footer />
    </div>
  );
}
