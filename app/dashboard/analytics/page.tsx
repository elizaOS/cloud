import type { Metadata } from "next";
import { getAnalyticsData } from "@/lib/actions/analytics";
import { UsageChart } from "@/components/analytics/usage-chart";
import { AnalyticsFilters } from "@/components/analytics/filters";
import { ExportButton } from "@/components/analytics/export-button";
import { CostAlerts } from "@/components/analytics/cost-alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "View detailed usage statistics, performance metrics, and insights for your AI agents",
  keywords: ["analytics", "statistics", "metrics", "insights", "performance"],
};

interface AnalyticsPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    granularity?: "hour" | "day" | "week" | "month";
  }>;
}

export default async function AnalyticsPage(props: AnalyticsPageProps) {
  await requireAuth();

  const searchParams = await props.searchParams;

  const filters = {
    startDate: searchParams.startDate
      ? new Date(searchParams.startDate)
      : undefined,
    endDate: searchParams.endDate ? new Date(searchParams.endDate) : undefined,
    granularity: searchParams.granularity || ("day" as const),
  };

  const data = await getAnalyticsData(filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            View detailed usage statistics and trends
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            startDate={data.filters.startDate}
            endDate={data.filters.endDate}
            granularity={data.filters.granularity}
            format="csv"
          />
          <ExportButton
            startDate={data.filters.startDate}
            endDate={data.filters.endDate}
            granularity={data.filters.granularity}
            format="json"
          />
        </div>
      </div>

      <AnalyticsFilters />

      <CostAlerts
        costTrending={data.costTrending}
        creditBalance={data.organization.creditBalance}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.overallStats.totalRequests.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.overallStats.totalCost.toLocaleString()} credits
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(data.overallStats.successRate * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <UsageChart
        data={data.timeSeriesData}
        granularity={data.filters.granularity}
      />

      <Card>
        <CardHeader>
          <CardTitle>Top Users by Cost</CardTitle>
        </CardHeader>
        <CardContent>
          {data.userBreakdown.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No user data available for the selected time period
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">User</th>
                    <th className="text-right p-2">Requests</th>
                    <th className="text-right p-2">Cost</th>
                    <th className="text-right p-2">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.userBreakdown.map((user) => (
                    <tr key={user.userId} className="border-b">
                      <td className="p-2">
                        <div>{user.userName || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">
                          {user.userEmail}
                        </div>
                      </td>
                      <td className="text-right p-2">
                        {user.totalRequests.toLocaleString()}
                      </td>
                      <td className="text-right p-2">
                        {user.totalCost.toLocaleString()}
                      </td>
                      <td className="text-right p-2">
                        {(user.inputTokens + user.outputTokens).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
