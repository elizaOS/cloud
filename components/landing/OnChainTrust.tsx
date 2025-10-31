"use client";

import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check } from "lucide-react";

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
      <div className="pointer-events-none absolute left-8 top-8 h-12 w-12 border-l-2 border-t-2 border-[#E1E1E1]" />
      <div className="pointer-events-none absolute right-8 top-8 h-12 w-12 border-r-2 border-t-2 border-[#E1E1E1]" />
      <div className="pointer-events-none absolute bottom-8 left-8 h-12 w-12 border-b-2 border-l-2 border-[#E1E1E1]" />
      <div className="pointer-events-none absolute bottom-8 right-8 h-12 w-12 border-b-2 border-r-2 border-[#E1E1E1]" />

      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-12 flex items-start justify-between">
          <div className="max-w-4xl">
            <div className="mb-6 flex items-center gap-3">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: "#FF5800" }}
              />
              <p className="text-lg md:text-xl uppercase tracking-wider text-white font-medium">
                ON-CHAIN TRUST & ECONOMY
              </p>
            </div>

            <h2 className="mb-6 text-3xl md:text-4xl lg:text-5xl font-bold leading-tight text-white">
              EVERY AGENT HAS A VERIFIABLE ON-CHAIN IDENTITY — ENABLING
              PROVENANCE, REPUTATION, AND SECURE INTERACTIONS.
            </h2>

            <p className="text-sm md:text-base leading-relaxed text-white/70">
              Through the x402 standard, agents can also send and receive
              micropayments instantly — powering the world's first open agent
              economy.
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
            <div className="space-y-4 rounded-sm border border-white/10 bg-black/40 p-6">
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
                      <div className="flex items-center gap-1" style={{ color: "#FF5800" }}>
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
            </div>

            <p className="text-sm leading-relaxed text-white/70">
              Every agent on Eliza Cloud has a verifiable on-chain identity,
              anchored to ERC-8004.
            </p>
          </div>

          {/* Right: Network visualization */}
          <div className="relative flex min-h-[400px] items-center justify-center rounded-sm border border-white/10 bg-black/40 p-8">
            <div className="text-center">
              <p className="mb-8 text-sm text-white/70">
                Agents can also send and receive micropayments instantly.
              </p>

              {/* Network diagram */}
              <div className="relative mx-auto h-64 w-full max-w-md">
                {/* Center agent icon */}
                <div
                  className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "#FF5800",
                    boxShadow: "0 0 30px #FF580080",
                  }}
                >
                  <div className="h-12 w-12 rounded-sm bg-black/80" />
                </div>

                {/* Blockchain icons positioned around center */}
                <div
                  className="absolute left-[15%] top-[20%] h-12 w-12 rounded-full"
                  style={{
                    backgroundColor: "#3b82f6",
                    boxShadow: "0 0 20px #3b82f680",
                  }}
                />
                <div
                  className="absolute right-[15%] top-[25%] h-12 w-12 rounded-full"
                  style={{
                    backgroundColor: "#06b6d4",
                    boxShadow: "0 0 20px #06b6d480",
                  }}
                />
                <div
                  className="absolute left-[10%] bottom-[30%] h-10 w-10 rounded-full"
                  style={{
                    backgroundColor: "#8b5cf6",
                    boxShadow: "0 0 20px #8b5cf680",
                  }}
                />
                <div
                  className="absolute right-[10%] bottom-[35%] h-10 w-10 rounded-full"
                  style={{
                    backgroundColor: "#10b981",
                    boxShadow: "0 0 20px #10b98180",
                  }}
                />

                {/* Small agent avatars */}
                <div
                  className="absolute bottom-[15%] left-[25%] h-8 w-8 rounded-sm"
                  style={{
                    backgroundColor: "#FF580080",
                    boxShadow: "0 0 15px #FF580060",
                  }}
                />
                <div
                  className="absolute bottom-[20%] right-[20%] h-8 w-8 rounded-sm"
                  style={{
                    backgroundColor: "#FF580080",
                    boxShadow: "0 0 15px #FF580060",
                  }}
                />

                {/* Connection dots */}
                <div
                  className="absolute left-[30%] top-[35%] h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <div
                  className="absolute right-[25%] top-[40%] h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <div
                  className="absolute bottom-[40%] left-[35%] h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <div
                  className="absolute bottom-[45%] right-[30%] h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <div
                  className="absolute right-[35%] top-[15%] h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
              </div>
            </div>
          </div>
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

