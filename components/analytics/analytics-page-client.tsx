"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";

export function AnalyticsPageClient() {
  useSetPageHeader({
    title: "Analytics",
    description: "View usage statistics and insights",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Usage Analytics</h2>
        <p className="text-muted-foreground">
          Analytics dashboard coming soon...
        </p>
      </div>
    </div>
  );
}
