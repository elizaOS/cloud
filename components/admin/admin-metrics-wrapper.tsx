"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { AdminMetricsClient } from "./admin-metrics-client";

export function AdminMetricsWrapper() {
  useSetPageHeader({
    title: "Engagement Metrics",
    description: "User engagement KPIs across all platforms",
  });

  return <AdminMetricsClient />;
}
