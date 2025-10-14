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
      logger.error(
        "[Credit Events Redis] Missing Redis credentials. Real-time credit updates will not work. " +
        "Set KV_REST_API_URL and KV_REST_API_TOKEN for serverless-compatible real-time updates."
      );
      this.enabled = false;
      return;
    }

    this.redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    this.enabled = true;
    logger.info("[Credit Events Redis] Redis Pub/Sub initialized for serverless credit events");
  }

  public static getInstance(): RedisCreditEventEmitter {
    if (!RedisCreditEventEmitter.instance) {
      RedisCreditEventEmitter.instance = new RedisCreditEventEmitter();
    }
    return RedisCreditEventEmitter.instance;
  }

  public async emitCreditUpdate(event: CreditUpdateEvent): Promise<void> {
    if (!this.enabled || !this.redis) {
      logger.warn("[Credit Events Redis] Redis not enabled, event not published");
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

      logger.debug(`[Credit Events Redis] Published event to ${channel}`, {
        organizationId: event.organizationId,
        delta: event.delta,
        newBalance: event.newBalance,
      });
    } catch (error) {
      logger.error("[Credit Events Redis] Failed to publish event:", error);
    }
  }

  public async subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void | Promise<void>
  ): Promise<RedisSubscriptionClient> {
    if (!this.enabled || !this.redis) {
      logger.warn("[Credit Events Redis] Redis not enabled, subscription not created");
      return {
        organizationId,
        unsubscribe: async () => {
          logger.debug("[Credit Events Redis] No-op unsubscribe (Redis not enabled)");
        },
      };
    }

    const channel = `credits:${organizationId}`;

    const subscriptionRedis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });

    const processMessage = async (message: string) => {
      try {
        const parsed = JSON.parse(message);
        const event: CreditUpdateEvent = {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };

        logger.debug(`[Credit Events Redis] Received event on ${channel}`, event);
        await handler(event);
      } catch (error) {
        logger.error("[Credit Events Redis] Error processing message:", error);
      }
    };

    let isActive = true;

    const pollSubscription = async () => {
      while (isActive) {
        try {
          const messages = await subscriptionRedis.lrange(`${channel}:queue`, 0, -1);

          if (messages && messages.length > 0) {
            for (const message of messages) {
              if (typeof message === 'string') {
                await processMessage(message);
              }
            }
            await subscriptionRedis.del(`${channel}:queue`);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
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

    logger.info(`[Credit Events Redis] Subscribed to ${channel}`);

    return {
      organizationId,
      unsubscribe: async () => {
        isActive = false;
        this.decrementConnections(organizationId);
        logger.info(`[Credit Events Redis] Unsubscribed from ${channel}`);
      },
    };
  }

  public incrementConnections(organizationId: string): void {
    const count = this.activeSubscriptions.get(organizationId) || 0;
    this.activeSubscriptions.set(organizationId, count + 1);
    logger.info(
      `[Credit Events Redis] Active connections for org ${organizationId}: ${count + 1}`
    );
  }

  public decrementConnections(organizationId: string): void {
    const count = this.activeSubscriptions.get(organizationId) || 0;
    const newCount = Math.max(0, count - 1);
    this.activeSubscriptions.set(organizationId, newCount);

    if (newCount === 0) {
      this.activeSubscriptions.delete(organizationId);
    }

    logger.info(
      `[Credit Events Redis] Active connections for org ${organizationId}: ${newCount}`
    );
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
      ([id, connections]) => ({ id, connections })
    );

    return {
      enabled: this.enabled,
      totalOrganizations: this.activeSubscriptions.size,
      totalConnections: organizations.reduce((sum, org) => sum + org.connections, 0),
      organizations,
    };
  }
}

export const redisCreditEventEmitter = RedisCreditEventEmitter.getInstance();
