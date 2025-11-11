"use client";

import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check } from "lucide-react";
import { CornerBrackets, SectionLabel, BrandCard } from "@/components/brand";
import MicropaymentNetwork from "./MicropaymentNetwork";

const agents = [
  {
    name: "Eliza",
    description: "Your default AI Companion",
    verified: true,
    address: "0xA9E3...C14",
  },
  {
    name: "Eliza",
    description: "Your default AI Companion",
    verified: true,
    address: "0xA9E3...C14",
  },
  {
    name: "Eliza",
    description: "Your default AI Companion",
    verified: true,
    address: "0xA9E3...C14",
  },
];

export default function OnChainTrust() {
  return (
    <section className="relative border-t border-white/10 bg-[#0A0A0A] py-16 md:py-24">
      {/* Corner brackets */}
      <CornerBrackets size="xl" variant="full-border" className="m-8" />

      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-12 flex items-start justify-between">
          <div className="max-w-4xl">
            <div className="mb-6">
              <SectionLabel>ON-CHAIN TRUST & ECONOMY</SectionLabel>
            </div>

            <h2 className="mb-6 text-3xl md:text-4xl lg:text-5xl font-bold leading-tight text-white">
              EVERY AGENT HAS A VERIFIABLE ON-CHAIN IDENTITY — ENABLING
              PROVENANCE, REPUTATION, AND SECURE INTERACTIONS.
            </h2>

            <p className="text-sm md:text-base leading-relaxed text-white/70">
              Through the x402 standard, agents can also send and receive
              micropayments instantly — powering the world&apos;s first open
              agent economy.
            </p>
          </div>

          <Button
            variant="outline"
            className="hidden shrink-0 gap-2 border-white/20 bg-transparent text-white hover:bg-white/10 md:flex"
          >
            Learn more
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Two column layout */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: Agent list */}
          <div className="space-y-6">
            <BrandCard corners={false} className="space-y-4 rounded-sm">
              {agents.map((agent, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 border-b border-white/10 pb-4 last:border-0 last:pb-0"
                >
                  <div
                    className="h-12 w-12 shrink-0 rounded-full"
                    style={{ backgroundColor: "#FF580040" }}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">
                        {agent.name}
                      </h3>
                    </div>
                    <p className="text-sm text-white/60">{agent.description}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <div
                        className="flex items-center gap-1"
                        style={{ color: "#FF5800" }}
                      >
                        <Check className="h-3 w-3" />
                        <span>ERC-8004 Verified</span>
                      </div>
                      <div className="flex items-center gap-1 text-white/60">
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                          />
                        </svg>
                        <span>{agent.address}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </BrandCard>

            <p className="text-sm leading-relaxed text-white/70">
              Every agent on Eliza Cloud has a verifiable on-chain identity,
              anchored to ERC-8004.
            </p>
          </div>

          {/* Right: Network visualization */}
          <BrandCard
            corners={false}
            className="flex min-h-[400px] items-center justify-center rounded-sm"
          >
            <div className="w-full text-center">
              <p className="mb-8 text-sm text-white/70">
                Agents can also send and receive micropayments instantly.
              </p>

              {/* Floating Network Animation */}
              <MicropaymentNetwork />
            </div>
          </BrandCard>
        </div>

        {/* Bottom tagline */}
        <div className="mt-16 text-center">
          <p className="text-xl md:text-2xl tracking-wider text-white">
            IDENTITY. REPUTATION. PAYMENT.{" "}
            <span className="text-white/60">ALL NATIVE TO YOUR AGENT.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
