import Link from "next/link";
import { Sparkles, ArrowUpRight, CreditCard, Building2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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
    <Card
      className={cn(
        "relative overflow-hidden border-border/50 backdrop-blur-sm shadow-md",
        className,
      )}
    >
      <CardHeader className="relative z-10 pb-4 rounded-t bg-card !h-auto !grid-rows-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full border border-border/60 bg-background/80 px-3 py-1">
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
              <span>Good to see you, {userName}</span>
            </Badge>
            <div className="space-y-2 p-4">
              <CardTitle className="!text-3xl font-semibold tracking-tight !text-foreground md:!text-4xl">
                Build, deploy, and monitor your AI agents
              </CardTitle>
              <CardDescription className="max-w-2xl !text-sm !text-muted-foreground md:!text-base">
                Stay on top of credits, observe generation activity, and jump
                into the tools you use the most—all from one streamlined
                dashboard.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="default" className="gap-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                <Building2 className="h-4 w-4" />
                {organizationName}
              </Badge>
              <Badge variant="outline" className="gap-2 rounded-full border-border/50 bg-background/70 font-medium">
                <CreditCard className="h-4 w-4 text-primary" />
                {creditBalance.toLocaleString()} credits
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {primaryAction ? (
              <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
                <Link href={primaryAction.href}>
                  {primaryAction.label}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full rounded-xl border-border/70 bg-background sm:w-auto"
              >
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <Separator className="relative z-10 bg-border" />

      <CardContent className="relative z-10 pt-6 rounded-b">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="group border-border/40 bg-muted/50 backdrop-blur-sm shadow-sm transition-all hover:border-primary/40 hover:bg-muted/60 hover:shadow-md"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide !text-muted-foreground">
                    {stat.label}
                  </p>
                  {stat.badge ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/50 text-[11px]"
                    >
                      {stat.badge}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="text-2xl font-semibold !text-foreground">
                    {stat.value}
                  </p>
                  <TrendingUp className="h-4 w-4 text-emerald-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                {stat.hint ? (
                  <p className="mt-1 text-xs !text-muted-foreground">{stat.hint}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>

      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
      </div>
    </Card>
  );
}
