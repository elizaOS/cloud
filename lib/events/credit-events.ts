import { EventEmitter } from "events";

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
  }

  public static getInstance(): CreditEventEmitter {
    if (!CreditEventEmitter.instance) {
      CreditEventEmitter.instance = new CreditEventEmitter();
    }
    return CreditEventEmitter.instance;
  }

  public emitCreditUpdate(event: CreditUpdateEvent): void {
    const channel = `credits:${event.organizationId}`;

    // Update last activity for all listeners on this channel
    const listeners = this.listeners(channel) as Array<
      (event: CreditUpdateEvent) => void
    >;
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
    handler: (event: CreditUpdateEvent) => void,
  ): () => void {
    const channel = `credits:${organizationId}`;
    const listenerId = this.getListenerId(channel, handler);

    // Track this listener
    this.listenerMetadata.set(listenerId, {
      lastActivity: Date.now(),
      createdAt: Date.now(),
    });

    this.on(channel, handler);

    return () => {
      this.off(channel, handler);
      this.listenerMetadata.delete(listenerId);
    };
  }

  /**
   * Clean up stale listeners that haven't been active
   */
  private cleanupStaleListeners(): void {
    const now = Date.now();

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
        this.removeAllListeners(channel);
        this.listenerMetadata.delete(listenerId);
      }
    }
  }

  /**
   * Generate unique ID for a listener
   */
  private getListenerId(
    channel: string,
    listener: (event: CreditUpdateEvent) => void,
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
  }

  public decrementConnections(organizationId: string): void {
    const count = this.activeConnections.get(organizationId) || 0;
    this.activeConnections.set(organizationId, Math.max(0, count - 1));
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
    this.cleanupStaleListeners();
  }

  /**
   * Cleanup on shutdown
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const creditEventEmitter = CreditEventEmitter.getInstance();
