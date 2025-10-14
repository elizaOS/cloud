"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function AnalyticsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const granularity = searchParams.get("granularity") || "day";
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  const activeRange = useMemo(() => {
    if (!startDateParam || !endDateParam) return undefined;
    const start = new Date(startDateParam);
    const end = new Date(endDateParam);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
      return undefined;
    }

    const diffInDays = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );

    const now = new Date();
    const isAlignedWithNow =
      Math.abs(end.getTime() - now.getTime()) < 1000 * 60 * 60;

    if (diffInDays === 7 && isAlignedWithNow) return "7d";
    if (diffInDays === 30 && isAlignedWithNow) return "30d";
    if (diffInDays === 90 && isAlignedWithNow) return "90d";

    return "custom";
  }, [startDateParam, endDateParam]);

  const presets = [
    { label: "Last 7 days", value: "7d", days: 7 },
    { label: "Last 30 days", value: "30d", days: 30 },
    { label: "Last 90 days", value: "90d", days: 90 },
  ] as const;

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      params.set(key, value);
    });
    router.push(`/dashboard/analytics?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-5 md:gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-4 md:gap-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
            Aggregation
          </p>
          <Select
            value={granularity}
            onValueChange={(value) => updateFilters({ granularity: value })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue>
                {granularity.charAt(0).toUpperCase() + granularity.slice(1)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">Hourly</SelectItem>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {activeRange === "custom" ? (
          <Badge
            variant="outline"
            className="gap-1 rounded-full px-3 py-1 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Custom range detected
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 md:gap-4">
        {presets.map((preset) => {
          const isActive = activeRange === preset.value;

          return (
            <Button
              key={preset.value}
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full border border-border/60 bg-background/60 text-xs font-medium transition-colors",
                isActive &&
                  "border-primary/60 bg-primary/10 text-primary hover:bg-primary/15",
              )}
              onClick={() => {
                const now = new Date();
                const start = new Date(
                  now.getTime() - preset.days * 24 * 60 * 60 * 1000,
                );

                updateFilters({
                  startDate: start.toISOString(),
                  endDate: now.toISOString(),
                });
              }}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
