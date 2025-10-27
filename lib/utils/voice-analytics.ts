/**
 * Voice Analytics Utility Functions
 * Helper functions for calculating voice usage statistics and trends
 */

export type PeriodType = "day" | "week" | "month" | "year" | "all";
export type TrendDirection = "up" | "down" | "stable";

export interface DateRange {
  start: Date;
  end: Date;
  days: number;
}

export interface UsageTrend {
  direction: TrendDirection;
  percentage: number;
}

export interface DailyUsage {
  date: string;
  calls: number;
  characters: number;
}

/**
 * Calculate date range based on period type
 */
export function getDateRangeForPeriod(
  period: PeriodType,
  customStart?: string,
  customEnd?: string
): DateRange {
  const now = new Date();
  let startDate: Date;

  if (customStart) {
    startDate = new Date(customStart);
  } else {
    switch (period) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        startDate = new Date(0); // Unix epoch
        break;
      default:
        // month
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  const endDate = customEnd ? new Date(customEnd) : now;
  const days = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  return { start: startDate, end: endDate, days };
}

/**
 * Calculate usage trend from daily breakdown
 * Compares first half vs second half of the period
 */
export function calculateUsageTrend(dailyUsage: DailyUsage[]): UsageTrend {
  if (dailyUsage.length < 2) {
    return { direction: "stable", percentage: 0 };
  }

  const midpoint = Math.floor(dailyUsage.length / 2);
  const firstHalf = dailyUsage.slice(0, midpoint);
  const secondHalf = dailyUsage.slice(midpoint);

  const firstHalfAvg =
    firstHalf.reduce((sum, d) => sum + d.calls, 0) / firstHalf.length;
  const secondHalfAvg =
    secondHalf.reduce((sum, d) => sum + d.calls, 0) / secondHalf.length;

  // Consider 10% threshold for "stable"
  const threshold = 0.1;

  if (secondHalfAvg > firstHalfAvg * (1 + threshold)) {
    const percentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    return { direction: "up", percentage };
  }

  if (secondHalfAvg < firstHalfAvg * (1 - threshold)) {
    const percentage = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
    return { direction: "down", percentage };
  }

  return { direction: "stable", percentage: 0 };
}

/**
 * Format usage count for display
 */
export function formatUsageCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Calculate average calls per day
 */
export function calculateAvgCallsPerDay(
  totalCalls: number,
  periodDays: number
): number {
  return Math.round((totalCalls / Math.max(1, periodDays)) * 10) / 10;
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 1000) / 10; // 1 decimal place
}

/**
 * Get period label for display
 */
export function getPeriodLabel(period: PeriodType): string {
  switch (period) {
    case "day":
      return "Last 24 Hours";
    case "week":
      return "Last 7 Days";
    case "month":
      return "Last 30 Days";
    case "year":
      return "Last 365 Days";
    case "all":
      return "All Time";
    default:
      return "Custom Period";
  }
}

/**
 * Estimate cost based on usage
 * Can be used for future pricing models
 */
export function estimateUsageCost(
  characterCount: number,
  creditsPerCharacter = 0.01
): number {
  return Math.round(characterCount * creditsPerCharacter);
}

/**
 * Check if voice is underutilized
 */
export function isVoiceUnderutilized(
  voice: {
    usageCount: number;
    createdAt: Date | string;
    lastUsedAt: Date | string | null;
  },
  threshold = 10
): boolean {
  const daysSinceCreation =
    (Date.now() - new Date(voice.createdAt).getTime()) / (24 * 60 * 60 * 1000);

  // Voice is underutilized if:
  // 1. Created more than 7 days ago AND
  // 2. Used less than threshold times
  return daysSinceCreation > 7 && voice.usageCount < threshold;
}

/**
 * Check if voice has unusual activity
 */
export function hasUnusualActivity(
  recentCalls: number,
  avgCallsPerDay: number,
  threshold = 3
): boolean {
  // Flag as unusual if recent activity is 3x the average
  return recentCalls > avgCallsPerDay * threshold;
}

/**
 * Format character count for display
 */
export function formatCharacterCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M chars`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K chars`;
  }
  return `${count} chars`;
}

/**
 * Calculate ROI for professional voice
 */
export function calculateVoiceROI(voice: {
  cloneType: "instant" | "professional";
  creationCost: number;
  usageCount: number;
}): {
  creationCost: number;
  avgCostPerUse: number;
  isWorthIt: boolean;
} {
  const avgCostPerUse =
    voice.usageCount > 0
      ? voice.creationCost / voice.usageCount
      : Number.POSITIVE_INFINITY;

  // Professional voice is "worth it" if used more than 10 times
  // (5000 credits / 10 uses = 500 credits per use, which is reasonable)
  const isWorthIt =
    voice.cloneType === "instant" ||
    (voice.cloneType === "professional" && voice.usageCount >= 10);

  return {
    creationCost: voice.creationCost,
    avgCostPerUse,
    isWorthIt,
  };
}
