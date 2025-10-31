"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Installation() {
  const [activeTab, setActiveTab] = useState<"macos" | "windows">("macos");
  const [copied, setCopied] = useState(false);

  const command =
    activeTab === "macos"
      ? "curl -fsSL https://app.eliza.ai/cli | sh"
      : "iwr https://app.eliza.ai/cli/install.ps1 | iex";

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

      <div className="relative container mx-auto px-6 py-20 md:py-32">
        {/* Top badge */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: "#FF5800" }}
          />
          <span className="text-lg md:text-xl uppercase tracking-wider text-white font-medium">
            INSTALL IN SECONDS
          </span>
        </div>

        {/* Hero heading */}
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-12 text-white max-w-5xl mx-auto">
          FROM YOUR TERMINAL TO THE CLOUD — IN ONE LINE.
        </h2>

        {/* Terminal command section */}
        <div className="max-w-4xl mx-auto mb-4">
          {/* Tabs */}
          <div className="flex gap-0 mb-4">
            <button
              onClick={() => setActiveTab("macos")}
              className={`px-6 py-3 text-sm font-medium transition-all border border-white/10 rounded-none ${
                activeTab === "macos"
                  ? "bg-[#252527] text-white"
                  : "bg-transparent text-white/70 hover:bg-white/5"
              }`}
            >
              MACOS / LINUX
            </button>
            <button
              onClick={() => setActiveTab("windows")}
              className={`px-6 py-3 text-sm font-medium transition-all border border-white/10 rounded-none ${
                activeTab === "windows"
                  ? "bg-[#252527] text-white"
                  : "bg-transparent text-white/70 hover:bg-white/5"
              }`}
            >
              WINDOWS
            </button>
          </div>

          {/* Command display */}
          <div className="bg-white text-black p-6 flex items-center justify-between gap-4 border border-white/10">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="shrink-0" style={{ color: "#FF5800" }}>▸</span>
              <code className="text-base truncate">{command}</code>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="shrink-0 hover:bg-gray-200 text-black"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* View Docs link */}
        <div className="text-center mb-16">
          <a
            href="#"
            className="text-white/70 hover:text-white transition-colors text-sm"
          >
            View Docs →
          </a>
        </div>

        {/* Bottom section with features and terminal */}
        <div className="border-t border-white/10 pt-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            {/* Left: Feature text */}
            <div className="flex items-center gap-6">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: "#FF5800" }}
              />
              <p className="text-lg md:text-xl text-white/70 leading-relaxed uppercase tracking-wide">
                ELIZA CLOUD RUNS YOUR CONTAINERS ON HIGH-PERFORMANCE INFRASTRUCTURE
                WITH BUILT-IN LOGS AND METRICS.
              </p>
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: "#FF5800" }}
              />
            </div>

            {/* Right: Terminal mockup */}
            <div className="bg-black border border-white/20 rounded-sm overflow-hidden">
              {/* Terminal header */}
              <div className="bg-black/60 border-b border-white/10 px-4 py-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>

              {/* Terminal content */}
              <div className="p-6 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-500">$</span>
                  <span className="text-white">npx eliza deploy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">Deploying... ✓</span>
                </div>
                <div className="text-white/70">Running on Eliza Cloud</div>
                <div className="text-blue-400">→ https://your-agent.eliza.cloud</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

