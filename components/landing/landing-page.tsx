"use client";

import LandingHeader from "@/components/layout/landing-header";
import TopHero from "@/components/landing/TopHero";
import RouterSection from "@/components/landing/RouterSection";
import OnChainTrust from "@/components/landing/OnChainTrust";
import Agents from "@/components/landing/Agents";
import Installation from "@/components/landing/Installation";
import Footer from "@/components/landing/Footer";

export function LandingPage() {
  // Removed auto-redirect - let authenticated users browse landing page
  // Header will show Dashboard link + user menu instead of login button

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
