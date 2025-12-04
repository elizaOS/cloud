"use client";

import * as React from "react";
import { BrandCard, BrandButton } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Bot,
  Plug,
  MessageSquare,
  Check,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  tooltip: string;
  icon: React.ReactNode;
  href: string;
  buttonText: string;
  completed: boolean;
}

interface GettingStartedProps {
  hasAgents: boolean;
  hasApiKey?: boolean;
  hasChatHistory?: boolean;
  className?: string;
}

export function GettingStarted({
  hasAgents,
  hasApiKey = false,
  hasChatHistory = false,
  className,
}: GettingStartedProps) {
  const steps: OnboardingStep[] = [
    {
      id: "create-agent",
      title: "Create your first agent",
      description: "Build an AI agent with a unique personality",
      tooltip: "Agents are AI characters you can customize with unique personalities, knowledge, and capabilities.",
      icon: <Bot className="h-6 w-6" />,
      href: "/dashboard/character-creator",
      buttonText: "Create Agent",
      completed: hasAgents,
    },
    {
      id: "connect-model",
      title: "Connect a model",
      description: "Add your API key to power your agent",
      tooltip: "API keys let your agents access AI models. Create or use your default key to get started.",
      icon: <Plug className="h-6 w-6" />,
      href: "/dashboard/api-keys",
      buttonText: "Add API Key",
      completed: hasApiKey,
    },
    {
      id: "test-agent",
      title: "Test your agent",
      description: "Start a conversation with your agent",
      tooltip: "Chat with your agent to test its personality and responses before deploying.",
      icon: <MessageSquare className="h-6 w-6" />,
      href: "/dashboard/chat",
      buttonText: "Start Chat",
      completed: hasChatHistory,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allCompleted = completedCount === steps.length;

  if (allCompleted) {
    return null;
  }

  return (
    <section className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Getting Started</h2>
          <p className="text-white/50 mt-1 text-sm">
            Build, test, and deploy AI agents — all in one place.
          </p>
          <p className="text-white/40 text-xs mt-2">
            {completedCount}/{steps.length} completed
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <StepCard key={step.id} step={step} stepNumber={index + 1} />
        ))}
      </div>
    </section>
  );
}

function StepCard({
  step,
  stepNumber,
}: {
  step: OnboardingStep;
  stepNumber: number;
}) {
  return (
    <BrandCard
      corners={true}
      cornerSize="sm"
      className={cn(
        "relative transition-all duration-300",
        step.completed
          ? "border-green-500/30 bg-green-500/5"
          : "hover:border-[#FF5800]/50"
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "inline-flex p-3 rounded-sm border",
              step.completed
                ? "bg-green-500/20 border-green-500/40 text-green-400"
                : "bg-[#FF5800]/10 border-[#FF5800]/30 text-[#FF5800]"
            )}
          >
            {step.completed ? <Check className="h-6 w-6" /> : step.icon}
          </div>
          <span className="text-xs text-white/40 font-mono">
            {stepNumber.toString().padStart(2, "0")}
          </span>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <h3
              className={cn(
                "font-semibold",
                step.completed ? "text-white/60" : "text-white"
              )}
            >
              {step.title}
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[200px] bg-zinc-900 text-white/90 border border-white/10"
              >
                {step.tooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-white/50">{step.description}</p>
        </div>

        {!step.completed && (
          <BrandButton asChild size="sm" className="w-full">
            <Link href={step.href}>
              {step.buttonText}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </BrandButton>
        )}

        {step.completed && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check className="h-4 w-4" />
            <span>Completed</span>
          </div>
        )}
      </div>
    </BrandCard>
  );
}

export function GettingStartedSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-white/10 animate-pulse rounded" />
          <div className="h-4 w-32 bg-white/10 animate-pulse rounded mt-2" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, index) => (
          <BrandCard key={index} corners={true} cornerSize="sm">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 bg-white/10 animate-pulse rounded" />
                <div className="h-4 w-6 bg-white/10 animate-pulse rounded" />
              </div>
              <div>
                <div className="h-5 w-32 bg-white/10 animate-pulse rounded mb-2" />
                <div className="h-4 w-full bg-white/10 animate-pulse rounded" />
              </div>
              <div className="h-9 w-full bg-white/10 animate-pulse rounded" />
            </div>
          </BrandCard>
        ))}
      </div>
    </section>
  );
}
