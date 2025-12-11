/**
 * On-chain trust section component for the landing page.
 * Displays blockchain trust features, micropayment network visualization, and trust indicators.
 */

"use client";

import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check } from "lucide-react";
import { CornerBrackets, SectionLabel, BrandCard } from "@/components/brand";
import MicropaymentNetwork from "./MicropaymentNetwork";
import Image from "next/image";
import { ReactFlowProvider } from "@xyflow/react";

export default function OnChainTrust() {
  return (
    <section className="relative bg-[#0A0A0A] py-12 md:py-16 lg:py-24 overflow-hidden">
      {/* Background skew image */}
      <div className="absolute top-0 bottom-0 left-4 right-4 pointer-events-none">
        <Image
          src="/eliza-skew-v2.png"
          alt=""
          fill
          className="object-cover opacity-30"
        />
      </div>

      {/* Corner brackets with connecting borders - hidden on mobile */}
      <div className="absolute inset-0 pointer-events-none hidden md:block">
        {/* Top border */}
        <div className="absolute top-0 left-4 right-4 h-px bg-white/10" />
        {/* Bottom border */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-white/10" />
        {/* Left border */}
        <div className="absolute top-0 bottom-0 left-0 w-px bg-white/10 ml-4" />
        {/* Right border */}
        <div className="absolute top-0 bottom-0 right-0 w-px bg-white/10 mr-4" />
      </div>
      <div className="hidden md:block">
        <CornerBrackets size="md" variant="corners" className="mx-4" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="mb-8 md:mb-12 flex flex-col md:flex-row items-start md:justify-between gap-6">
          <div className="max-w-4xl">
            <div className="mb-4 md:mb-6">
              <SectionLabel>ON-CHAIN TRUST & ECONOMY</SectionLabel>
            </div>

            <h2
              className="mb-4 md:mb-6 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium uppercase"
              style={{
                fontFamily: "var(--font-geist-sans)",
                lineHeight: "1.3",
                color: "#FFFFFF",
              }}
            >
              WALLETS. IDENTITY. REPUTATION.
            </h2>

            <p
              className="font-normal text-sm md:text-base"
              style={{
                lineHeight: "1.5",
                letterSpacing: "-0.003em",
                color: "#858585",
              }}
            >
              Every agent is on-chain, discoverable, and earns trust over time
              with ERC-8004.
            </p>
          </div>

          <Button
            variant="outline"
            className="hidden lg:flex shrink-0 gap-2 rounded-none transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(225,225,225,0.4)] active:scale-95"
            style={{
              backgroundColor: "#E1E1E1",
              borderColor: "#E1E1E1",
              color: "#000000",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
              e.currentTarget.style.borderColor = "#FFFFFF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#E1E1E1";
              e.currentTarget.style.borderColor = "#E1E1E1";
            }}
          >
            Learn more
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Two column layout */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: 3x3 Grid of Agent wallet cards with radial fade */}
          <div className="relative">
            {/* 3x3 Grid container with radial mask */}
            <div
              className="grid grid-cols-3 gap-2 relative"
              style={{
                maskImage:
                  "radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 25%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.2) 75%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 25%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.2) 75%, transparent 100%)",
              }}
            >
              {[...Array(9)].map((_, index) => {
                return (
                  <div
                    key={index}
                    className="border border-white/10 rounded-sm p-3 transition-all duration-300 hover:scale-[1.02] hover:z-10 cursor-pointer"
                    style={{
                      background: "rgba(10,10,10,0.9)",
                      boxShadow: "0 0 20px rgba(0,0,0,0.3)",
                      backdropFilter: "blur(10px)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.transform = "scale(1.02)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.transform = "scale(1)")
                    }
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-sm flex-shrink-0 relative overflow-hidden">
                          <Image
                            src="/agent-wallet.png"
                            alt="Agent"
                            fill
                            className="object-cover"
                          />
                        </div>
                        <h3 className="text-xs font-semibold text-white">
                          Eliza
                        </h3>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-white/60 mb-1.5 line-clamp-1">
                          Your default AI Companion
                        </p>
                        <div
                          className="flex items-center gap-1 mb-1"
                          style={{ color: "#FF5800" }}
                        >
                          <Check className="h-2.5 w-2.5" />
                          <span className="text-[10px]">ERC-8004 Verified</span>
                        </div>
                        <div className="flex items-center gap-1 text-white/40">
                          <svg
                            className="h-2.5 w-2.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z"
                            />
                          </svg>
                          <span className="text-[10px] font-mono">
                            0xA9E3...C14
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Network visualization */}
          <BrandCard
            corners={false}
            className="flex min-h-[400px] items-center justify-center rounded-sm"
          >
            <div className="w-full">
              <ReactFlowProvider>
                <MicropaymentNetwork />
              </ReactFlowProvider>
            </div>
          </BrandCard>
        </div>

        {/* Bottom tagline */}
        <div className="mt-12 md:mt-16 text-center px-4">
          <p className="uppercase text-base sm:text-lg md:text-xl lg:text-2xl tracking-wider text-white">
            Agents discover each other, build trust, and transact.{" "}
            <span className="uppercase text-white/60">All on-chain.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
