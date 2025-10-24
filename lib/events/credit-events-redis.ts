import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";

export interface CreditUpdateEvent {
  organizationId: string;
  newBalance: number;
  delta: number;
  reason: string;
  userId?: string;
  timestamp: Date;
}

export interface RedisSubscriptionClient {
  unsubscribe: () => Promise<void>;
  organizationId: string;
}

class RedisCreditEventEmitter {
  private static instance: RedisCreditEventEmitter;
  private redis: Redis | null = null;
  private enabled: boolean = false;
  private activeSubscriptions = new Map<string, number>();

  private constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      this.enabled = false;
      return;
    }

    this.redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    this.enabled = true;
  }

  public static getInstance(): RedisCreditEventEmitter {
    if (!RedisCreditEventEmitter.instance) {
      RedisCreditEventEmitter.instance = new RedisCreditEventEmitter();
    }
    return RedisCreditEventEmitter.instance;
  }

  public async emitCreditUpdate(event: CreditUpdateEvent): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    const channel = `credits:${event.organizationId}:queue`;
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString(),
    });

    try {
      await this.redis.rpush(channel, message);
      await this.redis.expire(channel, 300);
    } catch (error) {
      logger.error("[Credit Events Redis] Failed to publish event:", error);
    }
  }

  public async subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void | Promise<void>,
  ): Promise<RedisSubscriptionClient> {
    if (!this.enabled || !this.redis) {
      return {
        organizationId,
        unsubscribe: async () => {
          // No-op
        },
      };
    }

    const channel = `credits:${organizationId}`;

    const subscriptionRedis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });

    const processMessage = async (
      message: string | Record<string, unknown>,
    ) => {
      try {
        // Upstash Redis client auto-parses JSON, so message might already be an object
        let parsed: Record<string, unknown>;
        if (typeof message === "string") {
          parsed = JSON.parse(message);
        } else if (typeof message === "object" && message !== null) {
          parsed = message;
        } else {
          return;
        }

        const event = {
          ...(parsed as unknown as CreditUpdateEvent),
          timestamp: new Date(parsed.timestamp as string),
        } as CreditUpdateEvent;

        await handler(event);
      } catch (error) {
        logger.error("[Credit Events Redis] Error processing message:", error);
      }
    };

    let isActive = true;

    const pollSubscription = async () => {
      const queueKey = `${channel}:queue`;

      while (isActive) {
        try {
          const messages = await subscriptionRedis.lrange(queueKey, 0, -1);

          if (messages && messages.length > 0) {
            for (const message of messages) {
              await processMessage(message);
            }
            await subscriptionRedis.del(queueKey);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          if (isActive) {
            logger.error("[Credit Events Redis] Subscription error:", error);
          }
          break;
        }
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
