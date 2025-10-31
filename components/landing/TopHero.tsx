"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const TopHero = () => {
  const { authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();

  const handleAuth = () => {
    console.log("Auth button clicked:", { authenticated, ready });

    if (!ready) {
      console.log("Privy not ready yet");
      return;
    }

    if (authenticated) {
      router.push("/dashboard");
    } else {
      console.log("Calling Privy login...");
      login();
    }
  };

  return (
    <section
      className="w-full py-20 md:py-32"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mb-0 inline-flex items-center gap-2">
            <video
              src="/videos/eliza.mp4"
              autoPlay
              loop
              muted
              className="w-150 h-80 rounded-3xl opacity-90"
              style={{
                maskImage:
                  "linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
              }}
            />
          </div>

          <h1
            className="-mt-25 mb-6 text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-normal tracking-tight relative z-10"
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

          <Tabs defaultValue="agent" className="relative z-10">
            <TabsList className="inline-flex h-12 items-center justify-center rounded-none bg-black/50 border border-white/10 p-0 backdrop-blur-sm">
              <TabsTrigger
                value="agent"
                className="inline-flex items-center gap-1 md:gap-2 rounded-none px-3 md:px-6 py-3 text-xs md:text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-white [&[data-state=active]]:bg-[#252527] whitespace-nowrap"
              >
                <Bot className="h-4 w-4" />
                Agent
              </TabsTrigger>
              <TabsTrigger
                value="image"
                className="inline-flex items-center gap-1 md:gap-2 rounded-none px-3 md:px-6 py-3 text-xs md:text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-white [&[data-state=active]]:bg-[#252527] whitespace-nowrap"
              >
                <ImageIcon className="h-4 w-4" />
                Image
              </TabsTrigger>
              <TabsTrigger
                value="video"
                className="inline-flex items-center gap-1 md:gap-2 rounded-none px-3 md:px-6 py-3 text-xs md:text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-white [&[data-state=active]]:bg-[#252527] whitespace-nowrap"
              >
                <Video className="h-4 w-4" />
                Video
              </TabsTrigger>
              <TabsTrigger
                value="pro-studio"
                className="inline-flex items-center gap-1 md:gap-2 rounded-none px-3 md:px-6 py-3 text-xs md:text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-white [&[data-state=active]]:bg-[#252527] disabled:opacity-100 whitespace-nowrap"
                disabled
              >
                <Sparkles className="h-4 w-4" />
                <span
                  style={{
                    background:
                      "linear-gradient(90deg, #EC594F 0%, #7E6BF0 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Pro Studio
                </span>
                <Badge
                  variant="outline"
                  className="ml-1 text-[10px] md:text-xs border-white/20 px-1 md:px-2"
                >
                  <span className="hidden md:inline">Coming soon</span>
                  <span className="md:hidden">Soon</span>
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agent" className="mt-8">
              <div className="relative mx-auto max-w-5xl">
                {/* HUD-style container with corner decorations */}
                <div className="relative bg-black/40 border border-white/20">
                  {/* Top-left corner */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#E1E1E1]" />

                  {/* Top-right corner */}
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#E1E1E1]" />

                  {/* Bottom-left corner */}
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#E1E1E1]" />

                  {/* Bottom-right corner */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#E1E1E1]" />

                  {/* Text input area */}
                  <Textarea
                    placeholder="Talk to Eliza..."
                    className="min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-32 w-full"
                  />

                  {/* Icon buttons overlaid on bottom right inside box */}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none border border-white/20 bg-transparent hover:bg-white/10"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none border border-white/20 bg-transparent hover:bg-white/10"
                    >
                      <Mic className="h-5 w-5" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-10 w-10 rounded-none border-0 hover:brightness-125 active:brightness-150 transition-all"
                      style={{ backgroundColor: "#FF580040" }}
                    >
                      <ArrowUp
                        className="h-8 w-8"
                        style={{ color: "#FF5800" }}
                      />
                    </Button>
                  </div>
                </div>

                {/* Prompt example cards */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-0">
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Create an agent to manage my social media strategy and to
                      generate marketing assets.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Build a customer support agent that answers questions from
                      our knowledge base.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Design an AI assistant to help with email drafting and
                      meeting scheduling.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image" className="mt-8">
              <div className="relative mx-auto max-w-5xl">
                {/* HUD-style container with corner decorations */}
                <div className="relative bg-black/40 border border-white/20">
                  {/* Top-left corner */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#E1E1E1]" />

                  {/* Top-right corner */}
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#E1E1E1]" />

                  {/* Bottom-left corner */}
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#E1E1E1]" />

                  {/* Bottom-right corner */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#E1E1E1]" />

                  {/* Text input area */}
                  <Textarea
                    placeholder="Describe the image you want to generate..."
                    className="min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-32 w-full"
                  />

                  {/* Icon buttons overlaid on bottom right inside box */}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none border border-white/20 bg-transparent hover:bg-white/10"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none border border-white/20 bg-transparent hover:bg-white/10"
                    >
                      <Mic className="h-5 w-5" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-10 w-10 rounded-none border-0 hover:brightness-125 active:brightness-150 transition-all"
                      style={{ backgroundColor: "#FF580040" }}
                    >
                      <ArrowUp
                        className="h-8 w-8"
                        style={{ color: "#FF5800" }}
                      />
                    </Button>
                  </div>
                </div>

                {/* Prompt example cards */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-0">
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Generate a photorealistic image of a futuristic city at
                      sunset.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Create an artistic portrait with vibrant colors and
                      abstract elements.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Design a modern logo for a tech startup with clean lines.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="video" className="mt-8">
              <div className="relative mx-auto max-w-5xl">
                {/* HUD-style container with corner decorations */}
                <div className="relative bg-black/40 border border-white/20">
                  {/* Top-left corner */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#E1E1E1]" />

                  {/* Top-right corner */}
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#E1E1E1]" />

                  {/* Bottom-left corner */}
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#E1E1E1]" />

                  {/* Bottom-right corner */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#E1E1E1]" />

                  {/* Text input area */}
                  <Textarea
                    placeholder="Describe the video you want to create..."
                    className="min-h-[150px] bg-transparent border-0 resize-none focus-visible:ring-0 text-white placeholder:text-white/40 p-4 pr-32 w-full"
                  />

                  {/* Icon buttons overlaid on bottom right inside box */}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none border border-white/20 bg-transparent hover:bg-white/10"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none border border-white/20 bg-transparent hover:bg-white/10"
                    >
                      <Mic className="h-5 w-5" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-10 w-10 rounded-none border-0 hover:brightness-125 active:brightness-150 transition-all"
                      style={{ backgroundColor: "#FF580040" }}
                    >
                      <ArrowUp
                        className="h-8 w-8"
                        style={{ color: "#FF5800" }}
                      />
                    </Button>
                  </div>
                </div>

                {/* Prompt example cards */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-0">
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Create a short promotional video for a new product launch.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Generate an animated explainer video for my SaaS platform.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                  <button className="group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all">
                    <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
                      Edit my raw footage into a professional social media reel.
                    </p>
                    <ArrowUp className="absolute bottom-4 right-4 h-4 w-4 text-white/40 group-hover:text-white/70" />
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="pro-studio" className="mt-8">
              <div className="text-center text-muted-foreground">
                <p>Professional studio features coming soon</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
};

export default TopHero;
