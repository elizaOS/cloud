import { logger } from "@/lib/utils/logger";
import { redisCreditEventEmitter } from "./credit-events-redis";
import type { CreditUpdateEvent, RedisSubscriptionClient } from "./credit-events-redis";

export type { CreditUpdateEvent };

export interface UnifiedSubscriptionClient {
  unsubscribe: () => Promise<void>;
  organizationId: string;
}

class UnifiedCreditEventEmitter {
  private static instance: UnifiedCreditEventEmitter;
  private useRedis: boolean = false;

  private constructor() {
    const isServerless = process.env.VERCEL === "1" ||
                        process.env.NODE_ENV === "production" ||
                        process.env.FORCE_REDIS_EVENTS === "true";

    const redisConfigured = !!(
      process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN
    );

    this.useRedis = isServerless && redisConfigured;

    if (isServerless && !redisConfigured) {
      logger.error(
        "[Credit Events] 🚨 SERVERLESS DETECTED but Redis not configured! " +
        "Real-time credit updates will NOT work across instances. " +
        "Set KV_REST_API_URL and KV_REST_API_TOKEN immediately."
      );
    }

    if (this.useRedis) {
      logger.info("[Credit Events] ✓ Using Redis Pub/Sub for serverless-compatible real-time updates");
    } else {
      logger.warn(
        "[Credit Events] ⚠️  Using in-memory EventEmitter (development mode). " +
        "This will NOT work in multi-instance serverless deployments."
      );
    }
  }

  public static getInstance(): UnifiedCreditEventEmitter {
    if (!UnifiedCreditEventEmitter.instance) {
      UnifiedCreditEventEmitter.instance = new UnifiedCreditEventEmitter();
    }
    return UnifiedCreditEventEmitter.instance;
  }

  public async emitCreditUpdate(event: CreditUpdateEvent): Promise<void> {
    if (this.useRedis) {
      await redisCreditEventEmitter.emitCreditUpdate(event);
    } else {
      logger.debug("[Credit Events] Event emitted (in-memory mode, not cross-instance)", {
        organizationId: event.organizationId,
        delta: event.delta,
      });
    }
  }

  public async subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void | Promise<void>
  ): Promise<UnifiedSubscriptionClient> {
    if (this.useRedis) {
      const subscription = await redisCreditEventEmitter.subscribeToCreditUpdates(
        organizationId,
        handler
      );
      return {
        organizationId: subscription.organizationId,
        unsubscribe: subscription.unsubscribe,
      };
    } else {
      logger.warn(
        `[Credit Events] Creating in-memory subscription for org ${organizationId}. ` +
        "This will NOT receive events from other serverless instances."
      );
      return {
        organizationId,
        unsubscribe: async () => {
          logger.debug(`[Credit Events] In-memory subscription ended for org ${organizationId}`);
        },
      };
    }
  }

  public incrementConnections(organizationId: string): void {
    if (this.useRedis) {
      redisCreditEventEmitter.incrementConnections(organizationId);
    }
  }

  public decrementConnections(organizationId: string): void {
    if (this.useRedis) {
      redisCreditEventEmitter.decrementConnections(organizationId);
    }
  }

  public getActiveConnections(organizationId: string): number {
    if (this.useRedis) {
      return redisCreditEventEmitter.getActiveConnections(organizationId);
    }
    return 0;
  }

  public isServerlessCompatible(): boolean {
    return this.useRedis;
  }

  public getStats(): {
    mode: "redis" | "in-memory";
    serverlessCompatible: boolean;
    details: unknown;
  } {
    if (this.useRedis) {
      return {
        mode: "redis",
        serverlessCompatible: true,
        details: redisCreditEventEmitter.getStats(),
      };
    }

    return {
      mode: "in-memory",
      serverlessCompatible: false,
      details: {
        warning: "In-memory mode - not suitable for multi-instance serverless",
      },
    };
  }
}

export const creditEventEmitter = UnifiedCreditEventEmitter.getInstance();
