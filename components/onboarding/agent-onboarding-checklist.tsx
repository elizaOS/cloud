"use client";

import { useCallback, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  MessageSquare,
  FileText,
  Key,
  Rocket,
  Edit,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ElizaAvatar } from "@/components/chat/eliza-avatar";
import { useAgentOnboarding } from "@/components/onboarding/agent-onboarding-provider";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  getHref: (agentId: string) => string;
  checkMatch?: (info: {
    pathname: string;
    characterIdParam: string | null;
    agentId: string;
  }) => boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "test",
    title: "Test Your Agent",
    description: "Verify personality and responses",
    icon: <MessageSquare className="h-4 w-4" />,
    getHref: (agentId) => `/dashboard/chat?characterId=${agentId}`,
    checkMatch: ({ pathname, characterIdParam, agentId }) =>
      pathname.startsWith("/dashboard/chat") &&
      characterIdParam === agentId,
  },
  {
    id: "knowledge",
    title: "Add Knowledge",
    description: "Upload documents for context",
    icon: <FileText className="h-4 w-4" />,
    getHref: () => "/dashboard/knowledge",
    checkMatch: ({ pathname }) => pathname.startsWith("/dashboard/knowledge"),
  },
  {
    id: "api-keys",
    title: "Configure API Keys",
    description: "Connect your LLM provider",
    icon: <Key className="h-4 w-4" />,
    getHref: () => "/dashboard/api-keys",
    checkMatch: ({ pathname }) => pathname.startsWith("/dashboard/api-keys"),
  },
  {
    id: "deploy",
    title: "Deploy Agent",
    description: "Make accessible 24/7",
    icon: <Rocket className="h-4 w-4" />,
    getHref: () => "/dashboard/containers",
    checkMatch: ({ pathname }) => pathname.startsWith("/dashboard/containers"),
  },
  {
    id: "edit",
    title: "Edit & Customize",
    description: "Fine-tune settings",
    icon: <Edit className="h-4 w-4" />,
    getHref: (agentId) => `/dashboard/build?characterId=${agentId}`,
    checkMatch: ({ pathname, characterIdParam, agentId }) =>
      pathname.startsWith("/dashboard/build") &&
      characterIdParam === agentId,
  },
];

export function AgentOnboardingChecklist() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const characterIdParam = searchParams.get("characterId");

  const {
    isVisible,
    isMinimized,
    agentId,
    agentName,
    agentAvatarUrl,
    completedSteps,
    setMinimized,
    toggleStepComplete,
    dismissChecklist,
  } = useAgentOnboarding();

  useEffect(() => {
    if (!isVisible || !agentId) return;

    ONBOARDING_STEPS.forEach((step) => {
      if (
        step.checkMatch &&
        step.checkMatch({
          pathname: pathname || "",
          characterIdParam,
          agentId,
        })
      ) {
        if (!completedSteps.includes(step.id)) {
          toggleStepComplete(step.id);
        }
      }
    });
  }, [pathname, characterIdParam, agentId, isVisible, completedSteps, toggleStepComplete]);

  const handleStepClick = useCallback(
    (step: OnboardingStep) => {
      if (!agentId) return;
      router.push(step.getHref(agentId));
    },
    [agentId, router],
  );

  const completedCount = completedSteps.length;
  const totalSteps = ONBOARDING_STEPS.length;
  const progressPercent = (completedCount / totalSteps) * 100;

  if (!isVisible || !agentId) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-3 px-4 py-3 bg-[#0A0A0A] border border-[#353535] shadow-lg hover:border-[#FF5800]/50 transition-all group"
        >
          <div className="relative">
            <ElizaAvatar
              avatarUrl={agentAvatarUrl || undefined}
              name={agentName || "Agent"}
              className="w-8 h-8"
              iconClassName="h-4 w-4"
            />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF5800] rounded-full flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">
                {totalSteps - completedCount}
              </span>
            </div>
          </div>
          <div className="text-left">
            <p className="text-xs font-medium text-white">Setup Checklist</p>
            <p className="text-[10px] text-white/50">
              {completedCount}/{totalSteps} completed
            </p>
          </div>
          <ChevronUp className="h-4 w-4 text-white/40 group-hover:text-white/60" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <div className="bg-[#0A0A0A] border border-[#353535] shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-[#353535]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="p-2 bg-[#FF5800]/10 border border-[#FF5800]/30 rounded-full">
                  <Sparkles className="h-4 w-4 text-[#FF5800]" />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Get Started
                </h3>
                <p className="text-xs text-white/50">
                  {agentName ? `Setup ${agentName}` : "Complete setup"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(true)}
                className="p-1.5 text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                title="Minimize"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                onClick={dismissChecklist}
                className="p-1.5 text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-white/50">Progress</span>
              <span className="text-white/70 font-medium">
                {completedCount}/{totalSteps}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF5800] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {ONBOARDING_STEPS.map((step, index) => {
            const isCompleted = completedSteps.includes(step.id);
            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-3 p-3 border-b border-[#353535]/50 last:border-b-0 transition-colors",
                  isCompleted ? "bg-white/5" : "hover:bg-white/5",
                )}
              >
                <button
                  onClick={() => toggleStepComplete(step.id)}
                  className={cn(
                    "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    isCompleted
                      ? "bg-[#FF5800] border-[#FF5800]"
                      : "border-white/30 hover:border-[#FF5800]/50",
                  )}
                >
                  {isCompleted && <Check className="h-3 w-3 text-white" />}
                </button>

                <button
                  onClick={() => handleStepClick(step)}
                  className="flex-1 flex items-center gap-3 text-left group"
                >
                  <div
                    className={cn(
                      "p-1.5 rounded-sm transition-colors",
                      isCompleted
                        ? "bg-white/10 text-white/40"
                        : "bg-[#FF5800]/10 text-[#FF5800]",
                    )}
                  >
                    {step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium transition-colors",
                        isCompleted
                          ? "text-white/40 line-through"
                          : "text-white group-hover:text-[#FF5800]",
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-white/40 truncate">
                      {step.description}
                    </p>
                  </div>
                </button>

                <span className="text-[10px] font-mono text-white/20">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>

        {completedCount === totalSteps && (
          <div className="p-3 bg-[#FF5800]/10 border-t border-[#FF5800]/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#FF5800]" />
                <span className="text-xs font-medium text-white">
                  All done!
                </span>
              </div>
              <button
                onClick={dismissChecklist}
                className="text-xs text-[#FF5800] hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
