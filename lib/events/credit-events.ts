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

class CreditEventEmitter extends EventEmitter {
  private static instance: CreditEventEmitter;
  private activeConnections = new Map<string, number>();

  private constructor() {
    super();
    this.setMaxListeners(1000);
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
    this.emit(channel, event);
  }

  public subscribeToCreditUpdates(
    organizationId: string,
    handler: (event: CreditUpdateEvent) => void
  ): () => void {
    const channel = `credits:${organizationId}`;
    this.on(channel, handler);

    return () => {
      this.off(channel, handler);
    };
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
}

export const creditEventEmitter = CreditEventEmitter.getInstance();
