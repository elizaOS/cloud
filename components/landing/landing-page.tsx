"use client";

import LandingHeader from "@/components/layout/landing-header";
import TopHero from "@/components/landing/TopHero";
import RouterSection from "@/components/landing/RouterSection";
import OnChainTrust from "@/components/landing/OnChainTrust";
import Installation from "@/components/landing/Installation";
import Footer from "@/components/landing/Footer";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

export function LandingPage() {
  // Header will show Dashboard link + user menu instead of login button

  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  if (!ready) return null;

  if (authenticated) {
    router.replace("/dashboard");
    return null;
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
