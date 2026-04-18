"use client";

import { Button } from "@elizaos/cloud-ui";
import { ArrowRight, Cloud, Code, Database, Server } from "lucide-react";
import { useRouter } from "next/navigation";

export default function HeroSection() {
  const router = useRouter();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 z-40">
      {/* Hero Heading */}
      <div className="text-center mb-12 sm:mb-16">
        <h1
          className="text-4xl sm:text-6xl md:text-7xl font-bold text-white leading-tight max-w-4xl mx-auto tracking-tight"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Everything you need to build autonomous agents
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-white/70 mt-6 max-w-2xl mx-auto font-light leading-relaxed">
          The ultimate platform offering cloud services, APIs, hosting, and LLMs to power your next
          generation applications.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Button
            size="lg"
            onClick={() => router.push("/login?intent=signup")}
            className="bg-[#FF5800] text-white hover:bg-[#e54e00] font-[family-name:var(--font-inter)] px-8 py-6 rounded-full text-base sm:text-lg shadow-lg shadow-[#FF5800]/20 flex items-center gap-2 transition-transform hover:scale-105"
          >
            Get Started
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.push("/docs")}
            className="bg-white/5 border-white/10 text-white hover:bg-white/10 font-[family-name:var(--font-inter)] px-8 py-6 rounded-full text-base sm:text-lg backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10"
          >
            Read Docs
          </Button>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mt-16 sm:mt-24">
        {[
          {
            icon: Cloud,
            label: "Cloud Services",
            desc: "Scalable infrastructure",
          },
          { icon: Code, label: "Powerful APIs", desc: "Build without limits" },
          { icon: Server, label: "Secure Hosting", desc: "Enterprise grade" },
          {
            icon: Database,
            label: "Advanced LLMs",
            desc: "State of the art models",
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-col items-center text-center transition-all hover:bg-neutral-800/60 hover:border-white/10"
          >
            <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-white/80">
              <feature.icon className="h-6 w-6 text-[#FF5800]" />
            </div>
            <h3 className="text-white font-medium mb-1">{feature.label}</h3>
            <p className="text-white/50 text-sm">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
