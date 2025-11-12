"use client";

import { useState } from "react";
import {
  Bot,
  Image as ImageIcon,
  Video,
  Sparkles,
  ArrowUp,
  Paperclip,
  Mic,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  BrandTabsResponsive,
  BrandTabsContent,
  HUDContainer,
  BrandButton,
  PromptCardGrid,
} from "@/components/brand";
import type { TabItem } from "@/components/brand";
import { useChatStore } from "@/stores/chat-store";
import { useRouter } from "next/navigation";

const TopHero = () => {
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState("agent");
  const setPendingMessage = useChatStore((state) => state.setPendingMessage);
  const router = useRouter();

  const heroTabs: TabItem[] = [
    { value: "agent", label: "Agent", icon: <Bot className="h-4 w-4" /> },
    { value: "image", label: "Image", icon: <ImageIcon className="h-4 w-4" /> },
    { value: "video", label: "Video", icon: <Video className="h-4 w-4" /> },
    {
      value: "pro-studio",
      label: "Pro Studio",
      icon: <Sparkles className="h-4 w-4" />,
      disabled: true,
    },
  ];

  const handleFreeChatSubmit = () => {
    if (!chatInput.trim()) return;

    // Store the message in Zustand for auto-sending in chat
    setPendingMessage(chatInput.trim());

    // Redirect to Eliza chat (anonymous users will be created automatically)
    router.push("/dashboard/chat");
  };

  const handleChatKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleFreeChatSubmit();
    }
  };

  return (
    <section
      className="w-full py-12 md:py-20 lg:py-32 relative overflow-hidden"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      {/* Fullscreen background video */}
      <video
        src="/videos/hero-vid.webm"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        style={{
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="mx-auto max-w-6xl text-center">
          <h1
            className="mb-6 text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-normal tracking-tight relative z-10"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
          >
            <span className="inline-flex items-center justify-center gap-2 sm:gap-3 md:gap-4">
              <span
                className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#FF5800" }}
              />
              <span>
                Build <span className="font-bold">AI agents</span> in seconds
              </span>
            </span>
          </h1>

          <p
            className="mb-8 text-sm sm:text-base md:text-base lg:text-lg xl:text-xl text-muted-foreground mx-auto relative z-10 px-4"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}
          >
            ElizaOS Cloud is your complete AI development platform.
          </p>

          <BrandTabsResponsive
            id="hero-tabs"
            tabs={heroTabs}
            value={activeTab}
            onValueChange={setActiveTab}
            className="relative z-10"
          >
            <BrandTabsContent value="agent">
              <div className="relative mx-auto max-w-5xl">
                {/* HUD-style container with corner decorations */}
                <HUDContainer>
                  {/* Text input area */}
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyPress}
                    placeholder="Try asking: How do I build an AI agent? (No signup required)"
                    className="min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-32 w-full"
                  />

                  {/* Icon buttons overlaid on bottom right inside box */}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <BrandButton
                      variant="icon"
                      disabled
                      className="opacity-50 cursor-not-allowed"
                    >
                      <Paperclip className="h-5 w-5" />
                    </BrandButton>
                    <BrandButton
                      variant="icon"
                      disabled
                      className="opacity-50 cursor-not-allowed"
                    >
                      <Mic className="h-5 w-5" />
                    </BrandButton>
                    <BrandButton
                      variant="icon-primary"
                      onClick={handleFreeChatSubmit}
                      disabled={!chatInput.trim()}
                    >
                      <ArrowUp
                        className="h-8 w-8"
                        style={{ color: "#FF5800" }}
                      />
                    </BrandButton>
                  </div>
                </HUDContainer>

                {/* Prompt example cards */}
                <PromptCardGrid
                  prompts={[
                    "Create an agent to manage my social media strategy and to generate marketing assets.",
                    "Build a customer support agent that answers questions from our knowledge base.",
                    "Design an AI assistant to help with email drafting and meeting scheduling.",
                  ]}
                />
              </div>
            </BrandTabsContent>

            <BrandTabsContent value="image">
              <div className="relative mx-auto max-w-5xl">
                {/* HUD-style container with corner decorations */}
                <HUDContainer>
                  {/* Text input area */}
                  <Textarea
                    placeholder="Describe the image you want to generate..."
                    className="min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-32 w-full"
                  />

                  {/* Icon buttons overlaid on bottom right inside box */}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <BrandButton variant="icon">
                      <Paperclip className="h-5 w-5" />
                    </BrandButton>
                    <BrandButton variant="icon">
                      <Mic className="h-5 w-5" />
                    </BrandButton>
                    <BrandButton variant="icon-primary">
                      <ArrowUp
                        className="h-8 w-8"
                        style={{ color: "#FF5800" }}
                      />
                    </BrandButton>
                  </div>
                </HUDContainer>

                {/* Prompt example cards */}
                <PromptCardGrid
                  prompts={[
                    "Generate a photorealistic image of a futuristic city at sunset.",
                    "Create an artistic portrait with vibrant colors and abstract elements.",
                    "Design a modern logo for a tech startup with clean lines.",
                  ]}
                />
              </div>
            </BrandTabsContent>

            <BrandTabsContent value="video">
              <div className="relative mx-auto max-w-5xl">
                {/* HUD-style container with corner decorations */}
                <HUDContainer>
                  {/* Text input area */}
                  <Textarea
                    placeholder="Describe the video you want to create..."
                    className="min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-32 w-full"
                  />

                  {/* Icon buttons overlaid on bottom right inside box */}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <BrandButton variant="icon">
                      <Paperclip className="h-5 w-5" />
                    </BrandButton>
                    <BrandButton variant="icon">
                      <Mic className="h-5 w-5" />
                    </BrandButton>
                    <BrandButton variant="icon-primary">
                      <ArrowUp
                        className="h-8 w-8"
                        style={{ color: "#FF5800" }}
                      />
                    </BrandButton>
                  </div>
                </HUDContainer>

                {/* Prompt example cards */}
                <PromptCardGrid
                  prompts={[
                    "Create a short promotional video for a new product launch.",
                    "Generate an animated explainer video for my SaaS platform.",
                    "Edit my raw footage into a professional social media reel.",
                  ]}
                />
              </div>
            </BrandTabsContent>

            <BrandTabsContent value="pro-studio">
              <div className="text-center text-muted-foreground">
                <p>Professional studio features coming soon</p>
              </div>
            </BrandTabsContent>
          </BrandTabsResponsive>
        </div>
      </div>
    </section>
  );
};

export default TopHero;
