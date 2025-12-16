/**
 * Top hero section component for the landing page.
 * Displays CLI commands for creating and deploying agents with OS-specific tabs.
 * Includes copy-to-clipboard functionality and call-to-action buttons.
 */

"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Rocket, Code2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUDContainer, BrandButton } from "@/components/brand";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const TopHero = () => {
  const [activeOS, setActiveOS] = useState<"unix" | "windows">("unix");
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();

  const commands = {
    unix: {
      create: "npx elizaos create my-agent",
      deploy: "npx elizaos deploy",
    },
    windows: {
      create: "npx elizaos create my-agent",
      deploy: "npx elizaos deploy",
    },
  };

  const handleCopy = async (command: string, key: string) => {
    await navigator.clipboard.writeText(command);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleGetStarted = () => {
    router.push("/login?intent=signup");
  };

  const steps = [
    {
      icon: <Terminal className="h-5 w-5" />,
      title: "Create",
    },
    {
      icon: <Code2 className="h-5 w-5" />,
      title: "Develop",
    },
    {
      icon: <Rocket className="h-5 w-5" />,
      title: "Deploy",
    },
  ];

  return (
    <section
      className="w-full py-16 md:py-24 lg:py-32 relative overflow-hidden"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      {/* Background gradient + grid */}
      <div className="hero-background">
        <div className="hero-gradient" />
        <div className="hero-grid" />
      </div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="mx-auto max-w-5xl text-center">
          {/* Headline */}
          <motion.h1
            className="mb-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal tracking-tight relative z-10"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 1,
              ease: [0.25, 0.1, 0.25, 1],
              delay: 0.2,
            }}
          >
            <span className="inline-flex items-center justify-center gap-3 md:gap-4">
              <span>
                Ship <span className="font-bold">agents</span>,
              </span>
            </span>
            <span className="text-white/60"> not infrastructure</span>
          </motion.h1>

          {/* Subhead */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 1,
              ease: [0.25, 0.1, 0.25, 1],
              delay: 0.2,
            }}
            className="mb-10 md:mb-12 text-base sm:text-lg md:text-xl lg:text-2xl text-white/70 mx-auto relative z-10 px-4 max-w-4xl"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}
          >
            Create and deploy AI agents in one command. Open source. Zero
            lock-in.
          </motion.p>

          {/* Terminal Display */}
          <div className="relative mx-auto max-w-3xl mb-10 md:mb-12">
            <HUDContainer>
              {/* Terminal Content */}
              <div className="p-4 md:p-6 space-y-4 font-mono text-left">
                {/* Create command */}
                <div className="group">
                  <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
                    <span># create</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-white/5 rounded px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                      <span style={{ color: "#FF5800" }}>▸</span>
                      <code className="text-sm sm:text-base text-white whitespace-nowrap">
                        {commands[activeOS].create}
                      </code>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(commands[activeOS].create, "create")
                      }
                      className="shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
                      aria-label="Copy command"
                    >
                      {copied === "create" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Deploy command */}
                <div className="group">
                  <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
                    <span># deploy</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-white/5 rounded px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                      <span style={{ color: "#FF5800" }}>▸</span>
                      <code className="text-sm sm:text-base text-white whitespace-nowrap">
                        {commands[activeOS].deploy}
                      </code>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(commands[activeOS].deploy, "deploy")
                      }
                      className="shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
                      aria-label="Copy command"
                    >
                      {copied === "deploy" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </HUDContainer>
          </div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 1,
              ease: [0.25, 0.1, 0.25, 1],
              delay: 0.2,
            }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 md:mb-20"
          >
            <BrandButton
              variant="primary"
              size="lg"
              onClick={handleGetStarted}
              className="min-w-[180px]"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </BrandButton>
            <Button
              variant="outline"
              size="lg"
              className="min-w-[180px] border-white/20 text-white hover:bg-white/5 hover:text-white"
              asChild
            >
              <a
                href="https://elizaos.ai/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                Docs
              </a>
            </Button>
          </motion.div>

          {/* Journey Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={step.title} className="relative group">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-px bg-gradient-to-r from-white/20 to-transparent" />
                )}

                <div className="flex flex-col items-center text-center p-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 transition-colors"
                    style={{
                      backgroundColor: "rgba(255, 88, 0, 0.1)",
                      border: "1px solid rgba(255, 88, 0, 0.3)",
                    }}
                  >
                    <div style={{ color: "#FF5800" }}>{step.icon}</div>
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TopHero;
