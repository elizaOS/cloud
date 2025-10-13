import type { TimeSeriesDataPoint } from "@/lib/services";

export interface ProjectionDataPoint {
  timestamp: Date;
  totalRequests: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  successRate: number;
  isProjected: boolean;
  confidence?: number;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
}

export interface ProjectionAlert {
  type: "warning" | "danger" | "info";
  title: string;
  message: string;
  projectedValue?: number;
  projectedDate?: Date;
}

export function calculateLinearRegression(
  values: number[]
): LinearRegressionResult {
  const n = values.length;
  if (n < 2) {
    return { slope: 0, intercept: values[0] || 0 };
  }

  const sumX = values.reduce((sum, _, i) => sum + i, 0);
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
  const sumXX = values.reduce((sum, _, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function generateProjections(
  historicalData: TimeSeriesDataPoint[],
  periods: number
): ProjectionDataPoint[] {
  if (historicalData.length < 3) {
    return historicalData.map((d) => ({ ...d, isProjected: false }));
  }

  const requestsRegression = calculateLinearRegression(
    historicalData.map((d) => d.totalRequests)
  );
  const costRegression = calculateLinearRegression(
    historicalData.map((d) => d.totalCost)
  );
  const inputTokensRegression = calculateLinearRegression(
    historicalData.map((d) => d.inputTokens)
  );
  const outputTokensRegression = calculateLinearRegression(
    historicalData.map((d) => d.outputTokens)
  );
  const successRateRegression = calculateLinearRegression(
    historicalData.map((d) => d.successRate)
  );

  const combined: ProjectionDataPoint[] = historicalData.map((d) => ({
    ...d,
    isProjected: false,
  }));

  const lastDate = historicalData[historicalData.length - 1].timestamp;
  const avgTimeDiff =
    historicalData.length > 1
      ? (historicalData[historicalData.length - 1].timestamp.getTime() -
          historicalData[0].timestamp.getTime()) /
        (historicalData.length - 1)
      : 24 * 60 * 60 * 1000;

  for (let i = 1; i <= periods; i++) {
    const futureIndex = historicalData.length + i - 1;

    const projectedRequests = Math.max(
      0,
      requestsRegression.intercept + requestsRegression.slope * futureIndex
    );
    const projectedCost = Math.max(
      0,
      costRegression.intercept + costRegression.slope * futureIndex
    );
    const projectedInputTokens = Math.max(
      0,
      inputTokensRegression.intercept + inputTokensRegression.slope * futureIndex
    );
    const projectedOutputTokens = Math.max(
      0,
      outputTokensRegression.intercept +
        outputTokensRegression.slope * futureIndex
    );
    const projectedSuccessRate = Math.min(
      1.0,
      Math.max(
        0,
        successRateRegression.intercept +
          successRateRegression.slope * futureIndex
      )
    );

    const variance = 0.1;
    const requestsVariance =
      projectedRequests * (1 + (Math.random() - 0.5) * variance);
    const costVariance = projectedCost * (1 + (Math.random() - 0.5) * variance);
    const inputTokensVariance =
      projectedInputTokens * (1 + (Math.random() - 0.5) * variance);
    const outputTokensVariance =
      projectedOutputTokens * (1 + (Math.random() - 0.5) * variance);

    const futureDate = new Date(lastDate.getTime() + avgTimeDiff * i);
    const confidence = Math.max(60, 90 - i * 3);

    combined.push({
      timestamp: futureDate,
      totalRequests: Math.round(requestsVariance),
      totalCost: Math.round(costVariance),
      inputTokens: Math.round(inputTokensVariance),
      outputTokens: Math.round(outputTokensVariance),
      successRate: projectedSuccessRate,
      isProjected: true,
      confidence,
    });
  }

  return combined;
}

export function generateProjectionAlerts(
  historicalData: TimeSeriesDataPoint[],
  projectedData: ProjectionDataPoint[],
  creditBalance: number
): ProjectionAlert[] {
  const alerts: ProjectionAlert[] = [];

  if (historicalData.length < 3) {
    return alerts;
  }

  const recentPeriods = historicalData.slice(-3);
  const avgRequests =
    recentPeriods.reduce((sum, d) => sum + d.totalRequests, 0) /
    recentPeriods.length;
  const avgCost =
    recentPeriods.reduce((sum, d) => sum + d.totalCost, 0) /
    recentPeriods.length;

  const projectedOnly = projectedData.filter((d) => d.isProjected);
  if (projectedOnly.length === 0) {
    return alerts;
  }

  const maxProjectedCost = Math.max(...projectedOnly.map((d) => d.totalCost));
  const costIncrease = avgCost > 0 ? ((maxProjectedCost - avgCost) / avgCost) * 100 : 0;

  if (costIncrease > 50) {
    alerts.push({
      type: "danger",
      title: "High Cost Projection",
      message: `Projected costs may increase by ${costIncrease.toFixed(0)}% in the coming period.`,
      projectedValue: maxProjectedCost,
    });
  } else if (costIncrease > 25) {
    alerts.push({
      type: "warning",
      title: "Moderate Cost Increase",
      message: `Projected costs may increase by ${costIncrease.toFixed(0)}% in the coming period.`,
      projectedValue: maxProjectedCost,
    });
  }

  const maxProjectedRequests = Math.max(
    ...projectedOnly.map((d) => d.totalRequests)
  );
  const requestIncrease =
    avgRequests > 0 ? ((maxProjectedRequests - avgRequests) / avgRequests) * 100 : 0;

  if (requestIncrease > 100) {
    alerts.push({
      type: "warning",
      title: "Usage Spike Predicted",
      message: `API requests may increase by ${requestIncrease.toFixed(0)}% based on current trends.`,
      projectedValue: maxProjectedRequests,
    });
  }

  const costRegression = calculateLinearRegression(
    historicalData.map((d) => d.totalCost)
  );
  if (costRegression.slope < -0.1) {
    alerts.push({
      type: "info",
      title: "Declining Usage Trend",
      message: "Current trends suggest decreasing API usage and costs.",
    });
  }

  const totalProjectedCost = projectedOnly.reduce(
    (sum, d) => sum + d.totalCost,
    0
  );
  if (totalProjectedCost > 100000) {
    alerts.push({
      type: "warning",
      title: "High Projected Spending",
      message: `Projected spending for the period: ${(totalProjectedCost / 100).toFixed(2)} credits`,
      projectedValue: totalProjectedCost,
    });
  }

  const avgDailyCost =
    historicalData.length > 0
      ? historicalData.reduce((sum, d) => sum + d.totalCost, 0) /
        historicalData.length
      : 0;
  if (avgDailyCost > 0 && creditBalance / avgDailyCost < 7) {
    const daysRemaining = Math.floor(creditBalance / avgDailyCost);
    alerts.push({
      type: "danger",
      title: "Low Credit Balance",
      message: `At current usage rates, credits will be depleted in approximately ${daysRemaining} days.`,
      projectedValue: creditBalance,
    });
  }

  return alerts;
}
