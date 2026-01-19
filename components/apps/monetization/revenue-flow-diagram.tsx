/**
 * Revenue flow diagram component showing how money flows from users to creators.
 * Visual explanation of the monetization model.
 */

"use client";

import { cn } from "@/lib/utils";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { User, Server, Wallet, ArrowRight, Zap, Coins } from "lucide-react";

interface RevenueFlowDiagramProps {
  markupPercentage: number;
  purchaseSharePercentage: number;
  className?: string;
}

export function RevenueFlowDiagram({
  markupPercentage,
  purchaseSharePercentage,
  className,
}: RevenueFlowDiagramProps) {
  // Example calculation with $1.00 base cost
  const baseCost = 1.0;
  const markup = baseCost * (markupPercentage / 100);
  const userPays = baseCost + markup;

  return (
    <BrandCard className={cn("relative overflow-hidden", className)}>
      <CornerBrackets size="sm" className="opacity-20" />

      {/* Header */}
      <div className="relative z-10 mb-6">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#FF5800]" />
          How Revenue Flows
        </h3>
        <p className="text-xs text-white/40 mt-1">
          Example: User makes an AI request (${baseCost.toFixed(2)} base cost)
        </p>
      </div>

      {/* Flow Diagram */}
      <div className="relative z-10">
        {/* Desktop/Tablet Layout */}
        <div className="hidden sm:flex items-center justify-between gap-2">
          {/* User */}
          <FlowNode
            icon={<User className="h-5 w-5" />}
            label="User"
            value={`Pays $${userPays.toFixed(2)}`}
            color="text-blue-400"
            bgColor="bg-blue-500/20"
          />

          {/* Arrow 1 */}
          <FlowArrow label={`$${userPays.toFixed(2)}`} />

          {/* Platform */}
          <FlowNode
            icon={<Server className="h-5 w-5" />}
            label="Platform"
            value={`Keeps $${baseCost.toFixed(2)}`}
            color="text-white/70"
            bgColor="bg-white/10"
          />

          {/* Arrow 2 */}
          <FlowArrow label={`$${markup.toFixed(2)}`} highlight />

          {/* Creator */}
          <FlowNode
            icon={<Wallet className="h-5 w-5" />}
            label="You"
            value={`Earn $${markup.toFixed(2)}`}
            color="text-[#FF5800]"
            bgColor="bg-[#FF5800]/20"
            highlight
          />
        </div>

        {/* Mobile Layout */}
        <div className="sm:hidden space-y-3">
          <FlowNodeMobile
            icon={<User className="h-4 w-4" />}
            label="User pays"
            value={`$${userPays.toFixed(2)}`}
            color="text-blue-400"
          />
          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 text-white/30 rotate-90" />
          </div>
          <FlowNodeMobile
            icon={<Server className="h-4 w-4" />}
            label="Platform keeps"
            value={`$${baseCost.toFixed(2)}`}
            color="text-white/60"
            sublabel="(base cost)"
          />
          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 text-[#FF5800] rotate-90" />
          </div>
          <FlowNodeMobile
            icon={<Wallet className="h-4 w-4" />}
            label="You earn"
            value={`$${markup.toFixed(2)}`}
            color="text-[#FF5800]"
            sublabel={`(${markupPercentage}% markup)`}
            highlight
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="relative z-10 mt-6 pt-4 border-t border-white/10">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-purple-400">
              <Zap className="h-3 w-3" />
              <span>Inference Markup</span>
            </div>
            <p className="text-white/50">
              You set {markupPercentage}% markup on AI costs.
              <br />
              More usage = more earnings.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400">
              <Coins className="h-3 w-3" />
              <span>Purchase Share</span>
            </div>
            <p className="text-white/50">
              Earn {purchaseSharePercentage}% when users buy credits in your
              app.
            </p>
          </div>
        </div>
      </div>
    </BrandCard>
  );
}

interface FlowNodeProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  highlight?: boolean;
}

function FlowNode({
  icon,
  label,
  value,
  color,
  bgColor,
  highlight,
}: FlowNodeProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
        highlight
          ? "border-[#FF5800]/30 animate-glow-pulse"
          : "border-white/10",
        bgColor
      )}
    >
      <div className={cn(color)}>{icon}</div>
      <div className="text-center">
        <p className="text-xs font-medium text-white">{label}</p>
        <p className={cn("text-[10px] font-mono", color)}>{value}</p>
      </div>
    </div>
  );
}

interface FlowArrowProps {
  label: string;
  highlight?: boolean;
}

function FlowArrow({ label, highlight }: FlowArrowProps) {
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <ArrowRight
        className={cn(
          "h-4 w-4",
          highlight ? "text-[#FF5800]" : "text-white/30"
        )}
      />
      <span
        className={cn(
          "text-[10px] font-mono",
          highlight ? "text-[#FF5800]" : "text-white/40"
        )}
      >
        {label}
      </span>
    </div>
  );
}

interface FlowNodeMobileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sublabel?: string;
  highlight?: boolean;
}

function FlowNodeMobile({
  icon,
  label,
  value,
  color,
  sublabel,
  highlight,
}: FlowNodeMobileProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border",
        highlight
          ? "border-[#FF5800]/30 bg-[#FF5800]/10"
          : "border-white/10 bg-white/5"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={color}>{icon}</span>
        <div>
          <span className="text-xs text-white">{label}</span>
          {sublabel && (
            <span className="text-[10px] text-white/40 ml-1">{sublabel}</span>
          )}
        </div>
      </div>
      <span className={cn("text-sm font-mono font-medium", color)}>
        {value}
      </span>
    </div>
  );
}
