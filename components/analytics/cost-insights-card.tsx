import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AnalyticsData } from "@/lib/actions/analytics";
import { CostAlerts } from "@/components/analytics/cost-alerts";

interface CostInsightsCardProps {
  costTrending: AnalyticsData["costTrending"];
  creditBalance: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function CostInsightsCard({
  costTrending,
  creditBalance,
}: CostInsightsCardProps) {
  const numericBalance = Number(creditBalance);
  const projectedSpendPercent =
    numericBalance > 0
      ? Math.min(100, (costTrending.projectedMonthlyBurn / numericBalance) * 100)
      : 0;

  const runwayLabel =
    costTrending.daysUntilBalanceZero === null
      ? "Stable burn"
      : costTrending.daysUntilBalanceZero <= 1
        ? "< 1 day"
        : `${costTrending.daysUntilBalanceZero} days`;

  const changeTone =
    costTrending.burnChangePercent > 5
      ? "up"
      : costTrending.burnChangePercent < -5
        ? "down"
        : "neutral";

  return (
    <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent shadow-md dark:from-amber-500/10">
      <CardHeader className="gap-3 p-6 pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base font-semibold">
            Cost outlook
          </CardTitle>
          <Badge
            variant="outline"
            className="border-transparent bg-white/40 text-xs font-medium uppercase tracking-wide text-amber-600 dark:bg-amber-500/20 dark:text-amber-200"
          >
            Burn rate
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Monitor credit runway, relative spend, and burn velocity for the
          selected window.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-7 p-6 pt-4">
        <div className="grid gap-5">
          <div className="grid gap-3 rounded-xl border border-amber-500/20 bg-background/70 p-5 text-sm shadow-inner">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                  Daily burn (last 24h)
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {currencyFormatter.format(costTrending.currentDailyBurn)}
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-transparent bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-200"
              >
                {costTrending.burnChangePercent > 0 ? "+" : ""}
                {costTrending.burnChangePercent.toFixed(1)}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Compared to previous 24h window —{" "}
              {changeTone === "up"
                ? "accelerating usage"
                : changeTone === "down"
                  ? "downward trend"
                  : "stable throughput"}
              .
            </p>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/80">
              <span>Projected monthly spend</span>
              <span>
                {currencyFormatter.format(costTrending.projectedMonthlyBurn)}
              </span>
            </div>
            <Progress value={projectedSpendPercent} />
            <p className="text-xs text-muted-foreground">
              {projectedSpendPercent.toFixed(0)}% of current balance (
              {currencyFormatter.format(creditBalance)} on hand)
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm sm:gap-5">
            <div className="rounded-xl border border-amber-500/20 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                Balance runway
              </p>
              <p className="text-lg font-semibold text-foreground">
                {runwayLabel}
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                Previous daily burn
              </p>
              <p className="text-lg font-semibold text-foreground">
                {currencyFormatter.format(costTrending.previousDailyBurn)}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
            Alerts & recommendations
          </p>
          <CostAlerts
            costTrending={costTrending}
            creditBalance={creditBalance}
          />
        </div>
      </CardContent>
    </Card>
  );
}
