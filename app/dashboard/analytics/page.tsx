import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
  description: "View detailed usage statistics, performance metrics, and insights for your AI agents",
  keywords: ["analytics", "statistics", "metrics", "insights", "performance"],
};

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-2">
          View usage statistics and insights
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Usage Analytics</h2>
        <p className="text-muted-foreground">
          Analytics dashboard coming soon...
        </p>
      </div>
    </div>
  );
}

