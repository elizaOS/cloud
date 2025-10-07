"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AnalyticsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const granularity = searchParams.get("granularity") || "day";

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      params.set(key, value);
    });
    router.push(`/dashboard/analytics?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-4">
      <Select
        value={granularity}
        onValueChange={(value) => updateFilters({ granularity: value })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hour">Hourly</SelectItem>
          <SelectItem value="day">Daily</SelectItem>
          <SelectItem value="week">Weekly</SelectItem>
          <SelectItem value="month">Monthly</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          updateFilters({
            startDate: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            endDate: new Date().toISOString(),
          })
        }
      >
        Last 7 Days
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          updateFilters({
            startDate: new Date(
              Date.now() - 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
            endDate: new Date().toISOString(),
          })
        }
      >
        Last 30 Days
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          updateFilters({
            startDate: new Date(
              Date.now() - 90 * 24 * 60 * 60 * 1000
            ).toISOString(),
            endDate: new Date().toISOString(),
          })
        }
      >
        Last 90 Days
      </Button>
    </div>
  );
}
