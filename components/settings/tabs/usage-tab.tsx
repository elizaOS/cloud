"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Info, DollarSign } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface UsageTabProps {
  user: UserWithOrganization;
}

export function UsageTab({ user }: UsageTabProps) {
  // Mock data - replace with real data from API
  const creditsRemaining = 50000;
  const dailyBurn = 0;
  const currentSessionUsage = 5; // percentage
  const allModelsUsage = 0; // percentage
  const opusOnlyUsage = 0; // percentage

  return (
    <div className="flex flex-col gap-6">
      {/* Credits Overview Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-2 max-w-xl">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  Build, deploy, and monitor your ai agents
                </h3>
              </div>
              <p className="text-xs font-mono text-[#858585] tracking-tight">
                Monitor how your team is consuming credits and track associated
                costs.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-[#848484]" />
              <p className="text-sm text-[#848484]">Last updated: just now</p>
            </div>
          </div>

          {/* Credits Section */}
          <div className="space-y-0 w-full">
            {/* Credits Remaining */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-4">
              <div className="flex items-start justify-between w-full">
                <p className="text-base font-mono text-white">
                  Credits Remaining
                </p>
                <p className="text-xs text-[#FF5800]">{dailyBurn} daily burn</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="bg-[rgba(255,88,0,0.25)] flex items-center justify-center size-7">
                    <DollarSign className="h-[13px] w-[13px] text-[#FF5800]" />
                  </div>
                  <p className="text-2xl font-mono text-white tracking-tight">
                    {creditsRemaining.toLocaleString()}
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  Current organization's credit balance
                </p>
              </div>
            </div>

            {/* Current Session */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t-0 border border-brand-surface p-4 space-y-4">
              <p className="text-base font-mono text-white">Current Session</p>

              <div className="space-y-1">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 relative h-[21px] border border-[#e1e1e1] border-[0.5px]">
                    <div
                      className="absolute inset-0 bg-[#FF5800]"
                      style={{ width: `${currentSessionUsage}%` }}
                    />
                  </div>
                  <p className="text-base font-mono text-white tracking-tight">
                    {currentSessionUsage}% used
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  Starts when a message is sent
                </p>
              </div>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Weekly Limits Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-2 max-w-xl">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  Weekly limits
                </h3>
              </div>
              <p className="text-xs font-mono text-[#858585] tracking-tight underline cursor-pointer hover:text-white transition-colors">
                Learn more about usage limits
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-[#848484]" />
              <p className="text-sm text-[#848484]">Last updated: just now</p>
            </div>
          </div>

          {/* Limits Section */}
          <div className="space-y-0 w-full">
            {/* All models */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-4">
              <p className="text-base font-mono text-white">All models</p>

              <div className="space-y-1">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 relative h-[21px] border border-[#e1e1e1] border-[0.5px]">
                    <div
                      className="absolute inset-0 bg-[#FF5800]"
                      style={{ width: `${allModelsUsage}%` }}
                    />
                  </div>
                  <p className="text-base font-mono text-white tracking-tight">
                    {allModelsUsage}% used
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  Starts when a message is sent
                </p>
              </div>
            </div>

            {/* Opus only */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t-0 border border-brand-surface p-4 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-base font-mono text-white">Opus only</p>
                <Info className="h-4 w-4 text-[#FF5800]" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 relative h-[21px] border border-[#e1e1e1] border-[0.5px]">
                    <div
                      className="absolute inset-0 bg-[#FF5800]"
                      style={{ width: `${opusOnlyUsage}%` }}
                    />
                  </div>
                  <p className="text-base font-mono text-white tracking-tight">
                    {opusOnlyUsage}% used
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  You haven't used Opus yet
                </p>
              </div>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Usage Signals Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2 w-full">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase flex-1">
                  Usage Signals
                </h3>
              </div>
              <p className="text-xs font-mono text-[#858585] tracking-tight">
                Key items from spend automations, quota monitors, and provider
                health.
              </p>
            </div>
          </div>

          {/* Status Card */}
          <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-base font-mono text-white">
                All systems operational
              </p>
              <Info className="h-4 w-4 text-[#FF5800]" />
            </div>

            <p className="text-sm text-white/60">
              Your infrastructure is running smoothly. All providers are healthy
              and credit balance is suficient.
            </p>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
