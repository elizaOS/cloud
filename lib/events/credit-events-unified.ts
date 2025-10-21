import { EventEmitter } from "events";
import { logger } from "@/lib/utils/logger";
import { redisCreditEventEmitter } from "./credit-events-redis";
import type { CreditUpdateEvent } from "./credit-events-redis";

export type { CreditUpdateEvent };

export type UnsubscribeFunction = () => void;

class UnifiedCreditEventEmitter {
  private static instance: UnifiedCreditEventEmitter;
  private inMemoryEmitter: EventEmitter | null = null;
  private lastEnvCheck: { useRedis: boolean; timestamp: number } | null = null;
  private initLogged: boolean = false;

  private constructor() {
    // Defer initialization until first use
  }

  public static getInstance(): UnifiedCreditEventEmitter {
    if (!UnifiedCreditEventEmitter.instance) {
      UnifiedCreditEventEmitter.instance = new UnifiedCreditEventEmitter();
    }
    return UnifiedCreditEventEmitter.instance;
  }

  /**
   * Check if we should use Redis at runtime
   * This checks environment variables on every call to handle
   * hot reloading and module caching issues in development
   */
  private shouldUseRedis(): boolean {
    // Check environment variables at runtime
    const isServerless =
      process.env.VERCEL === "1" ||
      process.env.NODE_ENV === "production" ||
      process.env.FORCE_REDIS_EVENTS === "true";

    const redisConfigured = !!(
      process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    );

    const useRedis = isServerless && redisConfigured;

    // Log initialization once per state change
    if (
      !this.initLogged ||
      (this.lastEnvCheck && this.lastEnvCheck.useRedis !== useRedis)
    ) {
      if (isServerless && !redisConfigured) {
        logger.error(
          "[Credit Events] 🚨 SERVERLESS DETECTED but Redis not configured! " +
            "Real-time credit updates will NOT work across instances. " +
            "Set KV_REST_API_URL and KV_REST_API_TOKEN immediately.",
        );
      }

      if (useRedis) {
        logger.info(
          "[Credit Events] ✓ Using Redis Pub/Sub for serverless-compatible real-time updates",
        );
      } else {
        if (!this.inMemoryEmitter) {
          this.inMemoryEmitter = new EventEmitter();
        }
        logger.warn(
          "[Credit Events] ⚠️  Using in-memory EventEmitter (development mode). " +
            "This will NOT work in multi-instance serverless deployments. " +
            "Set FORCE_REDIS_EVENTS=true to test with Redis locally.",
        );
      }
      this.initLogged = true;
    }

    // Cache the decision for this run
    this.lastEnvCheck = { useRedis, timestamp: Date.now() };

    // Ensure in-memory emitter exists if we need it
    if (!useRedis && !this.inMemoryEmitter) {
      this.inMemoryEmitter = new EventEmitter();
    }

    return useRedis;
  }

  public async emitCreditUpdate(event: CreditUpdateEvent): Promise<void> {
    const useRedis = this.shouldUseRedis();

    if (useRedis) {
      await redisCreditEventEmitter.emitCreditUpdate(event);
    } else if (this.inMemoryEmitter) {
      this.inMemoryEmitter.emit("credit-update", event);
      logger.debug("[Credit Events] Event emitted to in-memory listeners", {
        organizationId: event.organizationId,
        delta: event.delta,
        newBalance: event.newBalance,
      });
    }
  }

  public subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void | Promise<void>,
  ): UnsubscribeFunction {
    const useRedis = this.shouldUseRedis();

    if (useRedis) {
      redisCreditEventEmitter
        .subscribeToCreditUpdates(organizationId, handler)
        .then(() => {
          // Redis subscription is async, but we return sync unsubscribe
        })
        .catch((error) => {
          logger.error(
            "[Credit Events] Failed to create Redis subscription:",
            error,
          );
        });

      // Return sync unsubscribe function
      return () => {
        // Unsubscribe is handled by Redis cleanup
      };
    } else if (this.inMemoryEmitter) {
      const listener = (event: CreditUpdateEvent) => {
        if (event.organizationId === organizationId) {
          handler(event);
        }
      };

      this.inMemoryEmitter.on("credit-update", listener);
      logger.info(
        `[Credit Events] In-memory subscription created for org ${organizationId} ` +
          "(development mode - works only in single instance)",
      );

      return () => {
        this.inMemoryEmitter?.off("credit-update", listener);
        logger.debug(
          `[Credit Events] In-memory subscription ended for org ${organizationId}`,
        );
      };
    } else {
      logger.error(
        `[Credit Events] No event system available for org ${organizationId}`,
      );
      return () => {};
    }
  }

  public incrementConnections(organizationId: string): void {
    if (this.shouldUseRedis()) {
      redisCreditEventEmitter.incrementConnections(organizationId);
    }
  }

  public decrementConnections(organizationId: string): void {
    if (this.shouldUseRedis()) {
      redisCreditEventEmitter.decrementConnections(organizationId);
    }
  }

  public getActiveConnections(organizationId: string): number {
    if (this.shouldUseRedis()) {
      return redisCreditEventEmitter.getActiveConnections(organizationId);
    }
    return 0;
  }

  public isServerlessCompatible(): boolean {
    return this.shouldUseRedis();
  }

  public getStats(): {
    mode: "redis" | "in-memory";
    serverlessCompatible: boolean;
    details: unknown;
  } {
    if (this.shouldUseRedis()) {
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
