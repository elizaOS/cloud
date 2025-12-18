/**
 * Top hero section component for the landing page.
 * Displays CLI commands for creating and deploying agents with OS-specific tabs.
 * Includes copy-to-clipboard functionality and call-to-action buttons.
 */

"use client";

import { useState } from "react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Image as ImageIcon,
  Video,
  Sparkles,
  ArrowUp,
  ArrowRight,
  Terminal,
} from "lucide-react";
import {
  TAB_CONFIG,
  JOURNEY_STEPS,
  ALL_TABS,
  type TabValue,
} from "@/lib/config/landing-hero";

const TAB_TRIGGER_CLASS =
  "inline-flex items-center gap-1 md:gap-2 rounded-none px-3 md:px-6 py-3 text-xs md:text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-[#FF5800] [&[data-state=active]]:bg-[#252527] whitespace-nowrap";

export default function TopHero() {
  const { authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>("agent");
  const [inputValue, setInputValue] = useState("");

  const config = TAB_CONFIG[activeTab];

  const handleSubmit = () => {
    if (!ready) return;
    const promptParam = inputValue
      ? `?prompt=${encodeURIComponent(inputValue)}`
      : "";
    if (authenticated) {
      router.push(`${config.destination}${promptParam}`);
    } else {
      sessionStorage.setItem(
        "pendingPrompt",
        JSON.stringify({ tab: activeTab, prompt: inputValue }),
      );
      login();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <section className="w-full py-16 md:py-24 lg:py-32 relative overflow-hidden bg-[#0A0A0A]">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FF5800]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="mx-auto max-w-5xl text-center">
          {/* Headline */}
          <h1 className="mb-4 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight drop-shadow-lg">
            <span className="inline-flex items-center justify-center gap-3">
              <span className="inline-block w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-[#FF5800] flex-shrink-0" />
              <span className="text-white">
                What do you want to <span className="font-bold">build</span>?
              </span>
            </span>
          </h1>

          {/* Journey Steps */}
          <div className="flex items-center justify-center gap-2 md:gap-4 mb-10">
            {JOURNEY_STEPS.map((step, index) => (
              <div
                key={step.label}
                className="flex items-center gap-2 md:gap-4"
              >
                <div className="flex items-center gap-1.5 md:gap-2">
                  <div
                    className="p-1.5 md:p-2 rounded-md"
                    style={{
                      backgroundColor: `${step.color}20`,
                      border: `1px solid ${step.color}40`,
                    }}
                  >
                    <step.icon
                      className="h-4 w-4"
                      style={{ color: step.color }}
                    />
                  </div>
                  <span className="text-xs md:text-sm text-white/70 font-medium hidden sm:inline">
                    {step.label}
                  </span>
                </div>
                {index < JOURNEY_STEPS.length - 1 && (
                  <ArrowRight className="h-3 w-3 md:h-4 md:w-4 text-white/20" />
                )}
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabValue)}
            className="relative z-10"
          >
            <TabsList className="inline-flex h-12 items-center justify-center rounded-none bg-black/50 border border-white/10 p-0 backdrop-blur-sm">
              <TabsTrigger value="agent" className={TAB_TRIGGER_CLASS}>
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">Agent</span>
              </TabsTrigger>
              <TabsTrigger value="app" className={TAB_TRIGGER_CLASS}>
                <Terminal className="h-4 w-4" />
                <span className="hidden sm:inline">App</span>
              </TabsTrigger>
              <TabsTrigger value="image" className={TAB_TRIGGER_CLASS}>
                <ImageIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Image</span>
              </TabsTrigger>
              <TabsTrigger value="video" className={TAB_TRIGGER_CLASS}>
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">Video</span>
              </TabsTrigger>
              <TabsTrigger
                value="pro-studio"
                disabled
                className={`${TAB_TRIGGER_CLASS} disabled:opacity-60`}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline bg-gradient-to-r from-[#EC594F] to-[#7E6BF0] bg-clip-text text-transparent">
                  Pro
                </span>
                <Badge
                  variant="outline"
                  className="ml-1 text-[9px] border-white/20 px-1"
                >
                  Soon
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Tab Content - Shared input structure */}
            {ALL_TABS.map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-8">
                <div className="relative mx-auto max-w-4xl">
                  {/* HUD-style input container */}
                  <div className="relative bg-black/40 border border-white/20 backdrop-blur-sm">
                    {/* Corner decorations */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#FF5800]" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#FF5800]" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#FF5800]" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#FF5800]" />

                    <Textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={TAB_CONFIG[tab].placeholder}
                      className="min-h-[120px] md:min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-20 w-full text-base"
                    />

                    <div className="absolute bottom-4 right-4">
                      <Button
                        onClick={handleSubmit}
                        size="icon"
                        className="h-10 w-10 rounded-none border-0 bg-[#FF5800] hover:brightness-125 active:brightness-150 transition-all"
                      >
                        <ArrowUp className="h-5 w-5 text-white" />
                      </Button>
                    </div>
                  </div>

                  {/* Prompt examples */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-0">
                    {TAB_CONFIG[tab].prompts.map((prompt, index) => (
                      <button
                        key={index}
                        onClick={() => setInputValue(prompt)}
                        className="group relative bg-black/30 border border-white/10 p-4 md:p-5 text-left hover:border-[#FF5800]/50 hover:bg-black/50 transition-all"
                      >
                        <p className="text-sm text-white/60 group-hover:text-white/90 pr-8 leading-relaxed">
                          {prompt}
                        </p>
                        <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/30 group-hover:text-[#FF5800] transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              </TabsContent>
            ))}

            <TabsContent value="pro-studio" className="mt-8">
              <div className="text-center py-12">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <span className="text-white/60 text-sm">
                    Professional studio features coming soon
                  </span>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Bottom CTA */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() =>
                authenticated ? router.push("/dashboard") : login()
              }
              size="lg"
              className="min-w-[180px] bg-[#FF5800] hover:bg-[#FF5800]/90 text-white rounded-none"
            >
              {authenticated ? "Go to Dashboard" : "Get Started Free"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="min-w-[180px] h-12 border-white/20 text-white hover:bg-white/5 hover:text-white rounded-none"
              asChild
            >
              <a
                href="https://elizaos.ai/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                Documentation
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
