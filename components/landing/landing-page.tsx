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
import { usePrivy } from "@/lib/providers/PrivyProvider";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePlatform } from "@/lib/hooks/use-platform";
import BayerDitheringBackground from "./BayerDitheringBackground";
import { toast } from "sonner";

interface LandingPageProps {
  accessError?: string;
}

export function LandingPage({ accessError }: LandingPageProps) {
  const { ready, authenticated } = usePrivy();
  const { isTauri, isLoading: platformLoading } = usePlatform();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const errorShownRef = useRef(false);

  // Show access error toast
  useEffect(() => {
    if (accessError && !errorShownRef.current) {
      errorShownRef.current = true;

      if (accessError === "private_character") {
        toast.error("This agent is private", {
          description:
            "Sign in to access your agents, or ask the owner to make this agent public.",
          duration: 6000,
        });
      }

      // Clear error from URL
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [accessError]);

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
    <div className="flex h-screen bg-black">
      <BayerDitheringBackground />

      <div className="relative z-30 flex w-full flex-col overflow-y-scroll sm:scrollbar-thin sm:scrollbar-thumb-brand-orange sm:scrollbar-track-black">
        <LandingHeader />

        <TopHero />
        <OnChainTrust />
        <Installation />
        <Footer />
      </div>
    </div>
  );
}
