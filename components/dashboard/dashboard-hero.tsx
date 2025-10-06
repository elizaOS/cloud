import Link from "next/link";
import { Sparkles, ArrowUpRight, CreditCard, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
                "relative overflow-hidden border-border/60 bg-gradient-to-br from-background via-background/90 to-muted/60 shadow-sm",
                className,
            )}
        >
            <CardContent className="relative z-10 flex flex-col gap-6 p-6 sm:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span>Good to see you, {userName}</span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                                Build, deploy, and monitor your AI agents
                            </h1>
                            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                                Stay on top of credits, observe generation activity, and jump into the tools you use the most—all from one streamlined dashboard.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary">
                                <Building2 className="h-4 w-4" />
                                {organizationName}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-1 font-medium text-foreground">
                                <CreditCard className="h-4 w-4 text-primary" />
                                {creditBalance.toLocaleString()} credits
                            </span>
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

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="group rounded-2xl border border-border/50 bg-background/80 px-4 py-3 shadow-sm transition hover:border-primary/40 hover:bg-background/90"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {stat.label}
                                </p>
                                {stat.badge ? (
                                    <Badge variant="outline" className="rounded-full border-border/50 text-[11px]">
                                        {stat.badge}
                                    </Badge>
                                ) : null}
                            </div>
                            <p className="mt-2 text-2xl font-semibold text-foreground">
                                {stat.value}
                            </p>
                            {stat.hint ? (
                                <p className="text-xs text-muted-foreground">{stat.hint}</p>
                            ) : null}
                        </div>
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
