"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Info, DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UsageTabProps {
  user: UserWithOrganization;
}

export function UsageTab({ user }: UsageTabProps) {
  const [loading, setLoading] = useState(false);
  const [dailyBurn, setDailyBurn] = useState(0);

  const creditsRemaining = Number(user.organization?.credit_balance || 0);

  useEffect(() => {
    const fetchDailyBurn = async () => {
      try {
        setLoading(true);

        const response = await fetch("/api/credits/transactions?hours=24");

        if (!response.ok) {
          throw new Error("Failed to fetch transactions");
        }

        const data = await response.json();

        const burn = (data.transactions || [])
          .filter((t: any) => Number(t.amount) < 0)
          .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount)), 0);

        setDailyBurn(burn);
      } catch (error) {
        console.error("Error fetching daily burn:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDailyBurn();
  }, []);

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
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                ) : (
                  <p className="text-xs text-[#FF5800]">
                    ${dailyBurn.toFixed(2)} daily burn
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="bg-[rgba(255,88,0,0.25)] flex items-center justify-center size-7">
                    <DollarSign className="h-[13px] w-[13px] text-[#FF5800]" />
                  </div>
                  <p className="text-2xl font-mono text-white tracking-tight">
                    ${creditsRemaining.toFixed(2)}
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  Current organization's credit balance
                </p>
              </div>
            </div>

            {/* Current Session - Coming Soon */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t-0 border border-brand-surface p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-base font-mono text-white">
                  Current Session
                </p>
                <span className="text-xs font-mono text-white/40 border border-white/20 px-2 py-1">
                  Coming Soon
                </span>
              </div>
              <p className="text-sm text-white/60">
                Session tracking will be available in a future update.
              </p>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Weekly Limits Card - Coming Soon */}
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
                <span className="text-xs font-mono text-white/40 border border-white/20 px-2 py-1">
                  Coming Soon
                </span>
              </div>
              <p className="text-xs font-mono text-[#858585] tracking-tight">
                Usage limits and quota enforcement will be available in a future
                update.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-[#848484]" />
              <p className="text-sm text-[#848484]">Feature in development</p>
            </div>
          </div>

          {/* Limits Section - Placeholder */}
          <div className="space-y-0 w-full">
            {/* All models */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-4">
              <p className="text-base font-mono text-white/60">All models</p>

              <div className="space-y-1">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 relative h-[21px] border border-[#e1e1e1] border-[0.5px]">
                    <div
                      className="absolute inset-0 bg-[#FF5800]/20"
                      style={{ width: "0%" }}
                    />
                  </div>
                  <p className="text-base font-mono text-white/60 tracking-tight">
                    No limit set
                  </p>
                </div>
                <p className="text-sm text-white/40">
                  Weekly usage limits not configured
                </p>
              </div>
            </div>

            {/* Opus only */}
            <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t-0 border border-brand-surface p-4 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-base font-mono text-white/60">Opus only</p>
                <Info className="h-4 w-4 text-[#FF5800]/60" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 relative h-[21px] border border-[#e1e1e1] border-[0.5px]">
                    <div
                      className="absolute inset-0 bg-[#FF5800]/20"
                      style={{ width: "0%" }}
                    />
                  </div>
                  <p className="text-base font-mono text-white/60 tracking-tight">
                    No limit set
                  </p>
                </div>
                <p className="text-sm text-white/40">
                  Model-specific limits not configured
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
                {creditsRemaining > 10
                  ? "All systems operational"
                  : "Low credit balance"}
              </p>
              <Info
                className={`h-4 w-4 ${creditsRemaining > 10 ? "text-[#FF5800]" : "text-yellow-500"}`}
              />
            </div>

            <p className="text-sm text-white/60">
              {creditsRemaining > 10
                ? "Your infrastructure is running smoothly. All providers are healthy and credit balance is sufficient."
                : "Your credit balance is low. Consider adding more credits to ensure uninterrupted service."}
            </p>

            {creditsRemaining <= 10 && (
              <button
                type="button"
                onClick={() => {
                  const settingsPageClient = document.querySelector(
                    '[data-settings-page]'
                  );
                  if (settingsPageClient) {
                    const billingTabButton = document.querySelector(
                      '[data-tab="billing"]'
                    ) as HTMLButtonElement;
                    billingTabButton?.click();
                  }
                }}
                className="relative bg-[#e1e1e1] px-3 py-2 overflow-hidden hover:bg-white transition-colors mt-2"
              >
                <div
                  className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                  style={{
                    backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                    backgroundSize: "2.915576934814453px 2.915576934814453px",
                  }}
                />
                <span className="relative z-10 text-black font-mono font-medium text-sm">
                  Add Credits
                </span>
              </button>
            )}
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
