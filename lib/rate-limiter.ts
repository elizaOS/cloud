interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      60 * 1000,
    );
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (entry.resetAt < now) {
        this.requests.delete(key);
      }
    }
  }

  check(key: string, limit: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || entry.resetAt < now) {
      const resetAt = now + windowMs;
      this.requests.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

export const rateLimiter = new RateLimiter();

export const RATE_LIMITS = {
  CHECKOUT_SESSION: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  },
};
