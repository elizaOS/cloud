import Link from "next/link";
import {
  Sparkles,
  ArrowUpRight,
  CreditCard,
  Building2,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";

interface HeroStat {
  label: string;
  value: string;
  hint?: string;
  badge?: string;
}

interface DashboardHeroProps {
  userName: string;
  organizationName: string;
  creditBalance: number;
  stats: HeroStat[];
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function DashboardHero({
  userName,
  organizationName,
  creditBalance,
  stats,
  primaryAction = {
    label: "Manage billing",
    href: "/dashboard/account",
  },
  secondaryAction = {
    label: "View analytics",
    href: "/dashboard/analytics",
  },
  className,
}: DashboardHeroProps) {
  return (
    <BrandCard
      className={cn(
        "relative overflow-hidden",
        className,
      )}
    >
      <CornerBrackets size="lg" className="opacity-50" />
      
      <div className="relative z-10 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="w-fit flex items-center gap-2 rounded-none border border-white/20 bg-white/10 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 text-[#FF5800]" />
              <span className="text-white text-sm">Good to see you, {userName}</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-white">
                Build, deploy, and monitor your AI agents
              </h1>
              <p className="max-w-2xl text-sm md:text-base text-white/60">
                Stay on top of credits, observe generation activity, and jump
                into the tools you use the most—all from one streamlined
                dashboard.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 rounded-none bg-[#FF580020] border border-[#FF5800]/40 text-[#FF5800] px-3 py-1">
                <Building2 className="h-4 w-4" />
                {organizationName}
              </span>
              <span className="flex items-center gap-2 rounded-none border border-white/20 bg-white/10 font-medium px-3 py-1 text-white">
                <CreditCard className="h-4 w-4 text-[#FF5800]" />$
                {Number(creditBalance).toFixed(2)} balance
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {primaryAction ? (
              <BrandButton asChild variant="primary" size="lg" className="w-full sm:w-auto">
                <Link href={primaryAction.href}>
                  {primaryAction.label}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </BrandButton>
            ) : null}
            {secondaryAction ? (
              <BrandButton
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
              >
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </BrandButton>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-10 border-t border-white/10 my-6" />

      <div className="relative z-10 pt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="group rounded-none border border-white/10 bg-black/40 p-4 transition-all hover:border-[#FF5800]/40 hover:bg-black/50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  {stat.label}
                </p>
                {stat.badge ? (
                  <span className="rounded-none border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                    {stat.badge}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-2xl font-semibold text-white">
                  {stat.value}
                </p>
                <TrendingUp className="h-4 w-4 text-[#FF5800] opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              {stat.hint ? (
                <p className="mt-1 text-xs text-white/50">
                  {stat.hint}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </BrandCard>
  );
}
