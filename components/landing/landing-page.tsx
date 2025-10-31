"use client";

import LandingHeader from "@/components/layout/landing-header";
import TopHero from "@/components/landing/TopHero";
import RouterSection from "@/components/landing/RouterSection";
import Agents from "@/components/landing/Agents";
import Installation from "@/components/landing/Installation";
import Footer from "@/components/landing/Footer";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LandingPage() {
  const { authenticated, ready } = usePrivy();
  const router = useRouter();

  // Auto-redirect to dashboard when authenticated
  useEffect(() => {
    if (ready && authenticated) {
      console.log("User authenticated, redirecting to dashboard...");
      router.push("/dashboard");
    }
  }, [ready, authenticated, router]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <LandingHeader />

      {/* Hero Section */}
      <TopHero />

      {/* Agents Section */}
      <Agents />

      {/* Router Section */}
      <RouterSection />

      {/* Installation Section */}
      <Installation />

      {/* Footer */}
      <Footer />
    </div>
  );
}
