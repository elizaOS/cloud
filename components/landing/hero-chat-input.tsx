/**
 * Hero chat input component for the landing page.
 * Displays a textarea with animated typing placeholder.
 */

"use client";

import { useState } from "react";
import {
  ArrowUp,
  Plus,
  FileText,
  ImageIcon,
  Globe,
  Sparkles,
  Zap,
  MessageSquare,
  Bot,
  Rocket,
  Lightbulb,
} from "lucide-react";
import { useTypingPlaceholder } from "@/lib/hooks/use-typing-placeholder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface HeroChatInputProps {
  onSubmit?: () => void;
}

const appQuickPrompts = [
  {
    label: "Task Manager",
    prompt: "Build a task manager app",
    icon: Zap,
  },
  {
    label: "AI Chatbot",
    prompt: "Create a customer support chatbot",
    icon: MessageSquare,
  },
  {
    label: "Marketplace",
    prompt: "Build a marketplace for digital products",
    icon: Rocket,
  },
];

const agentQuickPrompts = [
  {
    label: "Creative Writer",
    prompt: "Create a writing assistant for stories",
    icon: Sparkles,
  },
  {
    label: "Code Assistant",
    prompt: "Build a coding helper that explains code",
    icon: Bot,
  },
  {
    label: "Research Helper",
    prompt: "Create an assistant that summarizes articles",
    icon: Lightbulb,
  },
];

const STORAGE_KEY = "hero-chat-input";

export default function HeroChatInput({ onSubmit }: HeroChatInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [mode, setMode] = useState<"agent" | "app">("app");

  const quickPrompts = mode === "app" ? appQuickPrompts : agentQuickPrompts;

  const handleSubmit = () => {
    if (!prompt.trim() || !onSubmit) return;
    // Save to localStorage before navigating to signup
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompt, mode }));
    onSubmit();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const placeholderSentences = [
    "How do I build an AI agent?",
    "What models does Eliza support?",
    "How do I deploy my agent?",
  ];

  const typingPlaceholder = useTypingPlaceholder(placeholderSentences);

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      {/* Hero Heading */}
      <div className="text-center mb-8">
        <h1
          className="text-3xl sm:text-5xl md:text-6xl font-bold text-white leading-tight whitespace-nowrap"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Make it agentic
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-white/70 mt-2">
          Build apps and agents with AI
        </p>
      </div>

      <div className="bg-neutral-900/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder=""
            className="w-full h-28 sm:h-24 px-4 sm:px-5 py-3 sm:py-4 text-white text-base sm:text-lg bg-transparent resize-none focus:outline-none rounded-xl sm:rounded-2xl relative z-10"
            rows={3}
          />
          {/* Animated placeholder - hidden when focused or has content */}
          {!prompt && !isFocused && (
            <div className="absolute top-3 sm:top-4 left-4 sm:left-5 text-base sm:text-lg text-neutral-200 pointer-events-none flex items-center">
              <span>{typingPlaceholder}</span>
              <span className="inline-block w-[2px] h-[1.2em] bg-neutral-400 ml-[1px] animate-blink" />
            </div>
          )}
        </div>
        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 sm:px-4 pb-2 sm:pb-4">
          {/* Left side - Plus menu and App/Agent switch */}
          <div className="flex items-center gap-2">
            {/* Plus Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                >
                  <Plus className="h-4 w-4 text-neutral-400 hover:text-white" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-xl border-white/10 bg-neutral-800/60 backdrop-blur-md p-1.5"
                align="start"
                side="top"
                sideOffset={8}
              >
                <DropdownMenuItem
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[highlighted]:bg-white/5 focus:bg-white/5"
                  onSelect={() => onSubmit?.()}
                >
                  <FileText className="h-4 w-4 text-white/50" />
                  <span className="text-sm">Upload files</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[highlighted]:bg-white/5 focus:bg-white/5"
                  onSelect={() => onSubmit?.()}
                >
                  <ImageIcon className="h-4 w-4 text-white/50" />
                  <span className="text-sm">Create image</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[highlighted]:bg-white/5 focus:bg-white/5"
                  onSelect={() => onSubmit?.()}
                >
                  <Globe className="h-4 w-4 text-white/50" />
                  <span className="text-sm">Web search</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Agent/App Switch */}
            <div className="flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("app")}
                className={`px-2 py-1 transition-all ${
                  mode === "app"
                    ? "text-white"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                App
              </button>
              <span className="text-white/20">|</span>
              <button
                type="button"
                onClick={() => setMode("agent")}
                className={`px-2 py-1 transition-all ${
                  mode === "agent"
                    ? "text-white"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                Agent
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className="size-8 rounded-lg bg-[#FF5800] hover:bg-[#e54e00] disabled:bg-white/10 transition-all flex items-center justify-center group"
            aria-label="Submit"
          >
            <ArrowUp className="size-4 text-white group-disabled:text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Quick Prompt Tabs */}
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        {quickPrompts.map((item) => (
          <button
            key={item.label}
            onClick={() => setPrompt(item.prompt)}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 hover:border-white/40 transition-all text-xs sm:text-sm text-white/70 hover:text-white"
          >
            <item.icon className="w-3.5 h-3.5" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
