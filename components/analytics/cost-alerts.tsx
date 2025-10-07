import { AlertTriangle, TrendingDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CostAlertsProps {
  costTrending: {
    currentDailyBurn: number;
    burnChangePercent: number;
    daysUntilBalanceZero: number | null;
    projectedMonthlyBurn: number;
  };
  creditBalance: number;
}

export function CostAlerts({ costTrending, creditBalance }: CostAlertsProps) {
  const alerts: Array<{
    type: "warning" | "error" | "info";
    title: string;
    description: string;
  }> = [];

  if (
    costTrending.daysUntilBalanceZero !== null &&
    costTrending.daysUntilBalanceZero < 7
  ) {
    alerts.push({
      type: "error",
      title: "Low Credit Balance",
      description: `Your organization will run out of credits in ${costTrending.daysUntilBalanceZero} days at current burn rate. Consider purchasing more credits.`,
    });
  }

  if (costTrending.burnChangePercent > 50) {
    alerts.push({
      type: "warning",
      title: "Burn Rate Increased",
      description: `Your daily burn rate increased by ${costTrending.burnChangePercent.toFixed(0)}% compared to yesterday. Monitor usage closely.`,
    });
  }

  if (costTrending.projectedMonthlyBurn > creditBalance * 0.8) {
    alerts.push({
      type: "warning",
      title: "High Projected Monthly Cost",
      description: `At current burn rate, you'll spend ${costTrending.projectedMonthlyBurn.toLocaleString()} credits this month, which is ${((costTrending.projectedMonthlyBurn / creditBalance) * 100).toFixed(0)}% of your current balance.`,
    });
  }

  if (alerts.length === 0) {
    return (
      <Alert>
        <TrendingDown className="h-4 w-4" />
        <AlertTitle>All Good</AlertTitle>
        <AlertDescription>
          Your usage is within normal parameters. No alerts at this time.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, i) => (
        <Alert
          key={i}
          variant={alert.type === "error" ? "destructive" : "default"}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>{alert.description}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
