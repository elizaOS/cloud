/**
 * Redis-backed knowledge processing event emitter.
 * Uses Redis queues to push real-time updates to connected clients via SSE.
 */

import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";

export type KnowledgeEventType =
  | "processing_started"
  | "processing_progress"
  | "processing_completed"
  | "processing_failed";

export interface KnowledgeEvent {
  type: KnowledgeEventType;
  characterId: string;
  organizationId: string;
  jobId: string;
  filename: string;
  data: {
    status: "pending" | "in_progress" | "completed" | "failed";
    totalFiles?: number;
    processedFiles?: number;
    completedCount?: number;
    failedCount?: number;
    error?: string;
    fragmentCount?: number;
    documentId?: string;
  };
  timestamp: string;
}

interface RawKnowledgeEvent extends Omit<KnowledgeEvent, "timestamp"> {
  timestamp: string;
}

function isValidKnowledgeEvent(value: unknown): value is RawKnowledgeEvent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    typeof obj.characterId === "string" &&
    typeof obj.organizationId === "string" &&
    typeof obj.jobId === "string" &&
    typeof obj.filename === "string" &&
    typeof obj.data === "object" &&
    typeof obj.timestamp === "string"
  );
}

/**
 * Redis-backed knowledge event emitter for distributed environments.
 */
class KnowledgeEventEmitter {
  private static instance: KnowledgeEventEmitter;
  private redis: Redis | null = null;
  private enabled = false;

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

  public static getInstance(): KnowledgeEventEmitter {
    if (!KnowledgeEventEmitter.instance) {
      KnowledgeEventEmitter.instance = new KnowledgeEventEmitter();
    }
    return KnowledgeEventEmitter.instance;
  }

  /**
   * Build channel name for knowledge events.
   * Format: knowledge:events:{characterId}:queue
   */
  private buildChannelName(characterId: string): string {
    return `knowledge:events:${characterId}:queue`;
  }

  /**
   * Emit a knowledge processing event.
   */
  async emit(event: Omit<KnowledgeEvent, "timestamp">): Promise<void> {
    if (!this.enabled || !this.redis) {
      logger.debug("[KnowledgeEvents] Redis not enabled, skipping event emit");
      return;
    }

    const channel = this.buildChannelName(event.characterId);
    const fullEvent: KnowledgeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    await this.redis.rpush(channel, JSON.stringify(fullEvent));
    // Events expire after 5 minutes
    await this.redis.expire(channel, 300);

    logger.debug("[KnowledgeEvents] Emitted event", {
      type: event.type,
      characterId: event.characterId,
      jobId: event.jobId,
    });
  }

  /**
   * Emit processing started event.
   */
  async emitProcessingStarted(params: {
    characterId: string;
    organizationId: string;
    jobId: string;
    filename: string;
    totalFiles?: number;
  }): Promise<void> {
    await this.emit({
      type: "processing_started",
      characterId: params.characterId,
      organizationId: params.organizationId,
      jobId: params.jobId,
      filename: params.filename,
      data: {
        status: "in_progress",
        totalFiles: params.totalFiles,
      },
    });
  }

  /**
   * Emit processing completed event.
   */
  async emitProcessingCompleted(params: {
    characterId: string;
    organizationId: string;
    jobId: string;
    filename: string;
    fragmentCount: number;
    documentId: string;
    completedCount?: number;
    totalFiles?: number;
  }): Promise<void> {
    await this.emit({
      type: "processing_completed",
      characterId: params.characterId,
      organizationId: params.organizationId,
      jobId: params.jobId,
      filename: params.filename,
      data: {
        status: "completed",
        fragmentCount: params.fragmentCount,
        documentId: params.documentId,
        completedCount: params.completedCount,
        totalFiles: params.totalFiles,
      },
    });
  }

  /**
   * Emit processing failed event.
   */
  async emitProcessingFailed(params: {
    characterId: string;
    organizationId: string;
    jobId: string;
    filename: string;
    error: string;
    failedCount?: number;
    totalFiles?: number;
  }): Promise<void> {
    await this.emit({
      type: "processing_failed",
      characterId: params.characterId,
      organizationId: params.organizationId,
      jobId: params.jobId,
      filename: params.filename,
      data: {
        status: "failed",
        error: params.error,
        failedCount: params.failedCount,
        totalFiles: params.totalFiles,
      },
    });
  }

  /**
   * Poll for events on a channel.
   * Returns all queued events and clears the queue.
   */
  async pollEvents(characterId: string): Promise<KnowledgeEvent[]> {
    if (!this.enabled || !this.redis) {
      return [];
    }

    const channel = this.buildChannelName(characterId);
    const messages = await this.redis.lrange(channel, 0, -1);

    if (!messages || messages.length === 0) {
      return [];
    }

    // Clear the queue after reading
    await this.redis.del(channel);

    const events: KnowledgeEvent[] = [];
    for (const message of messages) {
      const parsed =
        typeof message === "string" ? JSON.parse(message) : message;
      if (isValidKnowledgeEvent(parsed)) {
        events.push(parsed);
      }
    }

    return events;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const knowledgeEventEmitter = KnowledgeEventEmitter.getInstance();

