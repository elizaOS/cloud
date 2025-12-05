"use client";

import LandingHeader from "@/components/layout/landing-header";
import TopHero from "@/components/landing/TopHero";
import RouterSection from "@/components/landing/RouterSection";
import OnChainTrust from "@/components/landing/OnChainTrust";
import Installation from "@/components/landing/Installation";
import Footer from "@/components/landing/Footer";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

export function LandingPage() {
  // Header will show Dashboard link + user menu instead of login button
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (ready && authenticated && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.replace("/dashboard");
    }
  }, [ready, authenticated, router]);

  if (!ready) return null;

  // Show loading while redirecting authenticated users
  if (authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Redirecting to dashboard...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <LandingHeader />

      {/* Hero Section */}
      <TopHero />

      {/* Agents Section */}
      {/* <Agents /> */}

      {/* Router Section */}
      <RouterSection />

      {/* OnChain Trust Section */}
      <OnChainTrust />

      {/* Installation Section */}
      <Installation />

      {/* Footer */}
      <Footer />
    </div>
  );
}
