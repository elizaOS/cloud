/**
 * Dashboard data actions.
 *
 * This module re-exports client API functions for dashboard data.
 * Previously used "use server" directives, now uses client API routes.
 */

import { dashboardApi, type DashboardData, type DashboardAgentStats } from "@/lib/api/client";

export type { DashboardData, DashboardAgentStats };

/**
 * Gets dashboard data for the current user's organization.
 */
export async function getDashboardData(): Promise<DashboardData> {
  return dashboardApi.getData();
}
