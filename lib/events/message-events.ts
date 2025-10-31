import { EventEmitter } from "events";
import { logger } from "@/lib/utils/logger";
import type { UUID } from "@elizaos/core";

export interface MessageEvent {
  roomId: string;
  messageId: string;
  entityId: string;
  agentId: string;
  content: {
    text: string;
    thought?: string;
    source?: string;
    inReplyTo?: string;
  };
  createdAt: number;
  isAgent: boolean;
  type: "user" | "agent" | "thinking" | "error";
}

interface ListenerMetadata {
  lastActivity: number;
  createdAt: number;
}

/**
 * Message Event Emitter for real-time Eliza chat updates
 * 
 * Follows the same pattern as CreditEventEmitter
 * Supports SSE streaming for instant message delivery
 */
class MessageEventEmitter extends EventEmitter {
  private static instance: MessageEventEmitter;
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
      `[Message Events] Auto-cleanup enabled (stale threshold: ${this.STALE_THRESHOLD}ms, interval: ${this.CLEANUP_INTERVAL}ms)`,
    );
  }

  public static getInstance(): MessageEventEmitter {
    if (!MessageEventEmitter.instance) {
      MessageEventEmitter.instance = new MessageEventEmitter();
    }
    return MessageEventEmitter.instance;
  }

  public emitMessage(event: MessageEvent): void {
    const channel = `messages:${event.roomId}`;
    logger.debug(`[Message Events] Emitting event on channel ${channel}`, {
      messageId: event.messageId,
      type: event.type,
    });

    // Update last activity for all listeners on this channel
    const listeners = this.listeners(channel) as Array<
      (event: MessageEvent) => void
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

  public subscribeToMessages(
    roomId: string,
    handler: (event: MessageEvent) => void,
  ): () => void {
    const channel = `messages:${roomId}`;
    const listenerId = this.getListenerId(channel, handler);

    // Track listener metadata
    this.listenerMetadata.set(listenerId, {
      lastActivity: Date.now(),
      createdAt: Date.now(),
    });

    this.on(channel, handler);

    logger.debug(`[Message Events] Subscribed to ${channel}`, {
      totalListeners: this.listenerCount(channel),
    });

    // Return unsubscribe function
    return () => {
      this.off(channel, handler);
      this.listenerMetadata.delete(listenerId);
      logger.debug(`[Message Events] Unsubscribed from ${channel}`, {
        totalListeners: this.listenerCount(channel),
      });
    };
  }

  public incrementConnections(roomId: string): void {
    const current = this.activeConnections.get(roomId) || 0;
    this.activeConnections.set(roomId, current + 1);
    logger.debug(
      `[Message Events] Active connections for room ${roomId}: ${current + 1}`,
    );
  }

  public decrementConnections(roomId: string): void {
    const current = this.activeConnections.get(roomId) || 0;
    const newCount = Math.max(0, current - 1);
    if (newCount === 0) {
      this.activeConnections.delete(roomId);
    } else {
      this.activeConnections.set(roomId, newCount);
    }
    logger.debug(
      `[Message Events] Active connections for room ${roomId}: ${newCount}`,
    );
  }

  private getListenerId(
    channel: string,
    handler: (event: MessageEvent) => void,
  ): string {
    return `${channel}:${handler.toString().substring(0, 50)}`;
  }

  private cleanupStaleListeners(): void {
    const now = Date.now();
    let removed = 0;

    for (const [listenerId, metadata] of this.listenerMetadata.entries()) {
      if (now - metadata.lastActivity > this.STALE_THRESHOLD) {
        this.listenerMetadata.delete(listenerId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(
        `[Message Events] Cleaned up ${removed} stale listener(s), ${this.listenerMetadata.size} active`,
      );
    }
  }

  public getStats(): {
    totalRooms: number;
    totalConnections: number;
    rooms: Array<{ id: string; connections: number }>;
  } {
    const rooms = Array.from(this.activeConnections.entries()).map(
      ([id, connections]) => ({
        id,
        connections,
      }),
    );

    const totalConnections = rooms.reduce(
      (sum, room) => sum + room.connections,
      0,
    );

    return {
      totalRooms: rooms.length,
      totalConnections,
      rooms,
    };
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
    this.listenerMetadata.clear();
    this.activeConnections.clear();
  }
}

export const messageEventEmitter = MessageEventEmitter.getInstance();
