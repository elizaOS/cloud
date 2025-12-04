/**
 * Getting Started Component
 * CLI-focused onboarding flow for new users
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
  Terminal,
  LogIn,
  Rocket,
  Check,
  ArrowRight,
  HelpCircle,
  Copy,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface OnboardingStep {
  id: string;
  step: number;
  title: string;
  description: string;
  tooltip: string;
  command: string;
  commandDescription: string;
  icon: React.ReactNode;
  docsUrl?: string;
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
      id: "create-project",
      step: 1,
      title: "Create Your Project",
      description: "Scaffold a new ElizaOS project with agents, plugins, and configuration",
      tooltip: "Sets up a complete project structure with everything you need to build AI agents.",
      command: "npx @elizaos/cli create",
      commandDescription: "Creates a new agent project",
      icon: <Terminal className="h-5 w-5" />,
      docsUrl: "https://elizaos.ai/docs/cli/create",
      completed: hasAgents,
    },
    {
      id: "login",
      step: 2,
      title: "Authenticate CLI",
      description: "Connect your CLI to ElizaOS Cloud for deployment capabilities",
      tooltip: "Securely links your local environment to your cloud account for seamless deploys.",
      command: "npx @elizaos/cli login",
      commandDescription: "Opens browser to authenticate",
      icon: <LogIn className="h-5 w-5" />,
      docsUrl: "https://elizaos.ai/docs/cli/login",
      completed: hasApiKey,
    },
    {
      id: "deploy",
      step: 3,
      title: "Deploy to Cloud",
      description: "Push your agent to the cloud and make it available 24/7",
      tooltip: "Deploys your agent to our global infrastructure with automatic scaling.",
      command: "npx @elizaos/cli deploy",
      commandDescription: "Deploys your agent to the cloud",
      icon: <Rocket className="h-5 w-5" />,
      docsUrl: "https://elizaos.ai/docs/cli/deploy",
      completed: hasChatHistory,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allCompleted = completedCount === steps.length;
  const currentStep = steps.find((s) => !s.completed) || steps[steps.length - 1];

  if (allCompleted) {
    return null;
  }

  return (
    <section className={cn("space-y-6", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
              <h2 className="text-xl font-semibold text-white uppercase tracking-wider">
                Getting Started
              </h2>
            </div>
            <span className="text-xs text-white/40 bg-white/5 px-2.5 py-1 rounded-full font-mono">
              {completedCount}/{steps.length} complete
            </span>
          </div>
          <p className="text-white/40 mt-1 text-sm">
            Deploy your first agent in 3 simple steps
          </p>
        </div>
        <BrandButton variant="ghost" asChild size="sm" className="h-8 text-xs gap-1.5">
          <Link href="https://elizaos.ai/docs" target="_blank" rel="noopener noreferrer">
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
            <ExternalLink className="h-3 w-3 opacity-50" />
          </Link>
        </BrandButton>
      </div>

      {/* Steps Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step) => (
          <StepCard 
            key={step.id} 
            step={step} 
            isActive={currentStep.id === step.id}
          />
        ))}
      </div>

      {/* Quick Install Banner */}
      <QuickInstallBanner />
    </section>
  );
}

function StepCard({
  step,
  isActive,
}: {
  step: OnboardingStep;
  isActive: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(step.command);
    setCopied(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BrandCard
      corners={true}
      cornerSize="sm"
      className={cn(
        "relative transition-all duration-300 group",
        step.completed
          ? "border-green-500/20 bg-green-500/5"
          : isActive
            ? "border-[#FF5800]/40 bg-[#FF5800]/5 shadow-lg shadow-[#FF5800]/5"
            : "hover:border-white/20"
      )}
    >
      {/* Step indicator */}
      <div className="absolute -top-px -left-px w-8 h-8 flex items-center justify-center">
        <div 
          className={cn(
            "w-6 h-6 flex items-center justify-center text-xs font-bold border-r border-b",
            step.completed 
              ? "bg-green-500/20 border-green-500/30 text-green-400"
              : isActive
                ? "bg-[#FF5800]/20 border-[#FF5800]/30 text-[#FF5800]"
                : "bg-white/5 border-white/10 text-white/40"
          )}
        >
          {step.completed ? <Check className="h-3.5 w-3.5" /> : step.step}
        </div>
      </div>

      <div className="pl-4 space-y-4">
        {/* Icon and title */}
        <div className="flex items-start justify-between pt-4">
          <div
            className={cn(
              "inline-flex p-2.5 rounded-sm border",
              step.completed
                ? "bg-green-500/20 border-green-500/30 text-green-400"
                : isActive
                  ? "bg-[#FF5800]/10 border-[#FF5800]/20 text-[#FF5800]"
                  : "bg-white/5 border-white/10 text-white/40"
            )}
          >
            {step.completed ? <Check className="h-5 w-5" /> : step.icon}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-white/20 hover:text-white/50 transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[200px] text-xs bg-zinc-900 text-white/80 border border-white/10"
            >
              {step.tooltip}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Title and description */}
        <div>
          <h3
            className={cn(
              "text-base font-semibold mb-1",
              step.completed ? "text-white/50" : "text-white"
            )}
          >
            {step.title}
          </h3>
          <p className="text-xs text-white/40 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Command block */}
        {!step.completed && (
          <div className="relative group/cmd">
            <div className="bg-zinc-800/90 border border-zinc-700/50 p-3 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#FF5800] flex-shrink-0">$</span>
                  <code className="text-white/90 truncate">{step.command}</code>
                </div>
                <button
                  onClick={copyCommand}
                  className={cn(
                    "flex-shrink-0 p-1.5 rounded-sm transition-all",
                    copied 
                      ? "bg-green-500/20 text-green-400" 
                      : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
                  )}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-white/30 text-[10px] mt-1.5">{step.commandDescription}</p>
            </div>
          </div>
        )}

        {/* Status / Action */}
        {step.completed ? (
          <div className="flex items-center gap-1.5 text-xs text-green-400/80 pt-1">
            <Check className="h-3.5 w-3.5" />
            <span>Completed</span>
          </div>
        ) : (
          step.docsUrl && (
            <BrandButton 
              variant="ghost" 
              asChild 
              size="sm" 
              className="w-full h-8 text-xs justify-center"
            >
              <Link href={step.docsUrl} target="_blank" rel="noopener noreferrer">
                Learn More
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Link>
            </BrandButton>
          )
        )}
      </div>
    </BrandCard>
  );
}

function QuickInstallBanner() {
  const [copied, setCopied] = React.useState(false);
  const installCommand = "npm install -g @elizaos/cli";

  const copyCommand = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900/95 via-zinc-900/90 to-zinc-900/80 border border-zinc-700/50 p-4 md:p-5">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-20">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, transparent 40%, rgba(255,88,0,0.1) 40%, rgba(255,88,0,0.1) 60%, transparent 60%),
              linear-gradient(-45deg, transparent 40%, rgba(255,88,0,0.1) 40%, rgba(255,88,0,0.1) 60%, transparent 60%)
            `,
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="hidden md:flex p-3 bg-[#FF5800]/20 border border-[#FF5800]/30">
            <Terminal className="h-5 w-5 text-[#FF5800]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-0.5">
              Install ElizaOS CLI globally
            </h4>
            <p className="text-xs text-white/50">
              For easier access, install the CLI globally on your machine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 md:flex-initial bg-zinc-800/90 border border-zinc-700/50 px-4 py-2.5 font-mono text-sm flex items-center gap-3">
            <span className="text-[#FF5800]">$</span>
            <code className="text-white/90">{installCommand}</code>
            <button
              onClick={copyCommand}
              className={cn(
                "ml-2 p-1.5 rounded-sm transition-all",
                copied 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GettingStartedSkeleton() {
  return (
    <section className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-zinc-800 animate-pulse rounded" />
          <div className="h-4 w-64 bg-zinc-800 animate-pulse rounded mt-2" />
        </div>
        <div className="h-8 w-32 bg-zinc-800 animate-pulse rounded" />
      </div>

      {/* Steps skeleton */}
      <div className="grid gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, index) => (
          <BrandCard key={index} corners={true} cornerSize="sm">
            <div className="space-y-4">
              <div className="flex items-start justify-between pt-4">
                <div className="h-12 w-12 bg-zinc-800 animate-pulse rounded" />
                <div className="h-4 w-4 bg-zinc-800 animate-pulse rounded" />
              </div>
              <div>
                <div className="h-5 w-32 bg-zinc-800 animate-pulse rounded mb-2" />
                <div className="h-4 w-full bg-zinc-800 animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-zinc-800 animate-pulse rounded mt-1" />
              </div>
              <div className="h-16 w-full bg-zinc-800 animate-pulse rounded" />
              <div className="h-8 w-full bg-zinc-800 animate-pulse rounded" />
            </div>
          </BrandCard>
        ))}
      </div>

      {/* Banner skeleton */}
      <div className="h-20 w-full bg-zinc-800 animate-pulse rounded" />
    </section>
  );
}
