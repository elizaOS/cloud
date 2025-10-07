import type { Metadata } from "next";
import { AnalyticsPageClient } from "@/components/analytics/analytics-page-client";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "View detailed usage statistics, performance metrics, and insights for your AI agents",
  keywords: ["analytics", "statistics", "metrics", "insights", "performance"],
};

export default function AnalyticsPage() {
  return <AnalyticsPageClient />;
}
