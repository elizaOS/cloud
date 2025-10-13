import { EventEmitter } from "events";
import { logger } from "@/lib/utils/logger";

export interface CreditUpdateEvent {
  organizationId: string;
  newBalance: number;
  delta: number;
  reason: string;
  userId?: string;
  timestamp: Date;
}

interface ListenerMetadata {
  lastActivity: number;
  createdAt: number;
}

/**
 * Credit Event Emitter with auto-cleanup for stale listeners
 *
 * Memory Leak Protection: Automatically removes inactive listeners
 * See ANALYTICS_PR_REVIEW_ANALYSIS.md - Issue #5 (Fixed)
 */
class CreditEventEmitter extends EventEmitter {
  private static instance: CreditEventEmitter;
  private activeConnections = new Map<string, number>();
  private listenerMetadata = new Map<string, ListenerMetadata>();
  private cleanupInterval: NodeJS.Timeout;

  // Configuration
  private readonly STALE_THRESHOLD = 600000; // 10 minutes
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  private constructor() {
    super();
    this.setMaxListeners(1000);

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleListeners();
    }, this.CLEANUP_INTERVAL);

    logger.info(
      `[Credit Events] Auto-cleanup enabled (stale threshold: ${this.STALE_THRESHOLD}ms, interval: ${this.CLEANUP_INTERVAL}ms)`
    );
  }

  public static getInstance(): CreditEventEmitter {
    if (!CreditEventEmitter.instance) {
      CreditEventEmitter.instance = new CreditEventEmitter();
    }
    return CreditEventEmitter.instance;
  }

  public emitCreditUpdate(event: CreditUpdateEvent): void {
    const channel = `credits:${event.organizationId}`;
    logger.debug(`[Credit Events] Emitting event on channel ${channel}`, event);

    // Update last activity for all listeners on this channel
    const listeners = this.listeners(channel) as Array<(event: CreditUpdateEvent) => void>;
    listeners.forEach((listener) => {
      const listenerId = this.getListenerId(channel, listener);
      const metadata = this.listenerMetadata.get(listenerId);
      if (metadata) {
        metadata.lastActivity = Date.now();
      }
    });

    this.emit(channel, event);
  }

  public subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void
  ): () => void {
    const channel = `credits:${organizationId}`;
    const listenerId = this.getListenerId(channel, handler);

    // Track this listener
    this.listenerMetadata.set(listenerId, {
      lastActivity: Date.now(),
      createdAt: Date.now(),
    });

    this.on(channel, handler);

    logger.debug(
      `[Credit Events] Subscribed to ${channel} (total listeners: ${this.listenerCount(channel)})`
    );

    return () => {
      this.off(channel, handler);
      this.listenerMetadata.delete(listenerId);
      logger.debug(
        `[Credit Events] Unsubscribed from ${channel} (remaining: ${this.listenerCount(channel)})`
      );
    };
  }

  /**
   * Clean up stale listeners that haven't been active
   */
  private cleanupStaleListeners(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // Collect stale listener IDs
    const staleListenerIds: string[] = [];

    for (const [listenerId, metadata] of this.listenerMetadata.entries()) {
      const inactiveDuration = now - metadata.lastActivity;

      if (inactiveDuration > this.STALE_THRESHOLD) {
        staleListenerIds.push(listenerId);
      }
    }

    // Clean up stale listeners
    for (const listenerId of staleListenerIds) {
      const channel = this.getChannelFromListenerId(listenerId);
      if (channel) {
        // Remove all listeners for this channel if any are stale
        // This is a conservative approach to prevent memory leaks
        const listenerCount = this.listenerCount(channel);
        const metadata = this.listenerMetadata.get(listenerId);
        const inactiveDuration = metadata ? now - metadata.lastActivity : 0;

        this.removeAllListeners(channel);
        this.listenerMetadata.delete(listenerId);
        cleanedCount++;

        logger.warn(
          `[Credit Events] Cleaned up stale listener on ${channel} ` +
          `(removed ${listenerCount} listeners, inactive for ${Math.round(inactiveDuration / 1000)}s)`
        );
      }
    }

    if (cleanedCount > 0) {
      logger.info(
        `[Credit Events] Cleanup completed: removed ${cleanedCount} stale channels ` +
        `(total remaining: ${this.listenerMetadata.size})`
      );
    }
  }

  /**
   * Generate unique ID for a listener
   */
  private getListenerId(
    channel: string,
    listener: (event: CreditUpdateEvent) => void
  ): string {
    return `${channel}:${listener.toString().substring(0, 50)}:${Date.now()}`;
  }

  /**
   * Extract channel from listener ID
   */
  private getChannelFromListenerId(listenerId: string): string | null {
    const parts = listenerId.split(":");
    return parts.length > 0 ? parts[0] : null;
  }

  public incrementConnections(organizationId: string): void {
    const count = this.activeConnections.get(organizationId) || 0;
    this.activeConnections.set(organizationId, count + 1);
    logger.info(
      `[Credit Events] Active connections for org ${organizationId}: ${count + 1}`
    );
  }

  public decrementConnections(organizationId: string): void {
    const count = this.activeConnections.get(organizationId) || 0;
    this.activeConnections.set(organizationId, Math.max(0, count - 1));
    logger.info(
      `[Credit Events] Active connections for org ${organizationId}: ${count - 1}`
    );
  }

  public getActiveConnections(organizationId: string): number {
    return this.activeConnections.get(organizationId) || 0;
  }

  /**
   * Get listener statistics for monitoring
   */
  public getListenerStats(): {
    totalListeners: number;
    staleListeners: number;
    activeChannels: string[];
    oldestListener: number | null;
  } {
    const now = Date.now();
    let staleCount = 0;
    let oldestTimestamp: number | null = null;

    for (const metadata of this.listenerMetadata.values()) {
      const inactiveDuration = now - metadata.lastActivity;

      if (inactiveDuration > this.STALE_THRESHOLD) {
        staleCount++;
      }

      if (!oldestTimestamp || metadata.createdAt < oldestTimestamp) {
        oldestTimestamp = metadata.createdAt;
      }
    }

    return {
      totalListeners: this.listenerMetadata.size,
      staleListeners: staleCount,
      activeChannels: this.eventNames() as string[],
      oldestListener: oldestTimestamp,
    };
  }

  /**
   * Force cleanup of all stale listeners (for testing/debugging)
   */
  public forceCleanup(): void {
    logger.info("[Credit Events] Force cleanup triggered");
    this.cleanupStaleListeners();
  }

  /**
   * Cleanup on shutdown
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info("[Credit Events] Cleanup interval stopped");
    }
  }
}

export const creditEventEmitter = CreditEventEmitter.getInstance();
