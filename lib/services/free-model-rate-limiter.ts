import { freeModelUsageRepository, modelCategoriesRepository } from "@/db/repositories";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  resetAt?: Date;
  currentUsage?: number;
  limit?: number;
}

export class FreeModelRateLimiter {
  async checkLimit(params: {
    userId: string;
    organizationId: string;
    model: string;
    provider: string;
  }): Promise<RateLimitResult> {
    const category = await modelCategoriesRepository.findByModel(
      params.model,
      params.provider
    );

    if (!category) {
      return { allowed: true };
    }

    if (category.rate_limit_per_minute) {
      const minuteUsage = await freeModelUsageRepository.getUsageCount({
        userId: params.userId,
        model: params.model,
        provider: params.provider,
        timeWindow: "minute",
      });

      if (minuteUsage >= category.rate_limit_per_minute) {
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${category.rate_limit_per_minute} requests per minute for free model ${params.model}`,
          resetAt: this.getNextMinuteReset(),
          currentUsage: minuteUsage,
          limit: category.rate_limit_per_minute,
        };
      }
    }

    if (category.rate_limit_per_day) {
      const dayUsage = await freeModelUsageRepository.getUsageCount({
        userId: params.userId,
        model: params.model,
        provider: params.provider,
        timeWindow: "day",
      });

      if (dayUsage >= category.rate_limit_per_day) {
        return {
          allowed: false,
          reason: `Daily limit exceeded: ${category.rate_limit_per_day} requests per day for free model ${params.model}`,
          resetAt: this.getNextDayReset(),
          currentUsage: dayUsage,
          limit: category.rate_limit_per_day,
        };
      }
    }

    return { allowed: true };
  }

  private getNextMinuteReset(): Date {
    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    return next;
  }

  private getNextDayReset(): Date {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 1);
    return next;
  }

  async trackUsage(params: {
    organizationId: string;
    userId: string;
    model: string;
    provider: string;
    requestCount?: number;
    tokenCount?: number;
  }): Promise<void> {
    await freeModelUsageRepository.incrementUsage(params);
  }
}

export const freeModelRateLimiter = new FreeModelRateLimiter();
