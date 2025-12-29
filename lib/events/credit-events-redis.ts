/**
 * DWS Cache-backed credit event emitter for serverless environments.
 *
 * Uses DWS cache queues to coordinate credit update events across multiple serverless instances.
 */

import { DWSCache } from "@/lib/services/dws/cache";
import { logger } from "@/lib/utils/logger";

/**
 * Credit update event structure.
 */
export interface CreditUpdateEvent {
  organizationId: string;
  newBalance: number;
  delta: number;
  reason: string;
  userId?: string;
  timestamp: Date;
}

/**
 * Raw event data from cache before timestamp conversion
 */
interface RawCreditUpdateEvent {
  organizationId: string;
  newBalance: number;
  delta: number;
  reason: string;
  userId?: string;
  timestamp: string;
}

/**
 * Type guard to check if a value is a valid RawCreditUpdateEvent
 */
function isRawCreditUpdateEvent(value: unknown): value is RawCreditUpdateEvent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.organizationId === "string" &&
    typeof obj.newBalance === "number" &&
    typeof obj.delta === "number" &&
    typeof obj.reason === "string" &&
    typeof obj.timestamp === "string"
  );
}

/**
 * Subscription client for credit updates.
 */
export interface RedisSubscriptionClient {
  /** Unsubscribe from credit updates. */
  unsubscribe: () => Promise<void>;
  /** Organization ID being subscribed to. */
  organizationId: string;
}

/**
 * DWS Cache-backed credit event emitter for distributed environments.
 */
class RedisCreditEventEmitter {
  private static instance: RedisCreditEventEmitter;
  private dwsCache: DWSCache | null = null;
  private enabled: boolean = false;
  private activeSubscriptions = new Map<string, number>();

  private constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (process.env.CACHE_ENABLED === "false") {
      this.enabled = false;
      return;
    }

    try {
      this.dwsCache = new DWSCache({
        namespace: "credit-events",
        defaultTTL: 300,
      });
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  public static getInstance(): RedisCreditEventEmitter {
    if (!RedisCreditEventEmitter.instance) {
      RedisCreditEventEmitter.instance = new RedisCreditEventEmitter();
    }
    return RedisCreditEventEmitter.instance;
  }

  public async emitCreditUpdate(event: CreditUpdateEvent): Promise<void> {
    if (!this.enabled || !this.dwsCache) {
      return;
    }

    const channel = `credits:${event.organizationId}:queue`;
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString(),
    });

    await this.dwsCache.rpush(channel, message);
    await this.dwsCache.expire(channel, 300);
  }

  public async subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void | Promise<void>,
  ): Promise<RedisSubscriptionClient> {
    if (!this.enabled || !this.dwsCache) {
      return {
        organizationId,
        unsubscribe: async () => {
          // No-op
        },
      };
    }

    const channel = `credits:${organizationId}`;

    const subscriptionCache = new DWSCache({
      namespace: "credit-events",
      defaultTTL: 300,
    });

    const processMessage = async (
      message: string | Record<string, unknown>,
    ) => {
      let parsed: unknown;
      if (typeof message === "string") {
        parsed = JSON.parse(message);
      } else if (typeof message === "object" && message !== null) {
        parsed = message;
      } else {
        return;
      }

      if (!isRawCreditUpdateEvent(parsed)) {
        logger.warn("[Credit Events] Invalid event format:", parsed);
        return;
      }

      const event: CreditUpdateEvent = {
        organizationId: parsed.organizationId,
        newBalance: parsed.newBalance,
        delta: parsed.delta,
        reason: parsed.reason,
        userId: parsed.userId,
        timestamp: new Date(parsed.timestamp),
      };

      await handler(event);
    };

    let isActive = true;

    const pollSubscription = async () => {
      const queueKey = `${channel}:queue`;

      while (isActive) {
        const messages = await subscriptionCache.lrange(queueKey, 0, -1);

        if (messages && messages.length > 0) {
          for (const message of messages) {
            await processMessage(message);
          }
          await subscriptionCache.del(queueKey);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };

    pollSubscription();

    this.incrementConnections(organizationId);

    return {
      organizationId,
      unsubscribe: async () => {
        isActive = false;
        this.decrementConnections(organizationId);
      },
    };
  }

  public incrementConnections(organizationId: string): void {
    const count = this.activeSubscriptions.get(organizationId) || 0;
    this.activeSubscriptions.set(organizationId, count + 1);
  }

  public decrementConnections(organizationId: string): void {
    const count = this.activeSubscriptions.get(organizationId) || 0;
    const newCount = Math.max(0, count - 1);
    this.activeSubscriptions.set(organizationId, newCount);

    if (newCount === 0) {
      this.activeSubscriptions.delete(organizationId);
    }
  }

  public getActiveConnections(organizationId: string): number {
    return this.activeSubscriptions.get(organizationId) || 0;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getStats(): {
    enabled: boolean;
    totalOrganizations: number;
    totalConnections: number;
    organizations: Array<{ id: string; connections: number }>;
  } {
    const organizations = Array.from(this.activeSubscriptions.entries()).map(
      ([id, connections]) => ({ id, connections }),
    );

    return {
      enabled: this.enabled,
      totalOrganizations: this.activeSubscriptions.size,
      totalConnections: organizations.reduce(
        (sum, org) => sum + org.connections,
        0,
      ),
      organizations,
    };
  }
}

export const redisCreditEventEmitter = RedisCreditEventEmitter.getInstance();
