/**
 * Getting started component displaying onboarding steps for new users.
 * Shows progress through creating agents, setting up API keys, and starting chats.
 * Tracks completion state and provides navigation to each step.
 *
 * @param props - Getting started configuration
 * @param props.hasAgents - Whether user has created agents
 * @param props.hasApiKey - Whether user has created API keys
 * @param props.hasChatHistory - Whether user has chat history
 * @param props.className - Additional CSS classes
 */

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
      title: "Create",
      description: "Build an agent",
      tooltip: "Customize personality and knowledge",
      icon: <Bot className="h-5 w-5" />,
      href: "/dashboard/build",
      buttonText: "Create",
      completed: hasAgents,
    },
    {
      id: "connect-model",
      title: "Add Key",
      description: "Connect LLM",
      tooltip: "Required for agent inference",
      icon: <Plug className="h-5 w-5" />,
      href: "/dashboard/api-keys",
      buttonText: "Add",
      completed: hasApiKey,
    },
    {
      id: "test-agent",
      title: "Test",
      description: "Chat with agent",
      tooltip: "Verify before deploying",
      icon: <MessageSquare className="h-5 w-5" />,
      href: "/dashboard/chat",
      buttonText: "Chat",
      completed: hasChatHistory,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allCompleted = completedCount === steps.length;

  if (allCompleted) {
    return null;
  }

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Get Started</h2>
          <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
            {completedCount}/{steps.length}
          </span>
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
        "relative transition-all duration-200",
        step.completed
          ? "border-green-500/20 bg-green-500/5"
          : "hover:border-[#FF5800]/40",
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "inline-flex p-2 rounded-sm border",
              step.completed
                ? "bg-green-500/20 border-green-500/30 text-green-400"
                : "bg-[#FF5800]/10 border-[#FF5800]/20 text-[#FF5800]",
            )}
          >
            {step.completed ? <Check className="h-5 w-5" /> : step.icon}
          </div>
          <span className="text-[10px] text-white/30 font-mono">
            {stepNumber.toString().padStart(2, "0")}
          </span>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3
              className={cn(
                "text-sm font-medium",
                step.completed ? "text-white/50" : "text-white",
              )}
            >
              {step.title}
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-white/20 hover:text-white/50 transition-colors"
                >
                  <HelpCircle className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[180px] text-xs bg-zinc-900 text-white/80 border border-white/10"
              >
                {step.tooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-white/40">{step.description}</p>
        </div>

        {!step.completed && (
          <BrandButton asChild size="sm" className="w-full h-8 text-xs">
            <Link href={step.href}>
              {step.buttonText}
              <ArrowRight className="ml-1.5 h-3 w-3" />
            </Link>
          </BrandButton>
        )}

        {step.completed && (
          <div className="flex items-center gap-1.5 text-xs text-green-400/80">
            <Check className="h-3.5 w-3.5" />
            <span>Done</span>
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
