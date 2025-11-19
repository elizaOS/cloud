"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/brand";

export default function Installation() {
  const [activeTab, setActiveTab] = useState<"macos" | "windows">("macos");
  const [copied, setCopied] = useState(false);

  const command =
    activeTab === "macos" ? "bun i -g @elizaos/cli" : "bun i -g @elizaos/cli";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative overflow-hidden bg-[#0A0A0A]">
      {/* Diagonal stripe pattern background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 10px,
            rgba(255, 255, 255, 0.03) 10px,
            rgba(255, 255, 255, 0.03) 20px
          )`,
        }}
      />

      <div className="relative container mx-auto px-4 md:px-6 py-12 md:py-20 lg:py-32">
        {/* Top badge */}
        <div className="flex justify-center mb-8 md:mb-12">
          <SectionLabel>INSTALL IN SECONDS</SectionLabel>
        </div>

        {/* Hero heading */}
        <h2
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-center mb-8 md:mb-12 uppercase max-w-5xl mx-auto px-4"
          style={{
            fontFamily: "var(--font-geist-sans)",
            lineHeight: "1.3",
            color: "#FFFFFF",
          }}
        >
          FROM YOUR TERMINAL TO THE CLOUD — IN ONE LINE.
        </h2>

        {/* Terminal command section */}
        <div className="max-w-4xl mx-auto mb-4 px-4">
          {/* Tabs */}
          <div className="flex gap-0 mb-4">
            <button
              onClick={() => setActiveTab("macos")}
              className={`brand-tab text-xs sm:text-sm ${
                activeTab === "macos" ? "brand-tab-active" : ""
              }`}
            >
              MACOS / LINUX
            </button>
            <button
              onClick={() => setActiveTab("windows")}
              className={`brand-tab text-xs sm:text-sm ${
                activeTab === "windows" ? "brand-tab-active" : ""
              }`}
            >
              WINDOWS
            </button>
          </div>

          {/* Command display */}
          <div className="bg-white text-black p-4 md:p-6 flex items-center justify-between gap-2 md:gap-4 border border-white/10">
            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
              <span className="shrink-0" style={{ color: "#FF5800" }}>
                ▸
              </span>
              <code className="text-sm md:text-base truncate">{command}</code>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="shrink-0 hover:bg-gray-200 text-black h-8 w-8 md:h-10 md:w-10"
            >
              {copied ? (
                <Check className="w-4 h-4 md:w-5 md:h-5" />
              ) : (
                <Copy className="w-4 h-4 md:w-5 md:h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* View Docs link */}
        <div className="text-center mb-12 md:mb-16">
          <a
            href="#"
            className="text-white/70 hover:text-white transition-colors text-sm"
          >
            View Docs →
          </a>
        </div>

        {/* Bottom section with features and terminal */}
        <div className="border-t border-white/10 border-[1px] border-[#252527]">
          <div className="grid lg:grid-cols-2">
            {/* Left: Feature text */}
            <div
              className="py-12  bg-black w-full h-full flex items-center justify-center gap-4 md:gap-6 bg-center bg-no-repeat bg-contain"
              style={{
                backgroundImage: "url('/installation/object.png')",
              }}
            >
              <p
                className="font-normal text-center max-w-xs lg:max-w-md uppercase tracking-wide text-sm md:text-[16px] lg:text-[20px] xl:text-[22px]"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  lineHeight: "1.5",
                  letterSpacing: "-0.003em",
                  color: "#858585",
                }}
              >
                ELIZA CLOUD RUNS YOUR CONTAINERS <br /> ON HIGH-PERFORMANCE
                INFRASTRUCTURE WITH BUILT-IN LOGS AND METRICS.
              </p>
            </div>

            <div className="bg-[#161616BF] border border-[#252527]  rounded-none border-t-0 border-b-0 border-r-0 overflow-hidden">
              <div className="h-full p-8">
                <div className="border-[#252527] border-t-0 border-[1px]">
                  <div className="border-[1px] border-l-0 border-r-0 px-3 md:px-4 py-2 md:py-3 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#A2A2A2]" />
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#A2A2A2]" />
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#A2A2A2]" />
                  </div>

                  <div className="p-4 md:p-6 space-y-1.5 md:space-y-2 text-xs md:text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[#FF5800]">$</span>
                      <span className="text-white">elizaos deploy</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">Deploying...✓</span>
                    </div>
                    <div className="text-white">Running on Eliza Cloud</div>
                    <div className="text-blue-400 break-all">
                      → https://your-agent.containers.elizacloud.ai
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
