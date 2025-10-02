import { CalendarClock, KeyRound, ShieldCheck, Signal } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ApiKeysSummaryData } from "./types";

interface ApiKeysSummaryProps {
    summary: ApiKeysSummaryData;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
});

export function ApiKeysSummary({ summary }: ApiKeysSummaryProps) {
    const items = [
        {
            title: "Total keys",
            value: summary.totalKeys,
            description: "Across your organization",
            icon: KeyRound,
        },
        {
            title: "Active keys",
            value: summary.activeKeys,
            description: "Currently enabled",
            icon: ShieldCheck,
        },
        {
            title: "Monthly usage",
            value: summary.monthlyUsage,
            description: `Requests this month • ${summary.rateLimit.toLocaleString()} rpm`,
            icon: Signal,
        },
        {
            title: "Last generated",
            value: summary.lastGeneratedAt
                ? new Date(summary.lastGeneratedAt).toLocaleDateString()
                : "Not yet",
            description: "Creation activity",
            icon: CalendarClock,
        },
    ] as const;

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
                <Card key={item.title} className="border-border/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {item.title}
                        </CardTitle>
                        <item.icon className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">
                            {typeof item.value === "string"
                                ? item.value
                                : numberFormatter.format(item.value)}
                        </div>
                        <p className="text-xs text-muted-foreground/80">{item.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
