"use client";

import { useState } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Activity, Coins, Shield, BarChart } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnalyticsTabProps {
  user: UserWithOrganization;
}

type TimeRange = "7days" | "30days" | "90days";
type Cadence = "day" | "week" | "month";
type FocusMetric = "requests" | "costs" | "success-rate";

export function AnalyticsTab({ user }: AnalyticsTabProps) {
  const [cadence, setCadence] = useState<Cadence>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>("7days");
  const [focusMetric, setFocusMetric] = useState<FocusMetric>("requests");

  // Mock analytics data
  const totalRequests = 0;
  const totalCost = 0;
  const successRate = 0;
  const tokenVolume = 0;
  const dailyBurn = 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Controls Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-2 max-w-[500px]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  Controls
                </h3>
              </div>
              <p className="text-sm font-mono text-[#858585] tracking-tight">
                Adjust the aggregation cadence and time range to refocus the
                analytics surface. All widgets update in real time.
              </p>
            </div>
          </div>

          {/* Time Controls */}
          <div className="flex items-start gap-2">
            {/* Cadence Dropdown */}
            <div className="w-[100px]">
              <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
                <SelectTrigger className="bg-transparent border-[#303030] text-white/60 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#303030]">
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Range Buttons */}
            <button
              type="button"
              onClick={() => setTimeRange("7days")}
              className={`
                border border-[#303030] px-2 py-2 transition-colors text-sm text-white/60
                ${timeRange === "7days" ? "bg-white/10" : "hover:bg-white/5"}
              `}
            >
              Last 7 days
            </button>

            <button
              type="button"
              onClick={() => setTimeRange("30days")}
              className={`
                border border-[#303030] px-2 py-2 transition-colors text-sm text-white/60
                ${timeRange === "30days" ? "bg-white/10" : "hover:bg-white/5"}
              `}
            >
              Last 30 days
            </button>

            <button
              type="button"
              onClick={() => setTimeRange("90days")}
              className={`
                border border-[#303030] px-2 py-2 transition-colors text-sm text-white/60
                ${timeRange === "90days" ? "bg-white/10" : "hover:bg-white/5"}
              `}
            >
              Last 90 days
            </button>
          </div>
        </div>
      </BrandCard>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-0">
        {/* Total Requests */}
        <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-base font-mono text-white">Total Requests</p>
            <Activity className="h-4 w-4 text-[#A2A2A2]" />
          </div>
          <p className="text-2xl font-mono text-white tracking-tight">
            {totalRequests}
          </p>
          <p className="text-sm text-white/60">
            Daily cadence · Oct 20,1025 → Oct 27, 2025
          </p>
        </div>

        {/* Total Cost */}
        <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-base font-mono text-white">Total Cost</p>
            <Coins className="h-4 w-4 text-[#A2A2A2]" />
          </div>
          <p className="text-2xl font-mono text-white tracking-tight">
            {totalCost}
          </p>
          <p className="text-sm text-white/60">
            ± 0.00 credits per request
          </p>
        </div>

        {/* Success Rate */}
        <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-base font-mono text-white">Success Rate</p>
            <Shield className="h-4 w-4 text-[#A2A2A2]" />
          </div>
          <p className="text-2xl font-mono text-white tracking-tight">
            {successRate}
          </p>
          <p className="text-sm text-white/60">
            Ratio of successful completions across 0 data points
          </p>
        </div>

        {/* Token Volume */}
        <div className="backdrop-blur-sm border-t border-r border-b border-brand-surface p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-base font-mono text-white">Token Volume</p>
            <BarChart className="h-4 w-4 text-[#A2A2A2]" />
          </div>
          <p className="text-2xl font-mono text-white tracking-tight">
            {tokenVolume}
          </p>
          <p className="text-sm text-white/60">
            ± 0.00 tokens per request
          </p>
        </div>
      </div>

      {/* Analytics Content Grid */}
      <div className="grid grid-cols-[1fr_auto] gap-6">
        {/* Usage Visibility Card */}
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  usage Visibility
                </h3>
              </div>
              <p className="text-xs font-mono text-[#858585] tracking-tight">
                Overlay throughput spend, and reliability in a unified timeline
                to expose trend shifts instantly.
              </p>
            </div>

            {/* Focus Metric Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-px w-4 bg-[#FF5800]" />
                  <p className="text-base font-mono text-white tracking-tight">
                    Latest data point
                  </p>
                </div>

                <div className="flex items-start gap-0">
                  <button
                    type="button"
                    onClick={() => setFocusMetric("requests")}
                    className={`
                      relative px-3 py-2 transition-colors text-xs font-mono font-medium
                      ${focusMetric === "requests" ? "bg-[rgba(255,88,0,0.24)] text-[#FF5800]" : "bg-neutral-950 border border-brand-surface border-r-0 text-[#e1e1e1]"}
                    `}
                  >
                    {focusMetric === "requests" && (
                      <div
                        className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                        style={{
                          backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                          backgroundSize: "2.921810567378998px 2.921810567378998px",
                        }}
                      />
                    )}
                    <span className="relative z-10">Requests</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFocusMetric("costs")}
                    className={`
                      px-3 py-2 transition-colors text-xs font-mono font-medium border-t border-b border-brand-surface
                      ${focusMetric === "costs" ? "bg-[rgba(255,88,0,0.24)] text-[#FF5800]" : "bg-neutral-950 text-[#e1e1e1]"}
                    `}
                  >
                    Costs (credits)
                  </button>

                  <button
                    type="button"
                    onClick={() => setFocusMetric("success-rate")}
                    className={`
                      px-3 py-2 transition-colors text-xs font-mono font-medium border border-brand-surface
                      ${focusMetric === "success-rate" ? "bg-[rgba(255,88,0,0.24)] text-[#FF5800]" : "bg-neutral-950 text-[#e1e1e1]"}
                    `}
                  >
                    Successs rate (%)
                  </button>
                </div>
              </div>

              <p className="text-sm text-white/60">
                Raw throughput captured at the selected cadence.
              </p>
            </div>
          </div>
        </BrandCard>

        {/* Cost Outlook Card */}
        <BrandCard className="relative flex-1">
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  Cost outlook
                </h3>
                <div className="bg-[rgba(255,88,0,0.25)] px-2 py-1">
                  <p className="text-xs font-mono text-[#FF5800]">Burn Rate</p>
                </div>
              </div>
              <p className="text-xs font-mono text-[#858585] tracking-tight">
                Monitor credit runway, relative spend, and burn velocity for the
                selected window.
              </p>
            </div>

            {/* Burn Rate Cards */}
            <div className="space-y-0">
              {/* Daily Burn Card 1 */}
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-2">
                <p className="text-sm font-mono text-white/60 uppercase">
                  DAily Burn (24)
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-base font-mono text-white">
                    {dailyBurn} credits
                  </p>
                  <div className="bg-[rgba(255,88,0,0.25)] px-2 py-1">
                    <p className="text-xs font-mono text-[#FF5800]">0.0%</p>
                  </div>
                </div>
                <p className="text-sm text-white/60">
                  Compared to previous 24h window - stable throughput
                </p>
              </div>

              {/* Daily Burn Card 2 */}
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-l border-r border-b border-brand-surface p-4 space-y-2">
                <p className="text-sm font-mono text-white/60 uppercase">
                  DAily Burn (24)
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-base font-mono text-white">
                    {dailyBurn} credits
                  </p>
                  <div className="bg-[rgba(255,88,0,0.25)] px-2 py-1">
                    <p className="text-xs font-mono text-[#FF5800]">0.0%</p>
                  </div>
                </div>
                <p className="text-sm text-white/60">
                  Compared to previous 24h window - stable throughput
                </p>
              </div>
            </div>
          </div>
        </BrandCard>
      </div>
    </div>
  );
}
